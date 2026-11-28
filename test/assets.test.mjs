// Token amounts, swap quotes and transaction sizes, against what the devnet
// actually did.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  STEIN,
  formatUnits,
  leastOut,
  parseUnits,
  poolFor,
  quote,
  tradable,
  txBytes,
} from '../lib/stein/assets.ts';

const TOKEN = 'stab64bfd3416eeb58c8a0ffd85b750d807aedfa4d3de4a71eb2a2f6fc2c0ee8ee98122ce0';
const OTHER = 'st8092f24b2d9f28d36b489c19a7a3d0e338c2f1e458372b00bf829f1265675fe8ff7c6ac8';
const pool = {
  address: 'staf5a1b0af2dfb5ad85a330a3efcb473a872fb679fdb04d39ea260a11a5d4ea34eb2aecbc',
  asset_a: STEIN,
  asset_b: TOKEN,
  symbol_a: 'STEIN',
  symbol_b: 'DEMO',
  decimals_a: 9,
  decimals_b: 6,
  reserve_a: '20000000000000',
  reserve_b: '200000000000',
  fee_per_mille: 3,
};

test('amounts parse and format at the token\'s own decimals', () => {
  assert.equal(parseUnits('12.5', 6), 12_500_000n);
  assert.equal(parseUnits('0.000001', 6), 1n);
  assert.equal(parseUnits('7', 0), 7n);
  assert.equal(parseUnits('7.', 0), 7n);
  assert.equal(parseUnits('1.0000001', 6), null); // more places than the token has
  assert.equal(parseUnits('1.5', 0), null);
  assert.equal(parseUnits('', 6), null);
  assert.equal(parseUnits('1e3', 6), null);
  assert.equal(parseUnits('-1', 6), null);
  assert.equal(formatUnits(19_938_012n, 6), '19.938012');
  assert.equal(formatUnits(1_234_567_000_000n, 6), '1,234,567');
  assert.equal(formatUnits(1_999_999_999_000n, 0), '1,999,999,999,000');
  assert.equal(formatUnits(0n, 6), '0');
});

test('a quote is what the devnet paid for the same swap', () => {
  // Block 2423: 2 STEIN into a pool of 20,000 STEIN and 200,000 DEMO paid 19.938012 DEMO.
  assert.equal(quote(2_000_000_000n, 20_000_000_000_000n, 200_000_000_000n), 19_938_012n);
});

test('a quote takes the fee from what is paid, rounded up, and rounds the result down', () => {
  // 1 base unit: the fee rounds up to all of it.
  assert.equal(quote(1n, 1000n, 1000n), 0n);
  // 1000 in: fee 3, net 997; 997 * 1000 / 1997 = 499.2…
  assert.equal(quote(1000n, 1000n, 1000n), 499n);
  assert.equal(quote(0n, 1000n, 1000n), 0n);
  assert.equal(quote(1000n, 0n, 1000n), 0n);
  // The product of the reserves never falls.
  const out = quote(123_456n, 9_999_999n, 7_777_777n);
  assert.ok((9_999_999n + 123_456n) * (7_777_777n - out) >= 9_999_999n * 7_777_777n);
});

test('the least to accept allows for slippage and is never nothing', () => {
  assert.equal(leastOut(10_000n, 50), 9_950n);
  assert.equal(leastOut(10_000n, 0), 10_000n);
  assert.equal(leastOut(1n, 50), 1n);
});

test('a pool is found in either direction, with its reserves the right way round', () => {
  const forward = poolFor([pool], STEIN, TOKEN);
  assert.equal(forward.reserveIn, 20_000_000_000_000n);
  assert.equal(forward.reserveOut, 200_000_000_000n);
  const back = poolFor([pool], TOKEN, STEIN);
  assert.equal(back.reserveIn, 200_000_000_000n);
  assert.equal(poolFor([pool], TOKEN, OTHER), null);
  assert.equal(poolFor([], STEIN, TOKEN), null);
});

test('what can be traded is every asset with a pool, STEIN first', () => {
  assert.deepEqual(tradable([pool]).map((a) => a.symbol), ['STEIN', 'DEMO']);
  assert.deepEqual(tradable([]), []);
});

test('transaction sizes are the ones the devnet measured', () => {
  assert.equal(txBytes({ kind: 'transfer' }, false), 790);
  assert.equal(txBytes({ kind: 'transfer' }, true), 1688);
  assert.equal(txBytes({ kind: 'transfer_token' }, false), 822); // block 2424
  assert.equal(txBytes({ kind: 'swap', assetIn: STEIN, assetOut: TOKEN }, true), 1706); // block 2423
  assert.equal(txBytes({ kind: 'swap', assetIn: TOKEN, assetOut: OTHER }, false), 840);
});

test('an asset is called by its symbol, with part of its address only when two share one', async () => {
  const { names } = await import('../lib/stein/assets.ts');
  const a = { asset: TOKEN, symbol: 'USD', decimals: 6 };
  const b = { asset: OTHER, symbol: 'USD', decimals: 2 };
  const s = { asset: STEIN, symbol: 'STEIN', decimals: 9 };
  assert.deepEqual([...names([s, a]).values()], ['STEIN', 'USD']);
  assert.deepEqual([...names([s, a, b]).values()], ['STEIN', 'USD ab64bf', 'USD 8092f2']);
});
