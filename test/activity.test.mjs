// How a transaction reads in the activity list, from the node's own records
// of the devnet's first swap and token transfer.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describe } from '../lib/stein/activity.ts';

const ME = 'stf3ea9f5b6e4457dba9ac16a47a0d5ee1087a9672f7e4dec6b9d079fceeb8ab47bfa34aae';
const THEM = 'st8092f24b2d9f28d36b489c19a7a3d0e338c2f1e458372b00bf829f1265675fe8ff7c6ac8';
const DEMO = 'stab64bfd3416eeb58c8a0ffd85b750d807aedfa4d3de4a71eb2a2f6fc2c0ee8ee98122ce0';
const POOL = 'staf5a1b0af2dfb5ad85a330a3efcb473a872fb679fdb04d39ea260a11a5d4ea34eb2aecbc';
const known = [{ asset: DEMO, symbol: 'DEMO', decimals: 6 }];

const swap = {
  sender: ME,
  to: POOL,
  amount: '2000000000',
  kind: 'swap',
  action: { asset_in: 'stein', amount_in: '2000000000', asset_out: DEMO },
  outcome: { result: 'swapped', amount_out: '19938012' },
};

test('a swap shows what was received and what it cost', () => {
  const d = describe(swap, ME, known);
  assert.equal(d.title, 'Swapped');
  assert.equal(`${d.amount} ${d.symbol}`, '+19.938012 DEMO');
  assert.equal(d.note, 'for 2 STEIN');
  assert.equal(d.other, null);
});

test('a swap the pool returned says so, and that the fee was paid', () => {
  const d = describe({ ...swap, outcome: { result: 'below_minimum' } }, ME, known);
  assert.equal(d.title, 'Swap not filled');
  assert.equal(d.amount, '');
  assert.match(d.note, /returned your 2 STEIN.*fee was still paid/);
});

test('a token transfer shows the token, at its own decimals, in both directions', () => {
  const tx = {
    sender: ME,
    to: THEM,
    amount: '0',
    kind: 'transfer_token',
    action: { token: DEMO, amount: '9969006' },
  };
  const sent = describe(tx, ME, known);
  assert.equal(`${sent.title} ${sent.direction} ${sent.other}`, `Sent to ${THEM}`);
  assert.equal(`${sent.amount} ${sent.symbol}`, '−9.969006 DEMO');
  const got = describe(tx, THEM, known);
  assert.equal(`${got.title} ${got.direction} ${got.other}`, `Received from ${ME}`);
  assert.equal(got.amount, '+9.969006');
  assert.equal(got.tone, 'in');
});

test('a token the wallet knows nothing of is shown in base units, not guessed at', () => {
  const d = describe(
    { sender: THEM, to: ME, amount: '0', kind: 'transfer_token', action: { token: POOL, amount: '1500' } },
    ME,
    known,
  );
  assert.equal(d.amount, '+1,500');
  assert.equal(d.symbol, 'base units of a token');
});

test('a transfer of STEIN reads as before, also from a node that names no kind', () => {
  const tx = { sender: THEM, to: ME, amount: '5000000000' };
  const d = describe(tx, ME, known);
  assert.equal(`${d.title} ${d.amount} ${d.symbol}`, 'Received +5 STEIN');
  assert.equal(describe({ ...tx, sender: ME }, ME, known).title, 'Sent to yourself');
});

test('other kinds are named and claim no amount', () => {
  assert.equal(describe({ sender: ME, to: ME, amount: '0', kind: 'issue_token' }, ME, known).title, 'Issued a token');
  assert.equal(describe({ sender: ME, to: POOL, amount: '0', kind: 'add_liquidity' }, ME, known).title, 'Added liquidity');
  assert.equal(describe({ sender: ME, to: ME, amount: '0', kind: 'something_new' }, ME, known).title, 'something new');
});
