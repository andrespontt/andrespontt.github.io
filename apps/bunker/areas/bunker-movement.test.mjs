import test from 'node:test';
import assert from 'node:assert/strict';
import { moveInBunker } from './bunker-movement.mjs';

test('the central passage connects entrance to common room and back', () => {
  const p = { x: 0, y: 1.7, z: 1.25 };
  moveInBunker(p, 0, -24);
  assert.ok(Math.abs(p.z + 22.75) < .001);
  moveInBunker(p, 0, 24);
  assert.ok(Math.abs(p.z - 1.25) < .001);
  assert.equal(p.y, 1.7);
});

test('both side compartments are accessible through their doorways', () => {
  const operations = { x: 0, z: -7.7 };
  moveInBunker(operations, -3.5, 0);
  assert.ok(Math.abs(operations.x + 3.5) < .001);
  const crew = { x: 0, z: -9.9 };
  moveInBunker(crew, 3.5, 0);
  assert.ok(Math.abs(crew.x - 3.5) < .001);
});

test('walls and furnishings stop movement, including large frame displacement', () => {
  const wall = { x: 0, z: -5 };
  moveInBunker(wall, 20, 0);
  assert.ok(wall.x <= 1.41 && wall.x > 1.2);
  const bed = { x: 3.5, z: -9.9 };
  moveInBunker(bed, 4, 0);
  assert.ok(bed.x <= 4.01 && bed.x > 3.8);
  const outside = { x: 0, z: 1.25 };
  moveInBunker(outside, 0, 100);
  assert.ok(outside.z <= 2.31 && outside.z > 2.1);
});

test('walking along blocked walls slides rather than trapping the player', () => {
  const p = { x: 1.4, z: -5 };
  moveInBunker(p, 1, -2);
  assert.ok(p.z < -6.9);
  assert.ok(p.x <= 1.41);
});

test('invalid input does not corrupt the player position', () => {
  const p = { x: 0, z: 0 };
  moveInBunker(p, Number.NaN, 0);
  moveInBunker(p, 0, Infinity);
  assert.deepEqual(p, { x: 0, z: 0 });
});
