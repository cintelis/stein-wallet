// Types for inbox.mjs, the account's inbox key.

/** Length of an inbox seed: ML-KEM's d ‖ z. */
export const INBOX_SEED_LEN: number;
/** Length of an ML-KEM-768 public key. */
export const INBOX_KEY_LEN: number;

/** The inbox seed of the account with this 32-byte seed. */
export function inboxSeed(seed: Uint8Array): Promise<Uint8Array>;

/** The public key of the inbox with this seed: what messages are sealed to. */
export function inboxPublicKey(inboxSeed: Uint8Array): Uint8Array;
