// End to end against a real node: signs a transfer with the WebAssembly core
// and submits it, then waits for it to be included.
//
//   node scripts/e2e.mjs <rpc> <seed file> <to address> <amount in base units>
//
// The seed file is the chain wallet's format: fn-dsa-512-draft:<64 hex>.

import { readFile } from "node:fs/promises";

import { loadCore } from "../lib/stein/core.mjs";

const [rpc, seedFile, to, amount] = process.argv.slice(2);
if (!rpc || !seedFile || !to || !amount) {
  console.error("usage: node scripts/e2e.mjs <rpc> <seed file> <to> <base units>");
  process.exit(64);
}

const core = await loadCore(
  await readFile(new URL("../public/stein_wallet_core.wasm", import.meta.url)),
);
const text = (await readFile(seedFile, "utf8")).trim();
const [scheme, seedHex] = text.split(":");
if (scheme !== "fn-dsa-512-draft" || !/^[0-9a-f]{64}$/.test(seedHex)) {
  throw new Error("the seed file must hold fn-dsa-512-draft:<64 hex characters>");
}
const seed = Uint8Array.from(Buffer.from(seedHex, "hex"));

const get = async (path) => {
  const response = await fetch(`${rpc}${path}`);
  if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
};

const address = core.addressFromSeed(seed);
const status = await get("/status");
const account = await get(`/account/${address}`);
const tx = core.signTransfer({
  seed,
  chainId: BigInt(status.chain_id),
  nonce: BigInt(account.nonce),
  expiresAt: BigInt(status.height) + BigInt(status.max_tx_ttl_blocks) / 2n,
  minFeePerByte: BigInt(status.min_fee_per_byte),
  to,
  amount: BigInt(amount),
  registerKey: !account.key_registered,
});

const response = await fetch(`${rpc}/tx`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ raw: Buffer.from(tx.raw).toString("hex") }),
});
const reply = await response.json();
if (!response.ok) throw new Error(`rejected: ${reply.error}`);
console.log(`submitted ${tx.id} from ${address} (${tx.raw.length} bytes, fee ${tx.fee})`);

for (let i = 0; i < 30; i++) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const state = await get(`/tx/${tx.id}`);
  if (state.status === "included") {
    console.log(`included in block ${state.height}`);
    process.exit(0);
  }
}
throw new Error("not included after 15 s");
