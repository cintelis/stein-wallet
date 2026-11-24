// The account's inbox key: an ML-KEM-768 (FIPS 203) key pair that messages
// sent to this account on steinchain.com are sealed to.
//
// An account key only signs (FN-DSA), so it cannot open anything. The inbox
// key is a second key, derived from the same seed: whoever holds the seed
// holds the inbox, on any device, with nothing more to back up.
//
//   inbox seed = HKDF-SHA-256(key: the 32-byte account seed, no salt,
//                             info: "stein-wallet inbox key v1"), 64 bytes
//   key pair   = ML-KEM-768 key generation from that seed (d ‖ z)
//
// The derivation is one-way: the inbox seed opens the inbox and nothing else.
// It cannot sign, and the account seed cannot be found from it.
//
// Plain JavaScript, like core.mjs, so that Node can test it without a build.

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

const INFO = new TextEncoder().encode('stein-wallet inbox key v1');
/** Length of an inbox seed: ML-KEM's d ‖ z. */
export const INBOX_SEED_LEN = 64;
/** Length of an ML-KEM-768 public key. */
export const INBOX_KEY_LEN = 1184;

/** The inbox seed of the account with this 32-byte seed. */
export async function inboxSeed(seed) {
  if (seed.length !== 32) throw new Error('a seed is 32 bytes');
  const key = await crypto.subtle.importKey('raw', seed, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: INFO },
    key,
    INBOX_SEED_LEN * 8,
  );
  return new Uint8Array(bits);
}

/** The public key of the inbox with this seed: what messages are sealed to. */
export function inboxPublicKey(inboxSeed) {
  const { publicKey, secretKey } = ml_kem768.keygen(inboxSeed);
  secretKey.fill(0);
  return publicKey;
}
