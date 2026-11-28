'use client';

// The wallet's state: the signing core, the stored key, the chosen network,
// and what the chain says about the account. One provider at the root.
//
// The seed is in memory only while the wallet is unlocked, and only here. A
// reload locks the wallet.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { STEIN, txBytes, type Pool } from '@/lib/stein/assets';
import { loadCore, type Core, type SignedTransfer, type TransferRequest } from '@/lib/stein/core.mjs';
import { inboxPublicKey, inboxSeed } from '@/lib/stein/inbox.mjs';
import {
  deleteVault,
  loadVault,
  newSeed,
  open,
  parseSeedFile,
  saveVault,
  seal,
  seedFileText,
  SCHEME,
  type Vault,
} from '@/lib/stein/keystore';
import {
  getAccount,
  getAccountTxs,
  getBlockTime,
  getPools,
  getStatus,
  getTxState,
  NETWORKS,
  submit,
  type Account,
  type Outcome,
  type Network,
  type Status,
  type TxView,
} from '@/lib/stein/rpc';
import { statementFor, type Answer, type SignRequest } from '@/lib/stein/statement';
import { readDeliveries, recordDelivery, type Deliveries } from '@/lib/stein/time';

const NETWORK_KEY = 'stein-wallet:network';
const POLL_MS = 8_000;

/** What every transaction carries, as the signing core takes it. */
type Common = Omit<TransferRequest, 'to' | 'amount'>;

export interface Sent {
  /** "send" or "swap": which panel shows it. */
  what: 'send' | 'swap';
  id: string;
  size: number;
  fee: bigint;
  /** Height of the block that included it, once known. */
  height: number | null;
  /** When it was sent, by this device's clock. */
  sentAt: number;
  /** Milliseconds from sending until this wallet saw it in a block, once known. */
  tookMs: number | null;
  /** For a swap, once it is in a block: what the pool did. */
  outcome: Outcome | null;
}

interface WalletState {
  /** False until the signing core and the stored wallet have loaded. */
  ready: boolean;
  /** Set if the signing core could not load. */
  coreError: string | null;
  /** The wallet's address, if this browser holds a wallet. */
  address: string | null;
  unlocked: boolean;
  /** False until the user has saved a backup of the seed. */
  backedUp: boolean;
  network: Network;
  setNetwork: (key: string) => void;
  status: Status | null;
  account: Account | null;
  txs: TxView[];
  /** The network's liquidity pools. */
  pools: Pool[];
  /** For transfers sent from this browser: milliseconds from sending to being seen in a block. */
  deliveries: Deliveries;
  /** When each block in the activity list was made, by height. */
  blockTimes: Record<number, number>;
  /** Why the network could not be read, if it could not. */
  networkError: string | null;
  refresh: () => Promise<void>;
  /** Checks an address; returns a message if it is not valid. */
  checkAddress: (text: string) => string | null;
  create: (passphrase: string) => Promise<void>;
  importSeed: (seedFile: string, passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  /** Removes the wallet from this browser. */
  forget: () => void;
  /** The seed-file text, for a backup. Requires an unlocked wallet. */
  backupText: () => string;
  markBackedUp: () => void;
  /** Sends STEIN. */
  send: (to: string, amount: bigint) => Promise<Sent>;
  /** Sends a token, or a pool's shares. */
  sendToken: (token: string, to: string, amount: bigint) => Promise<Sent>;
  /** Trades through a pool. If it would pay less than `minOut`, the pool returns what was paid. */
  swap: (assetIn: string, amountIn: bigint, assetOut: string, minOut: bigint) => Promise<Sent>;
  /**
   * What steinchain.com asked for: a signed statement (never a transaction),
   * or this account's inbox key.
   */
  answer: (request: SignRequest) => Promise<Answer>;
  /** The most recent transfer sent in this session. */
  lastSent: Sent | null;
}

const Context = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const state = useContext(Context);
  if (!state) throw new Error('useWallet must be used under WalletProvider');
  return state;
}

