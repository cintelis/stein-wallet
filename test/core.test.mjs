// Checks the WebAssembly wallet core against values produced by stein-chain's
// own command-line wallet (`stein address --key <seed file>`), so a drift from
// the chain's formats fails here.
//
//   npm run build:wasm && npm test

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { loadCore } from "../lib/stein/core.mjs";

const wasm = await readFile(new URL("../public/stein_wallet_core.wasm", import.meta.url));
const core = await loadCore(wasm);

const hex = (bytes) => Buffer.from(bytes).toString("hex");
const seed = (byte) => new Uint8Array(32).fill(byte);

// seed -> address, from `stein address` (stein-chain 43b57f3).
const VECTORS = [
  [0x07, "st75b5c47ef28c7b2efdda5d1eb3b6fe12eb58afe3f30d4644c273b70cfe8d59215637069b"],
  [0x2a, "st1d4346c3eb87b740fe9b3eb878720750c9a63d00fd71414e76f3ecb92cd78ab242ce0a99"],
];

test("a seed gives the address the chain's wallet gives", () => {
  for (const [byte, address] of VECTORS) {
    assert.equal(core.addressFromSeed(seed(byte)), address);
  }
});

test("addresses round-trip and typos are caught", () => {
  const [, address] = VECTORS[0];
  assert.equal(core.encodeAddress(core.decodeAddress(address)), address);
  const typo = address.slice(0, 10) + (address[10] === "0" ? "1" : "0") + address.slice(11);
  assert.throws(() => core.decodeAddress(typo), /checksum/);
  assert.throws(() => core.decodeAddress("0xabc"), /start with/);
  assert.throws(() => core.decodeAddress("st12"), /72 hex/);
});

test("a transfer has the chain's sizes, fee and layout", () => {
  const [, to] = VECTORS[1];
  const request = {
    seed: seed(0x07),
    chainId: 31337n,
    nonce: 5n,
    expiresAt: 300n,
    minFeePerByte: 10n,
    to,
    amount: 1_500_000_000n,
  };
  const first = core.signTransfer({ ...request, registerKey: true });
  const later = core.signTransfer({ ...request, registerKey: false });
  assert.equal(first.raw.length, 1688);
  assert.equal(later.raw.length, 790);
  assert.equal(first.fee, 16880n);
  assert.equal(later.fee, 7900n);
  assert.match(first.id, /^[0-9a-f]{64}$/);

  // Body: version, chain id, sender, nonce, fee, expiry, action, to, amount.
  const body = later.raw.subarray(0, 122);
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  assert.equal(body[0], 1);
  assert.equal(view.getBigUint64(1, true), 31337n);
  assert.equal(hex(body.subarray(9, 41)), VECTORS[0][1].slice(2, 66));
  assert.equal(view.getBigUint64(41, true), 5n);
  assert.equal(view.getBigUint64(49, true), 7900n);
  assert.equal(view.getBigUint64(65, true), 300n);
  assert.equal(body[73], 0);
  assert.equal(hex(body.subarray(74, 106)), to.slice(2, 66));
  assert.equal(view.getBigUint64(106, true), 1_500_000_000n);
  // No key, then a tag-3 signature.
  assert.equal(later.raw[122], 0);
  assert.equal(later.raw[123], 3);
  // With a key: option tag, scheme tag, 897-byte key, scheme tag.
  assert.deepEqual([first.raw[122], first.raw[123], first.raw[1021]], [1, 3, 3]);
});

test("signing is randomised and the id covers the body only", () => {
  const request = {
    seed: seed(0x07),
    chainId: 1n,
    nonce: 0n,
    expiresAt: 10n,
    minFeePerByte: 10n,
    to: VECTORS[1][1],
    amount: 1n,
    registerKey: false,
  };
  const a = core.signTransfer(request);
  const b = core.signTransfer(request);
  assert.equal(a.id, b.id);
  assert.notEqual(hex(a.raw), hex(b.raw));
});

test("a transfer of zero is refused", () => {
  assert.throws(
    () =>
      core.signTransfer({
        seed: seed(0x07),
        chainId: 1n,
        nonce: 0n,
        expiresAt: 10n,
        minFeePerByte: 10n,
        to: VECTORS[1][1],
        amount: 0n,
        registerKey: false,
      }),
    /zero/,
  );
});

test("a statement verifies only as what was signed, by who signed it", () => {
  const payload = new TextEncoder().encode("a statement, not a transaction");
  const { publicKey, signature } = core.signStatement({ seed: seed(0x07), kind: 2, payload });
  assert.equal(publicKey.length, 897);
  assert.equal(signature.length, 666);
  // The public key is the account's: it hashes to the chain's address.
  assert.equal(core.addressFromPublicKey(publicKey), VECTORS[0][1]);

  const check = (changes) => core.verifyStatement({ publicKey, kind: 2, payload, signature, ...changes });
  assert.equal(check({}), true);
  assert.equal(check({ kind: 1 }), false);
  assert.equal(check({ payload: new TextEncoder().encode("a statement, not a transaction!") }), false);
  const altered = signature.slice();
  altered[100] ^= 1;
  assert.equal(check({ signature: altered }), false);
  const other = core.signStatement({ seed: seed(0x2a), kind: 2, payload });
  assert.equal(check({ publicKey: other.publicKey }), false);
  assert.equal(check({ signature: other.signature }), false);
});

