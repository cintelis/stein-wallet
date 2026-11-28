// What one transaction in an account's history was, in words, for the
// activity list. Pure: the node's record in, a label and amounts out.

import { STEIN, STEIN_DECIMALS, formatUnits, type AssetChoice } from './assets.ts';

/** A transaction as the node lists it for an account. Only what is read here. */
export interface Listed {
  sender: string;
  to: string;
  /** STEIN moved, in base units. Zero for a token transfer. */
  amount: string;
  kind?: string;
  action?: {
    token?: string;
    amount?: string;
    asset_in?: string;
    amount_in?: string;
    asset_out?: string;
    symbol?: string;
  };
  outcome?: { result?: string; amount_out?: string };
}

export interface Described {
  /** "Sent", "Received", "Swapped"… */
  title: string;
  /** The other party, if there is one worth naming. */
  other: string | null;
  /** "to" or "from", for `other`. */
  direction: 'to' | 'from' | null;
  /** What moved, already formatted: "−12.5", "+3". Empty if nothing to show. */
  amount: string;
  /** The asset's symbol, for `amount`. */
  symbol: string;
  /** A second line under the title, if there is more to say. */
  note: string | null;
  tone: 'in' | 'out' | 'neutral';
}

/** Looks an asset up among those the wallet knows; an unknown token keeps its base units. */
function show(amount: string | undefined, asset: string | undefined, known: AssetChoice[]) {
  const units = BigInt(amount ?? '0');
  if (!asset || asset === STEIN) return { text: formatUnits(units, STEIN_DECIMALS), symbol: 'STEIN' };
  const found = known.find((k) => k.asset === asset);
  return found
    ? { text: formatUnits(units, found.decimals), symbol: found.symbol }
    : { text: units.toLocaleString('en-US'), symbol: 'base units of a token' };
}

const KINDS: Record<string, string> = {
  issue_token: 'Issued a token',
  add_liquidity: 'Added liquidity',
  remove_liquidity: 'Removed liquidity',
};

/** Describes `tx` as the holder of `address` sees it. */
export function describe(tx: Listed, address: string, known: AssetChoice[]): Described {
  const out = tx.sender === address;
  const kind = tx.kind ?? 'transfer';

  if (kind === 'swap') {
    const paid = show(tx.action?.amount_in, tx.action?.asset_in, known);
    if (tx.outcome?.result === 'swapped') {
      const got = show(tx.outcome.amount_out, tx.action?.asset_out, known);
      return {
        title: 'Swapped',
        other: null,
        direction: null,
        amount: `+${got.text}`,
        symbol: got.symbol,
        note: `for ${paid.text} ${paid.symbol}`,
        tone: 'in',
      };
    }
    return {
      title: 'Swap not filled',
      other: null,
      direction: null,
      amount: '',
      symbol: '',
      note: `The pool returned your ${paid.text} ${paid.symbol}. The fee was still paid.`,
      tone: 'neutral',
    };
  }

  if (kind === 'transfer' || kind === 'transfer_token') {
    const moved =
      kind === 'transfer' ? show(tx.amount, STEIN, known) : show(tx.action?.amount, tx.action?.token, known);
    const self = out && tx.to === address;
    return {
      title: self ? 'Sent to yourself' : out ? 'Sent' : 'Received',
      other: self ? null : out ? tx.to : tx.sender,
      direction: self ? null : out ? 'to' : 'from',
      amount: `${self ? '' : out ? '−' : '+'}${moved.text}`,
      symbol: moved.symbol,
      note: null,
      tone: self ? 'neutral' : out ? 'out' : 'in',
    };
  }

  return {
    title: KINDS[kind] ?? kind.replace(/_/g, ' '),
    other: null,
    direction: null,
    amount: '',
    symbol: tx.action?.symbol ?? '',
    note: null,
    tone: 'neutral',
  };
}
