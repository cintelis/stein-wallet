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
