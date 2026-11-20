// The Stein node RPC, with failover across a network's endpoints. Never
// depend on one endpoint: a follower serves reads and forwards transactions
// when the validator's tunnel is down.

export interface Network {
  key: string;
  label: string;
  /** Tried in order. */
  endpoints: string[];
  /** Block explorer base URL, if the network has one. */
  explorer?: string;
}

export const NETWORKS: Network[] = [
  {
    key: 'devnet',
    label: 'Stein devnet',
    endpoints: ['https://rpc.steinchain.com', 'https://stein-follower.nick-598.workers.dev'],
    explorer: 'https://steinscan.io',
  },
  {
    key: 'local',
    label: 'Local node (127.0.0.1:8645)',
    endpoints: ['http://127.0.0.1:8645'],
  },
];

export interface Status {
  chain_id: number;
  genesis_hash: string;
  height: number;
  /** Base units per encoded byte. */
  min_fee_per_byte: number;
  max_tx_ttl_blocks: number;
  role: string;
  sync_error: string | null;
  tx_schemes: string[];
  block_time_ms: number;
}

export interface Account {
  address: string;
  /** Base units, as a decimal string. */
  balance: string;
  nonce: number;
  key_registered: boolean;
}

export interface TxView {
  id: string;
  sender: string;
  to: string;
  /** Base units, as a decimal string. */
  amount: string;
  fee: string;
  nonce: number;
  scheme: string;
  registers_key: boolean;
  size: number;
  height: number;
}

/** A node answered and refused the request. Retrying elsewhere will not help. */
export class Rejected extends Error {}

async function request<T>(network: Network, path: string, init?: RequestInit): Promise<T> {
  let last: unknown = new Error('no endpoint configured');
  for (const endpoint of network.endpoints) {
    let response: Response;
    try {
      response = await fetch(`${endpoint}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      last = e;
      continue;
    }
    if (response.ok) return (await response.json()) as T;
    const text = await response.text();
    let message = text.slice(0, 200) || `HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // not JSON: keep the text
    }
    // 4xx is the node's verdict on the request; 5xx is the endpoint's trouble.
    if (response.status < 500) throw new Rejected(message);
    last = new Error(message);
  }
  throw new Error(
    `Cannot reach ${network.label}: ${last instanceof Error ? last.message : String(last)}`,
  );
}

export const getStatus = (network: Network) => request<Status>(network, '/status');

export const getAccount = (network: Network, address: string) =>
  request<Account>(network, `/account/${address}`);

export const getAccountTxs = (network: Network, address: string) =>
  request<TxView[]>(network, `/account/${address}/txs`);

/** Whether a submitted transaction is in a block yet, and at which height. */
export async function getTxHeight(network: Network, id: string): Promise<number | null> {
  try {
    const state = await request<{ status: string; height?: number }>(network, `/tx/${id}`);
    return state.status === 'included' ? (state.height ?? null) : null;
  } catch (e) {
    if (e instanceof Rejected) return null;
    throw e;
  }
}

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Submits a signed transaction. Throws `Rejected` with the node's reason. */
export async function submit(network: Network, raw: Uint8Array): Promise<void> {
  await request<unknown>(network, '/tx', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ raw: toHex(raw) }),
  });
}
