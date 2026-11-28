// End to end against a real node: with the WebAssembly core, swaps STEIN for a
// token through their pool, then sends some of that token on, and waits for
// each to be included.
//
//   node scripts/e2e-tokens.mjs <rpc> <seed file> <token address> <stein base units> <to address>
//
// The account needs STEIN, and the token must have a pool with STEIN. The
// seed file is the chain wallet's format: fn-dsa-512-draft:<64 hex>.

import { readFile } from "node:fs/promises";

import { STEIN, loadCore } from "../lib/stein/core.mjs";

const [rpc, seedFile, token, amountIn, to] = process.argv.slice(2);
if (!rpc || !seedFile || !token || !amountIn || !to) {
  console.error("usage: node scripts/e2e-tokens.mjs <rpc> <seed file> <token> <stein base units> <to>");
  process.exit(64);
}

const core = await loadCore(await readFile(new URL("../public/stein_wallet_core.wasm", import.meta.url)));
const [scheme, seedHex] = (await readFile(seedFile, "utf8")).trim().split(":");
if (scheme !== "fn-dsa-512-draft" || !/^[0-9a-f]{64}$/.test(seedHex)) {
  throw new Error("the seed file must hold fn-dsa-512-draft:<64 hex characters>");
}
const seed = Uint8Array.from(Buffer.from(seedHex, "hex"));
const address = core.addressFromSeed(seed);

const get = async (path) => {
  const response = await fetch(`${rpc}${path}`);
  if (!response.ok) throw new Error(`${path}: ${await response.text()}`);
  return response.json();
};

/** What every transaction from this account carries now. */
async function common() {
  const [status, account] = await Promise.all([get("/status"), get(`/account/${address}`)]);
  return {
    seed,
    chainId: BigInt(status.chain_id),
    nonce: BigInt(account.nonce),
    expiresAt: BigInt(status.height) + BigInt(status.max_tx_ttl_blocks) / 2n,
    minFeePerByte: BigInt(status.min_fee_per_byte),
    registerKey: !account.key_registered,
  };
}

async function submit(what, tx) {
  const response = await fetch(`${rpc}/tx`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(tx.raw).toString("hex") }),
  });
  const reply = await response.json();
  if (!response.ok) throw new Error(`${what} rejected: ${reply.error}`);
  for (let i = 0; i < 40; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const state = await get(`/tx/${tx.id}`);
    if (state.status === "included") {
      console.log(`${what}: ${tx.id} (${tx.raw.length} bytes, fee ${tx.fee}) in block ${state.height}`);
      console.log(`  outcome: ${JSON.stringify(state.outcome ?? null)}`);
      return state;
    }
  }
  throw new Error(`${what}: not included after 20 s`);
}

const held = async () =>
  BigInt((await get(`/account/${address}`)).holdings?.find((h) => h.asset === token)?.balance ?? "0");

const before = await held();
await submit("swap", core.signSwap({ ...(await common()), assetIn: STEIN, amountIn: BigInt(amountIn), assetOut: token, minOut: 1n }));
const got = (await held()) - before;
if (got <= 0n) throw new Error("the swap paid nothing");
console.log(`received ${got} base units of the token`);

const part = got / 2n;
await submit("token transfer", core.signTokenTransfer({ ...(await common()), token, to, amount: part }));
const left = await held();
if (left !== before + got - part) throw new Error(`holding is ${left}, expected ${before + got - part}`);
console.log(`sent ${part}; ${left} left`);
