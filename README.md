# steinwallet

A browser wallet for [Stein Chain](https://github.com/steinchain/stein-chain),
the post-quantum layer-1. Create or import an account, see its balance and
activity, send STEIN and tokens, and swap one asset for another through a
liquidity pool. Everything is signed in the browser with FN-DSA-512 (draft
FIPS 206), the default scheme for Stein account keys.

Non-custodial and serverless: the key is generated and kept in the browser,
encrypted under a passphrase, and the app is static files. There are no server
routes.

**Devnet only.** A key in browser storage is not safe enough for funds that
matter, and devnet STEIN has no value.

## Setup

Needs Node 20+ and Rust (the toolchain in `wasm/rust-toolchain.toml`, with the
`wasm32-unknown-unknown` target, which rustup installs from that file).

```bash
npm install
npm run build:wasm     # builds public/stein_wallet_core.wasm
npm run dev            # http://localhost:3000
```

## Layout

| Path | Purpose |
|---|---|
| `wasm/` | The wallet core, in Rust: key from seed, addresses, encoding and signing a transfer. Compiled to WebAssembly |
| `lib/stein/core.mjs` | The only caller of the WebAssembly core |
| `lib/stein/keystore.ts` | The key at rest: AES-256-GCM under a PBKDF2 passphrase key, in `localStorage`; seed-file import and export |
| `lib/stein/inbox.mjs` | The account's inbox key, derived from the seed: what messages to it on steinchain.com are sealed to |
| `lib/stein/statement.ts`, `app/sign/` | What steinchain.com may ask of the wallet, and the page that answers |
| `lib/stein/rpc.ts` | Networks and the node RPC, with failover across endpoints |
| `lib/stein/amount.ts` | STEIN amounts as integers of base units; transfer sizes and fees |
| `components/wallet/WalletContext.tsx` | `useWallet()`: the key, the network, the account, sending |
| `components/wallet/WalletCard.tsx` | The main card: Create / Import, then Send / Swap / Receive |
| `components/wallet/StatStrip.tsx`, `Activity.tsx` | Balance, network and fee tiles; the account's transactions |
| `test/core.test.mjs` | The core against values from the chain's own wallet |
| `scripts/e2e.mjs` | Signs with the core and submits to a real node |

## How it stays in step with the chain

Everything that must be byte-exact is in `wasm/`, not in JavaScript: the
address hash, the transaction encoding, the signed message and the signature.
It follows `stein-crypto` and `stein-types` in stein-chain.

- `fn-dsa` is pinned to exactly 0.4.0, as in stein-chain: scheme tag 3 means
  that draft of FN-DSA, so the wallet must sign with the version the chain
  verifies with. Do not upgrade it here unless stein-chain adds a new scheme.
- `npm test` checks seed-to-address against values printed by
  `stein address`, and the transfer's size, fee and layout.
- `node scripts/e2e.mjs <rpc> <seed file> <to> <base units>` has a real node
  verify a transfer the core signed.

The WebAssembly module has no source of randomness. Each signature takes 32
bytes from `crypto.getRandomValues`, passed in by `core.mjs`.

## Signing for steinchain.com

`/sign` signs a **statement** for steinchain.com: proof that the holder of
this account asked for something, which is not a transaction. The site sends
the visitor here with the request in the URL fragment; the page shows exactly
what is asked, signs only on a click, and sends the visitor back with the
public key and signature in the fragment (`lib/stein/statement.ts`). A
fragment is never sent to a server.

- **Register**: signs the account's own address, so the site can list it as
  held.
- **Inbox**: signs the account's address and the public half of its inbox
  key (below), so the site can list it as held and anyone can send it an
  encrypted message.
- **Message**: signs the recipient inbox's key and the message text, so the
  reader of the message knows which account wrote it.
- **Open**: signs nothing. Gives steinchain.com/mailbox, and no other page,
  the seed of the account's inbox key pair, so that page can open the
  messages sent to this account.

The core signs a statement over `"STEIN-STATEMENT-v1" ‖ kind ‖ payload`. A
transaction is signed over `"STEIN-SIG-v1" ‖ …`, so neither can stand in for
the other: a statement moves nothing and cannot be replayed on the chain
(`test/core.test.mjs` checks both directions). The answer always goes to
steinchain.com, whatever the request says, so no other site can use this page
to collect signatures.

steinchain.com verifies statements with a build of this core
(`public/stein_wallet_core.wasm`), vendored in the stein-site repository
under `vendor/stein-wallet-core/`. After changing the core's
statement functions, copy the new build and `lib/stein/core.mjs` there.

### The inbox key

An account key only signs, so it cannot open a message. The inbox key is a
second key, ML-KEM-768 (FIPS 203), derived from the same seed
(`lib/stein/inbox.mjs`):

```
inbox seed = HKDF-SHA-256(key: the 32-byte account seed, no salt,
                          info: "stein-wallet inbox key v1"), 64 bytes
key pair   = ML-KEM-768 key generation from that seed
```

Whoever holds the account seed holds the inbox, on any device, with nothing
more to back up. The derivation is one-way: the inbox seed opens messages
and nothing else. It cannot sign or move STEIN, and the account seed cannot
be found from it. It is still a secret: it leaves the wallet only on an
**Open** request, after a click, in the fragment of a link to
steinchain.com/mailbox.

The derivation must never change, or restored wallets would lose their
inboxes: `test/inbox.test.mjs` holds its values, and stein-site's tests hold
the same ones. ML-KEM is `@noble/post-quantum`, pinned to the version
stein-site uses.

## Tokens and swaps

Tokens and liquidity pools are native transaction types on Stein Chain (SPEC
§4.6, §4.7). The wallet:

- **shows the tokens an account holds**, each with its address, because
  symbols are not unique: two tokens may share one;
- **sends a token** from the Send tab, which offers every token the account
  holds;
- **swaps through a pool** from the Swap tab. It shows what the pool would pay
  by the chain's own formula on the reserves as last read, and sets the least
  to accept half a percent below that. If the pool would pay less when the
  swap is in a block, it returns what was paid; the network fee is spent
  either way, and the wallet says which happened.

The fee is always paid in STEIN, so an account needs some STEIN to move a
token. Issuing a token and adding or removing a pool's liquidity are done with
the `stein` command-line wallet; the wallet shows pool shares but does not
create them.

The devnet has a token called **DEMO** (6 decimals,
`stab64bfd3416eeb58c8a0ffd85b750d807aedfa4d3de4a71eb2a2f6fc2c0ee8ee98122ce0`)
with a STEIN/DEMO pool, to try this with. Like devnet STEIN it has no value.

`scripts/e2e-tokens.mjs` swaps and sends a token against a real node with the
wallet's own signing core.

## Scope

- **FN-DSA accounts only.** ML-DSA signing runs on AWS-LC in stein-chain, which
  does not target the browser. ML-DSA accounts stay on the `stein`
  command-line wallet.
- **Seed files are interchangeable** with the command-line wallet:
  `fn-dsa-512-draft:<64 hex characters>`. The backup this app downloads is one.
- **Networks** are listed in `lib/stein/rpc.ts`: the devnet, read from the
  validator and, if that is unreachable, the follower.

## Commands

```bash
npm run dev
npm run build:wasm   # wasm/ -> public/stein_wallet_core.wasm
npm run build        # core + static export to ./out
npm run typecheck
npm test
npm run deploy       # build + wrangler deploy
```

## Deploy

Public URL: `https://wallet.steinchain.com`, a Cloudflare Worker serving the
static export in `./out` (see `wrangler.jsonc`). `public/_headers` sets the
security headers: scripts from this origin only, and network requests only to
the Stein nodes in `lib/stein/rpc.ts`. A new network endpoint must be added in
both places.

Pushing to `main` deploys: the *CI and deploy* workflow builds the core, runs
the tests, deploys with the pinned `wrangler`, and then checks that the served
core is the one it built. It needs the repository secret
`CLOUDFLARE_API_TOKEN` and the variable `CLOUDFLARE_ACCOUNT_ID`.
