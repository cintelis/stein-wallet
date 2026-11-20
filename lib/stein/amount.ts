// STEIN amounts. On chain an amount is an integer count of base units;
// 1 STEIN = 10^9 base units. Never a floating-point number.

export const DECIMALS = 9;
export const ONE_STEIN = 1_000_000_000n;

/** Encoded size of a transfer from an FN-DSA account: what the fee is charged on. */
export const TRANSFER_BYTES = { first: 1688, later: 790 } as const;

/** Parses "12.5" into base units. Null if it is not a valid amount. */
export function parseStein(text: string): bigint | null {
  const match = /^(\d{1,28})(?:\.(\d{0,9}))?$/.exec(text.trim());
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(DECIMALS, '0'));
  return whole * ONE_STEIN + fraction;
}

/** Formats base units as STEIN, without trailing zeros. */
export function formatStein(amount: bigint): string {
  const whole = amount / ONE_STEIN;
  const fraction = (amount % ONE_STEIN).toString().padStart(DECIMALS, '0').replace(/0+$/, '');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** The minimum fee for a transfer, in base units. */
export function transferFee(minFeePerByte: bigint, registersKey: boolean): bigint {
  return minFeePerByte * BigInt(registersKey ? TRANSFER_BYTES.first : TRANSFER_BYTES.later);
}