export default function WalletProvider({ children }: { children: React.ReactNode }) {
  const [core, setCore] = useState<Core | null>(null);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [vault, setVault] = useState<Vault | null>(null);
  const [loaded, setLoaded] = useState(false);
  const seed = useRef<Uint8Array | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [network, setNetworkState] = useState<Network>(NETWORKS[0]);
  const [status, setStatus] = useState<Status | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [txs, setTxs] = useState<TxView[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [deliveries, setDeliveries] = useState<Deliveries>({});
  const [blockTimes, setBlockTimes] = useState<Record<number, number>>({});
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<Sent | null>(null);

  useEffect(() => {
    setVault(loadVault());
    const saved = localStorage.getItem(NETWORK_KEY);
    setNetworkState(NETWORKS.find((n) => n.key === saved) ?? NETWORKS[0]);
    setLoaded(true);
    fetch('/stein_wallet_core.wasm')
      .then(loadCore)
      .then(setCore)
      .catch((e: unknown) =>
        setCoreError(e instanceof Error ? e.message : 'The signing core did not load.'),
      );
  }, []);

  const address = vault?.address ?? null;

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextAccount, nextTxs, nextPools] = await Promise.all([
        getStatus(network),
        address ? getAccount(network, address) : Promise.resolve(null),
        address ? getAccountTxs(network, address) : Promise.resolve([]),
        getPools(network),
      ]);
      setStatus(nextStatus);
      setAccount(nextAccount);
      setTxs(nextTxs);
      setPools(nextPools);
      setNetworkError(null);
    } catch (e) {
      setNetworkError(e instanceof Error ? e.message : 'The network could not be read.');
    }
  }, [network, address]);

  // Poll while the page is visible, and at once when it becomes visible.
  useEffect(() => {
    if (!loaded) return;
    setStatus(null);
    setAccount(null);
    setTxs([]);
    setPools([]);
    // Heights mean other blocks on another network.
    setBlockTimes({});
    setDeliveries(readDeliveries(localStorage));
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loaded, refresh]);

  const setNetwork = useCallback((key: string) => {
    const next = NETWORKS.find((n) => n.key === key);
    if (!next) return;
    localStorage.setItem(NETWORK_KEY, key);
    setLastSent(null);
    setNetworkState(next);
  }, []);

  const adopt = useCallback(
    async (newSeedBytes: Uint8Array, passphrase: string, backedUp: boolean) => {
      if (!core) throw new Error('The signing core has not loaded yet.');
      const next = await seal(newSeedBytes, core.addressFromSeed(newSeedBytes), passphrase, backedUp);
      saveVault(next);
      seed.current = newSeedBytes;
      setVault(next);
      setUnlocked(true);
      setLastSent(null);
    },
    [core],
  );

  const create = useCallback(
    (passphrase: string) => adopt(newSeed(), passphrase, false),
    [adopt],
  );

  const importSeed = useCallback(
    // An imported seed came from a file the user already has.
    (seedFile: string, passphrase: string) => adopt(parseSeedFile(seedFile), passphrase, true),
    [adopt],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!vault) throw new Error('There is no wallet in this browser.');
      seed.current = await open(vault, passphrase);
      setUnlocked(true);
    },
    [vault],
  );

  const lock = useCallback(() => {
    seed.current?.fill(0);
    seed.current = null;
    setUnlocked(false);
  }, []);

  const forget = useCallback(() => {
    lock();
    deleteVault();
    setVault(null);
    setAccount(null);
    setTxs([]);
    setLastSent(null);
  }, [lock]);

  const backupText = useCallback(() => {
    if (!seed.current) throw new Error('Unlock the wallet first.');
    return seedFileText(seed.current);
  }, []);

  const markBackedUp = useCallback(() => {
    setVault((current) => {
      if (!current || current.backedUp) return current;
      const next = { ...current, backedUp: true };
      saveVault(next);
      return next;
    });
  }, []);

  const checkAddress = useCallback(
    (text: string) => {
      if (!core) return 'The signing core has not loaded yet.';
      try {
        core.decodeAddress(text);
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : 'Not a valid address.';
      }
    },
    [core],
  );

  /**
   * Signs and submits one transaction. `needs` is what the account must hold
   * besides the fee, as (asset, base units); `bytes` its encoded size given
   * whether it carries the key; `sign` makes it.
   */
  const transact = useCallback(
    async (
      what: Sent['what'],
      needs: { asset: string; amount: bigint },
      bytes: (registersKey: boolean) => number,
      sign: (core: Core, common: Common) => SignedTransfer,
    ): Promise<Sent> => {
      if (!core || !seed.current || !address) throw new Error('Unlock the wallet first.');
      // Read the chain afresh: the nonce and height must be current.
      const [nowStatus, nowAccount] = await Promise.all([
        getStatus(network),
        getAccount(network, address),
      ]);
      if (!nowStatus.tx_schemes.includes(SCHEME)) {
        throw new Error(`${network.label} does not accept ${SCHEME} accounts.`);
      }
      const registerKey = !nowAccount.key_registered;
      const minFeePerByte = BigInt(nowStatus.min_fee_per_byte);
      const fee = minFeePerByte * BigInt(bytes(registerKey));
      const balance = BigInt(nowAccount.balance);
      if (needs.asset === STEIN) {
        if (balance < needs.amount + fee) {
          throw new Error('The balance does not cover the amount plus the fee.');
        }
      } else {
        const held = BigInt(nowAccount.holdings?.find((h) => h.asset === needs.asset)?.balance ?? '0');
        if (held < needs.amount) throw new Error('You do not hold that much of the token.');
        if (balance < fee) throw new Error('The STEIN balance does not cover the fee.');
      }
      const tx = sign(core, {
        seed: seed.current,
        chainId: BigInt(nowStatus.chain_id),
        nonce: BigInt(nowAccount.nonce),
        expiresAt: BigInt(nowStatus.height) + BigInt(nowStatus.max_tx_ttl_blocks) / 2n,
        minFeePerByte,
        registerKey,
      });
      const sentAt = Date.now();
      await submit(network, tx.raw);
      const sent: Sent = {
        what,
        id: tx.id,
        size: tx.raw.length,
        fee: tx.fee,
        height: null,
        sentAt,
        tookMs: null,
        outcome: null,
      };
      setLastSent(sent);
      void refresh();
      return sent;
    },
    [core, address, network, refresh],
  );

  const send = useCallback(
    (to: string, amount: bigint) =>
      transact(
        'send',
        { asset: STEIN, amount },
        (registersKey) => txBytes({ kind: 'transfer' }, registersKey),
        (c, common) => c.signTransfer({ ...common, to, amount }),
      ),
    [transact],
  );

  const sendToken = useCallback(
    (token: string, to: string, amount: bigint) =>
      transact(
        'send',
        { asset: token, amount },
        (registersKey) => txBytes({ kind: 'transfer_token' }, registersKey),
        (c, common) => c.signTokenTransfer({ ...common, token, to, amount }),
      ),
    [transact],
  );

  const swap = useCallback(
    (assetIn: string, amountIn: bigint, assetOut: string, minOut: bigint) =>
      transact(
        'swap',
        { asset: assetIn, amount: amountIn },
        (registersKey) => txBytes({ kind: 'swap', assetIn, assetOut }, registersKey),
        (c, common) => c.signSwap({ ...common, assetIn, amountIn, assetOut, minOut }),
      ),
    [transact],
  );

  const answer = useCallback(
    async (request: SignRequest): Promise<Answer> => {
      if (!core || !seed.current || !address) throw new Error('Unlock the wallet first.');
      const opens = await inboxSeed(seed.current);
      if (request.kind === 'open') return { inboxSeed: opens, address };
      const inboxKey = inboxPublicKey(opens);
      opens.fill(0);
      const statement = statementFor(request, core.decodeAddress(address), inboxKey);
      const signed = core.signStatement({ seed: seed.current, ...statement });
      return request.kind === 'inbox' ? { ...signed, inboxKey } : signed;
    },
    [core, address],
  );

  // Follow the last transfer until a block includes it.
  useEffect(() => {
    if (!lastSent || lastSent.height !== null) return;
    let stop = false;
    const id = setInterval(async () => {
      try {
        const state = await getTxState(network, lastSent.id);
        if (stop || state === null) return;
        const { height, outcome } = state;
        // From sending until now, when this wallet first sees it in a block:
        // what the person waited, the trip to the node and back included.
        const tookMs = Date.now() - lastSent.sentAt;
        setDeliveries(recordDelivery(localStorage, lastSent.id, tookMs));
        setLastSent((current) =>
          current && current.id === lastSent.id ? { ...current, height, tookMs, outcome } : current,
        );
        void refresh();
      } catch {
        // try again on the next tick
      }
    }, 500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [lastSent, network, refresh]);

  // When each block in the activity list was made. A block's time never
  // changes, so each is asked for once.
  useEffect(() => {
    const missing = [...new Set(txs.map((tx) => tx.height))].filter((h) => !(h in blockTimes));
    if (missing.length === 0) return;
    let stop = false;
    void (async () => {
      for (const height of missing.slice(0, 12)) {
        try {
          const time = await getBlockTime(network, height);
          if (stop) return;
          if (time !== null) setBlockTimes((known) => ({ ...known, [height]: time }));
        } catch {
          return; // the node is unreachable: the list shows without times
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [txs, network, blockTimes]);

  const value = useMemo<WalletState>(
    () => ({
      ready: loaded && (core !== null || coreError !== null),
      coreError,
      address,
      unlocked,
      backedUp: vault?.backedUp ?? true,
      network,
      setNetwork,
      status,
      account,
      txs,
      pools,
      deliveries,
      blockTimes,
      networkError,
      refresh,
      checkAddress,
      create,
      importSeed,
      unlock,
      lock,
      forget,
      backupText,
      markBackedUp,
      send,
      sendToken,
      swap,
      answer,
      lastSent,
    }),
    [
      loaded,
      core,
      coreError,
      address,
      unlocked,
      vault,
      network,
      setNetwork,
      status,
      account,
      txs,
      pools,
      deliveries,
      blockTimes,
      networkError,
      refresh,
      checkAddress,
      create,
      importSeed,
      unlock,
      lock,
      forget,
      backupText,
      markBackedUp,
      send,
      sendToken,
      swap,
      answer,
      lastSent,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}
