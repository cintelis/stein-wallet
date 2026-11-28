// Assets other than STEIN: tokens, and what a pool will pay for a swap.
//
// Everything here is arithmetic on whole base units, as the chain does it
// (SPEC §4.6, §4.7). No floating point: a price shown to a person is derived
// from the same integers the chain will use.

/** How STEIN is named where an asset is asked for; anything else is a token's address. */
export const STEIN = 'stein';
export const STEIN_DECIMALS = 9;

/** What an account holds of one token, as the node reports it. */
export interface Holding {
  /** The token's address. */
  asset: string;
  symbol: string;
  decimals: number;
  /** True for a pool's shares, which are held like a token. */
  pool_shares: boolean;
  /** Base units, as a decimal string. */
  balance: string;
}

/** A liquidity pool, as the node reports it. */
export interface Pool {
  address: string;
  asset_a: string;
  asset_b: string;
  symbol_a: string;
  symbol_b: string;
  decimals_a: number;
  decimals_b: number;
  /** Base units, as decimal strings. */
  reserve_a: string;
  reserve_b: string;
  fee_per_mille: number;
}

/** Parses "12.5" into base units of an asset with `decimals` places. Null if it is not a valid amount. */
export function parseUnits(text: string, decimals: number): bigint | null {
  const match = /^(\d{1,30})(?:\.(\d*))?$/.exec(text.trim());
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
}

/** Formats base units with `decimals` places, without trailing zeros. */
export function formatUnits(amount: bigint, decimals: number): string {
  const one = 10n ** BigInt(decimals);
  const whole = (amount / one).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = decimals
    ? (amount % one).toString().padStart(decimals, '0').replace(/0+$/, '')
    : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * What a pool pays for `amountIn`, by the chain's own formula: the fee is
 * taken from what is paid, rounded up, and the result is rounded down.
 */
export function quote(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feePerMille = 3n): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const fee = (amountIn * feePerMille + 999n) / 1000n;
  const net = amountIn - fee;
  if (net <= 0n) return 0n;
  return (net * reserveOut) / (reserveIn + net);
}

/** The least to accept: `expected` less `bps` hundredths of a percent, and never nothing. */
export function leastOut(expected: bigint, bps: number): bigint {
  const least = (expected * BigInt(10_000 - bps)) / 10_000n;
  return least > 0n ? least : 1n;
}

/** The pool that trades these two assets, and its reserves in the order asked. Null if there is none. */
export function poolFor(
  pools: Pool[],
  assetIn: string,
  assetOut: string,
): { pool: Pool; reserveIn: bigint; reserveOut: bigint } | null {
  for (const pool of pools) {
    if (pool.asset_a === assetIn && pool.asset_b === assetOut) {
      return { pool, reserveIn: BigInt(pool.reserve_a), reserveOut: BigInt(pool.reserve_b) };
    }
    if (pool.asset_b === assetIn && pool.asset_a === assetOut) {
      return { pool, reserveIn: BigInt(pool.reserve_b), reserveOut: BigInt(pool.reserve_a) };
    }
  }
  return null;
}

/** An asset to choose from: STEIN, or a token. */
export interface AssetChoice {
  /** `STEIN` or the token's address. */
  asset: string;
  symbol: string;
  decimals: number;
}

export const STEIN_CHOICE: AssetChoice = { asset: STEIN, symbol: 'STEIN', decimals: STEIN_DECIMALS };

/** Every asset that has a pool, STEIN first, each once. */
export function tradable(pools: Pool[]): AssetChoice[] {
  const seen = new Map<string, AssetChoice>();
  for (const p of pools) {
    seen.set(p.asset_a, { asset: p.asset_a, symbol: p.symbol_a, decimals: p.decimals_a });
    seen.set(p.asset_b, { asset: p.asset_b, symbol: p.symbol_b, decimals: p.decimals_b });
  }
  const rest = [...seen.values()].filter((a) => a.asset !== STEIN);
  return seen.has(STEIN) ? [STEIN_CHOICE, ...rest] : rest;
}

const HEADER_BYTES = 1 + 8 + 32 + 8 + 16 + 8;
const KEY_BYTES = 1 + 897;
const SIGNATURE_BYTES = 1 + 666;
const assetBytes = (asset: string) => (asset === STEIN ? 1 : 33);

/** Encoded size of a transaction, which is what its fee is charged on. */
export function txBytes(
  action:
    | { kind: 'transfer' }
    | { kind: 'transfer_token' }
    | { kind: 'swap'; assetIn: string; assetOut: string },
  registersKey: boolean,
): number {
  const body =
    action.kind === 'transfer'
      ? 1 + 32 + 16
      : action.kind === 'transfer_token'
        ? 1 + 32 + 32 + 16
        : 1 + assetBytes(action.assetIn) + 16 + assetBytes(action.assetOut) + 16;
  return HEADER_BYTES + body + 1 + (registersKey ? KEY_BYTES : 0) + SIGNATURE_BYTES;
}

/**
 * What to call each asset in a short list: its symbol, and for symbols that
 * two of them share, enough of the address to tell them apart.
 */
export function names(choices: AssetChoice[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const c of choices) count.set(c.symbol, (count.get(c.symbol) ?? 0) + 1);
  return new Map(
    choices.map((c) => [
      c.asset,
      c.asset !== STEIN && (count.get(c.symbol) ?? 0) > 1 ? `${c.symbol} ${c.asset.slice(2, 8)}` : c.symbol,
    ]),
  );
}

/** A token's address, shortened for a label. Symbols are not unique; the address is what identifies it. */
export const shortAsset = (asset: string) => (asset === STEIN ? '' : `${asset.slice(0, 8)}…${asset.slice(-4)}`);
