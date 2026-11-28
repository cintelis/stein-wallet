// How long a transfer took and how long ago a block was made, in words, and
// the record of delivery times kept in the browser.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ago, formatDuration, readDeliveries, recordDelivery } from '../lib/stein/time.ts';

/** A stand-in for localStorage. */
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const id = (n) => n.toString(16).padStart(64, '0');

test('a duration reads as tenths of a second, then seconds, then minutes', () => {
  assert.equal(formatDuration(0), '0.0 s');
  assert.equal(formatDuration(840), '0.8 s');
  assert.equal(formatDuration(1_449), '1.4 s');
  assert.equal(formatDuration(9_949), '9.9 s');
  assert.equal(formatDuration(12_400), '12 s');
  assert.equal(formatDuration(60_000), '1 min');
  assert.equal(formatDuration(125_000), '2 min 5 s');
  assert.equal(formatDuration(-50), '0.0 s');
});

test('a moment reads as how long ago it was', () => {
  const now = 1_800_000_000_000;
  assert.equal(ago(now - 5_000, now), 'just now');
  assert.equal(ago(now + 3_000, now), 'just now'); // a block's clock a little ahead of this one
  assert.equal(ago(now - 60_000, now), '1 min ago');
  assert.equal(ago(now - 47 * 60_000, now), '47 min ago');
  assert.equal(ago(now - 3 * 3_600_000, now), '3 h ago');
  assert.equal(ago(now - 5 * 86_400_000, now), '5 d ago');
});

test('a delivery time is kept and read back', () => {
  const s = storage();
  assert.deepEqual(readDeliveries(s), {});
  assert.deepEqual(recordDelivery(s, id(1), 1_234.6), { [id(1)]: 1235 });
  recordDelivery(s, id(2), 900);
  assert.deepEqual(readDeliveries(s), { [id(1)]: 1235, [id(2)]: 900 });
});

test('only the newest 200 are kept', () => {
  const s = storage();
  for (let n = 1; n <= 205; n++) recordDelivery(s, id(n), n);
  const kept = readDeliveries(s);
  assert.equal(Object.keys(kept).length, 200);
  assert.equal(kept[id(5)], undefined);
  assert.equal(kept[id(6)], 6);
  assert.equal(kept[id(205)], 205);
});

test('a damaged or tampered record is read as far as it makes sense', () => {
  assert.deepEqual(readDeliveries(storage({ 'stein-wallet:delivery': 'not json' })), {});
  assert.deepEqual(readDeliveries(storage({ 'stein-wallet:delivery': '[1,2]' })), {});
  const mixed = JSON.stringify({ [id(1)]: 500, short: 3, [id(2)]: 'soon', [id(3)]: -4, [id(4)]: null });
  assert.deepEqual(readDeliveries(storage({ 'stein-wallet:delivery': mixed })), { [id(1)]: 500 });
});

test('a browser that will not store still gets the time back', () => {
  const s = storage();
  s.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.deepEqual(recordDelivery(s, id(1), 700), { [id(1)]: 700 });
});
