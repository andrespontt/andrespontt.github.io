import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, applyLive, createOperation, summary } from './city-ops.mjs';

const MINUTE = 60_000, t0 = 1_700_000_000_000;

test('starts quiet, ambushes after a few minutes, and clears waves over time', () => {
  let op = createOperation(t0, 42);
  assert.equal(op.phase, 'quiet');
  op = advance(op, t0 + 2 * MINUTE);
  assert.equal(op.phase, 'quiet');
  op = advance(op, t0 + 3 * MINUTE);
  assert.equal(op.phase, 'contact'); assert.equal(op.wave, 1); assert.equal(op.active, 12);
  assert.match(op.log.at(-1).text, /Ambush/);
  op = advance(op, t0 + 60 * MINUTE);
  assert.ok(op.wave >= 2, 'more waves follow');
  assert.ok(op.totalDown >= 12);
});

test('catching up is deterministic and capped at six hours', () => {
  const a = advance(createOperation(t0, 7), t0 + 90 * MINUTE);
  const b = advance(advance(createOperation(t0, 7), t0 + 30 * MINUTE), t0 + 90 * MINUTE);
  assert.deepEqual(a, b);
  const far = advance(createOperation(t0, 7), t0 + 30 * 24 * 60 * MINUTE);
  assert.ok(far.tick <= 6 * 60 * 6 + 1);
});

test('the live scene owns the fight while the drone feed is open', () => {
  let op = advance(createOperation(t0, 3), t0 + 4 * MINUTE);
  const live = applyLive(op, { wave: 1, contact: true, active: 9, down: 3, vip: 'sheltering' }, t0 + 4 * MINUTE);
  assert.equal(live.active, 9); assert.equal(live.down, 3);
  // Off-screen ticks don't touch it for the next 15 s.
  assert.equal(advance(live, t0 + 4 * MINUTE + 10_000).active, 9);
  assert.match(summary(live, t0 + 4 * MINUTE), /CONTACT · wave 1 · 9 active/);
});

test('log stays bounded', () => {
  const op = advance(createOperation(t0, 11), t0 + 6 * 60 * MINUTE);
  assert.ok(op.log.length <= 30);
});
