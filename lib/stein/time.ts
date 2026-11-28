// How long a transfer took, and how long ago a block was made, in words; and
// the record of the first, kept in this browser.
//
// The chain records when a block was made, not when a transaction was sent.
// So "how long it took" exists only for transfers sent from this wallet: the
// wallet notes the moment it sends, and the moment it sees the transfer in a
// block.

/** `ms` as a short duration: "0.8 s", "12 s", "2 min 5 s". */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, ms) / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} s`;
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const whole = Math.round(seconds);
  const rest = whole % 60;
  return rest === 0 ? `${whole / 60} min` : `${Math.floor(whole / 60)} min ${rest} s`;
}

/** How long before `now` the moment `then` was: "just now", "3 min ago", "2 h ago", "5 d ago". */
export function ago(then: number, now: number): string {
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} d ago`;
}

const KEY = 'stein-wallet:delivery';
/** Most transfers remembered. The oldest are dropped first. */
const KEEP = 200;

/** Transaction id to milliseconds from sending to being seen in a block. */
export type Deliveries = Record<string, number>;

/** The record kept in this browser. Empty if there is none, or it cannot be read. */
export function readDeliveries(storage: Pick<Storage, 'getItem'>): Deliveries {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: Deliveries = {};
    for (const [id, ms] of Object.entries(parsed)) {
      if (/^[0-9a-f]{64}$/.test(id) && typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) {
        out[id] = ms;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Adds one transfer to the record and saves it. Returns the new record. */
export function recordDelivery(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string,
  ms: number,
): Deliveries {
  const entries = Object.entries({ ...readDeliveries(storage), [id]: Math.max(0, Math.round(ms)) });
  const kept = Object.fromEntries(entries.slice(Math.max(0, entries.length - KEEP)));
  try {
    storage.setItem(KEY, JSON.stringify(kept));
  } catch {
    // Storage is full or switched off: the time is shown now and not kept.
  }
  return kept;
}