test("a transfer's signature is not a statement's, nor the reverse", () => {
  // A transfer is signed over "STEIN-SIG-v1" ‖ 1 ‖ body and a statement over
  // "STEIN-STATEMENT-v1" ‖ kind ‖ payload: no body and payload make them equal.
  const signed = core.signTransfer({
    seed: seed(0x07), chainId: 31337n, nonce: 0n, expiresAt: 100n, minFeePerByte: 10n,
    to: VECTORS[1][1], amount: 1n, registerKey: false,
  });
  const body = signed.raw.subarray(0, 122);
  const signature = signed.raw.subarray(signed.raw.length - 666);
  const { publicKey } = core.signStatement({ seed: seed(0x07), kind: 1, payload: body });
  for (const kind of [0, 1, 2]) {
    assert.equal(core.verifyStatement({ publicKey, kind, payload: body, signature }), false);
  }
});

// A token transfer and a swap, as the devnet accepted them from this core
// (blocks 2424 and 2423): the layout below is the one the chain decoded.
const TOKEN = "stab64bfd3416eeb58c8a0ffd85b750d807aedfa4d3de4a71eb2a2f6fc2c0ee8ee98122ce0";
const common = { seed: seed(0x07), chainId: 31337n, nonce: 5n, expiresAt: 300n, minFeePerByte: 10n };

test("a token transfer has the chain's size, fee and layout", () => {
  const [, to] = VECTORS[1];
  const tx = core.signTokenTransfer({ ...common, token: TOKEN, to, amount: 9_969_006n, registerKey: false });
  assert.equal(tx.raw.length, 822);
  assert.equal(tx.fee, 8220n);
  // After the 73 bytes every body starts with: action 2, token, to, amount.
  const view = new DataView(tx.raw.buffer, tx.raw.byteOffset, tx.raw.byteLength);
  assert.equal(tx.raw[73], 2);
  assert.equal(hex(tx.raw.subarray(74, 106)), TOKEN.slice(2, 66));
  assert.equal(hex(tx.raw.subarray(106, 138)), to.slice(2, 66));
  assert.equal(view.getBigUint64(138, true), 9_969_006n);
  assert.deepEqual([tx.raw[154], tx.raw[155]], [0, 3]);
  assert.equal(core.signTokenTransfer({ ...common, token: TOKEN, to, amount: 1n, registerKey: true }).raw.length, 1720);
});

test("a swap has the chain's size, fee and layout, with STEIN as one byte and a token as 33", () => {
  const STEIN = "stein";
  const buy = core.signSwap({ ...common, assetIn: STEIN, amountIn: 2_000_000_000n, assetOut: TOKEN, minOut: 7n, registerKey: false });
  assert.equal(buy.raw.length, 808);
  assert.equal(buy.fee, 8080n);
  const view = new DataView(buy.raw.buffer, buy.raw.byteOffset, buy.raw.byteLength);
  // Action 5, STEIN (tag 0), amount in, token (tag 1 and its address), least out.
  assert.deepEqual([buy.raw[73], buy.raw[74]], [5, 0]);
  assert.equal(view.getBigUint64(75, true), 2_000_000_000n);
  assert.equal(buy.raw[91], 1);
  assert.equal(hex(buy.raw.subarray(92, 124)), TOKEN.slice(2, 66));
  assert.equal(view.getBigUint64(124, true), 7n);
  assert.deepEqual([buy.raw[140], buy.raw[141]], [0, 3]);

  const sell = core.signSwap({ ...common, assetIn: TOKEN, amountIn: 5n, assetOut: STEIN, minOut: 1n, registerKey: true });
  assert.equal(sell.raw.length, 808 + 898);
  assert.deepEqual([sell.raw[73], sell.raw[74], sell.raw[107 + 16]], [5, 1, 0]);
});

test("a swap of nothing, or of an asset for itself, is refused before signing", () => {
  const swap = { ...common, assetIn: "stein", amountIn: 1n, assetOut: TOKEN, minOut: 1n, registerKey: false };
  assert.throws(() => core.signSwap({ ...swap, amountIn: 0n }), /more than zero/);
  assert.throws(() => core.signSwap({ ...swap, assetOut: "stein" }), /two different assets/);
  assert.throws(() => core.signSwap({ ...swap, assetIn: TOKEN }), /two different assets/);
  assert.throws(() => core.signSwap({ ...swap, assetOut: TOKEN.slice(0, -1) + "1" }), /checksum/);
  assert.throws(
    () => core.signTokenTransfer({ ...common, token: TOKEN, to: VECTORS[1][1], amount: 0n, registerKey: false }),
    /more than zero/,
  );
});
