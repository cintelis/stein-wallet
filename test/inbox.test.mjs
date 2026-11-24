// The account's inbox key (lib/stein/inbox.mjs). The derivation must never
// change: a wallet restored from its seed must find the same inbox, and
// steinchain.com makes the same key pair from the inbox seed it is handed.
//
//   npm run build:wasm && npm test

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { loadCore } from "../lib/stein/core.mjs";
import { INBOX_KEY_LEN, INBOX_SEED_LEN, inboxPublicKey, inboxSeed } from "../lib/stein/inbox.mjs";

const core = await loadCore(await readFile(new URL("../public/stein_wallet_core.wasm", import.meta.url)));
const hex = (bytes) => Buffer.from(bytes).toString("hex");
const seed = (byte) => new Uint8Array(32).fill(byte);
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

// account seed byte -> inbox seed, sha256 of the inbox's public key.
// stein-site's tests hold the same values.
const VECTORS = [
  [
    0x07,
    "cd327ab6e813f959af7b69fb52594b033f103f73c6d54ab537c5be3e71e15073f374666f88f6be8a2d6117d601b6b252f6125af4da7f88369a49b34c6ce26437",
    "2d08ac16e5921440d2096f8bd2c1a2a0f8d40ddce1442c08556c805d3d06a661",
  ],
  [
    0x2a,
    "da0aec922fc9044134b935d70ba171e399a13615c1c98f38f52dbfa1a8126a8839e3bc54e58cead3b7a91b245237d0c56fc277245af4e1ce81a074d22cee21b5",
    "4ed6367264a99599b82990206d09343dbbf4f96c63e42566f2a680613bb5a591",
  ],
];

test("a seed always gives the same inbox key", async () => {
  for (const [byte, inbox, publicKeyHash] of VECTORS) {
    const derived = await inboxSeed(seed(byte));
    assert.equal(derived.length, INBOX_SEED_LEN);
    assert.equal(hex(derived), inbox);
    const publicKey = inboxPublicKey(derived);
    assert.equal(publicKey.length, INBOX_KEY_LEN);
    assert.equal(sha256(publicKey), publicKeyHash);
  }
});

// HKDF by Node's own implementation, not WebCrypto's.
test("the inbox seed is HKDF-SHA-256 of the account seed", async () => {
  const theirs = crypto.hkdfSync("sha256", seed(0x07), new Uint8Array(0), "stein-wallet inbox key v1", 64);
  assert.equal(hex(await inboxSeed(seed(0x07))), hex(new Uint8Array(theirs)));
  await assert.rejects(inboxSeed(new Uint8Array(31)));
});

test("what is sealed to the inbox's public key opens with its seed", async () => {
  const derived = await inboxSeed(seed(0x07));
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(inboxPublicKey(derived));
  const { secretKey } = ml_kem768.keygen(derived);
  assert.deepEqual(ml_kem768.decapsulate(cipherText, secretKey), sharedSecret);
  const other = ml_kem768.keygen(await inboxSeed(seed(0x2a)));
  assert.notDeepEqual(ml_kem768.decapsulate(cipherText, other.secretKey), sharedSecret);
});

// Kind 3, as lib/stein/statement.ts signs it: the address, then the inbox key.
test("an inbox statement ties the inbox key to the account that signed it", async () => {
  const address = core.decodeAddress(core.addressFromSeed(seed(0x07)));
  const inboxKey = inboxPublicKey(await inboxSeed(seed(0x07)));
  const payload = new Uint8Array([...address, ...inboxKey]);
  const { publicKey, signature } = core.signStatement({ seed: seed(0x07), kind: 3, payload });
  assert.equal(core.verifyStatement({ publicKey, kind: 3, payload, signature }), true);
  // Not as a registration or a message, and not for another inbox key.
  for (const kind of [1, 2]) {
    assert.equal(core.verifyStatement({ publicKey, kind, payload, signature }), false);
  }
  const otherKey = inboxPublicKey(await inboxSeed(seed(0x2a)));
  const swapped = new Uint8Array([...address, ...otherKey]);
  assert.equal(core.verifyStatement({ publicKey, kind: 3, payload: swapped, signature }), false);
});
