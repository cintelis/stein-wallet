'use client';

// Four tiles: the account's balance and activity, the network, and what a
// transfer costs right now.

import { formatStein, transferFee, TRANSFER_BYTES } from '@/lib/stein/amount';
import { NETWORKS } from '@/lib/stein/rpc';
import { useWallet } from './WalletContext';
import { ui } from './util';

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5">
      <div className={ui.label}>{label}</div>
      {children}
    </div>
  );
}

const big = 'mt-1.5 text-xl font-semibold tabular-nums';
const small = 'mt-1 text-xs tabular-nums text-slate-500';

export default function StatStrip() {
  const { address, account, status, network, setNetwork, networkError } = useWallet();
  const balance = address && account ? BigInt(account.balance) : null;
  const fee = status ? transferFee(BigInt(status.min_fee_per_byte), false) : null;

  return (
    <section aria-label="Account and network" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile label="Balance">
        <div className="flex items-baseline gap-1.5">
          <span className={`${big} ${balance ? 'text-slate-50' : 'text-slate-600'}`}>
            {balance !== null ? formatStein(balance) : '—'}
          </span>
          <span className="text-xs text-slate-500">STEIN</span>
        </div>
        <div className={small}>{address ? 'On this network' : 'No wallet yet'}</div>
      </Tile>

      <Tile label="Transactions sent">
        <div className={`${big} ${account?.nonce ? 'text-slate-50' : 'text-slate-600'}`}>
          {address && account ? account.nonce.toLocaleString('en-US') : '—'}
        </div>
        {/* An address is a fingerprint of the public key. The chain learns the
            key itself from the account's first transaction, which carries it. */}
        <div
          className={small}
          title={
            address && account && !account.key_registered
              ? 'You can receive STEIN already. Your first transfer carries your public key to the chain, so it is a little larger; later ones are smaller.'
              : undefined
          }
        >
          {address && account
            ? account.key_registered
              ? 'Key registered on chain'
              : 'Your first send registers your key'
            : ' '}
        </div>
      </Tile>

      <Tile label="Network">
        <select
          value={network.key}
          onChange={(e) => setNetwork(e.target.value)}
          aria-label="Network"
          className={`${ui.select} mt-1.5 w-full`}
        >
          {NETWORKS.map((n) => (
            <option key={n.key} value={n.key}>
              {n.label}
            </option>
          ))}
        </select>
        <div
          className={`${small} ${networkError ? 'text-amber-400/90' : ''}`}
          title={networkError ?? undefined}
        >
          {networkError
            ? 'Cannot reach the network'
            : status
              ? `Chain ${status.chain_id} · block ${status.height.toLocaleString('en-US')}`
              : 'Connecting…'}
        </div>
      </Tile>

      <Tile label="Transfer fee">
        <div className="flex items-baseline gap-1.5">
          <span className={`${big} ${fee !== null ? 'text-slate-50' : 'text-slate-600'}`}>
            {fee !== null ? formatStein(fee) : '—'}
          </span>
          <span className="text-xs text-slate-500">STEIN</span>
        </div>
        <div className={small}>{TRANSFER_BYTES.later} bytes per transfer</div>
      </Tile>
    </section>
  );
}
