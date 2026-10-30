import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLLOW_PINE, TINKERS_LOFT, planSolids, walkRects, walk, guardSpots, inRect, wallPieces } from './safehouse-plans.js';
import { plan } from './city-paths.js';

const PLANS = [HOLLOW_PINE, TINKERS_LOFT];
const BODY = .26;
const clear = (boxes, [x, z]) => !walkRects(boxes).some(r => x > r[0] - BODY && x < r[2] + BODY && z > r[1] - BODY && z < r[3] + BODY);
// Walk a body along a planned route; true when it ends within 10 cm of the goal.
function reaches(boxes, bounds, from, to) {
  const route = plan(from, to, walkRects(boxes), .28);
  if (!route.length) return false;
  const p = { x: from[0], z: from[1] };
  for (const [tx, tz] of route) for (let i = 0; i < 600; i++) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < .02) break;
    walk(p, dx / d * Math.min(d, .05), dz / d * Math.min(d, .05), boxes, bounds);
  }
  return Math.hypot(p.x - to[0], p.z - to[1]) < .1;
}

test('wall pieces leave door and window openings', () => {
  const pieces = wallPieces({ axis: 'x', at: 0, from: -3, to: 3, thick: .2, height: 2.7, openings: [[-1, 0, 0, 2.1], [1, 2, .9, 2]] });
  // Door: wall either side and a lintel. Window: sill and lintel.
  assert.equal(pieces.length, 6);
  assert.ok(!pieces.some(b => b[0] < -.5 && b[3] > -.5 && b[1] < 1.5 && b[4] > 1.5), 'nothing in the doorway');
  assert.ok(pieces.some(b => b[0] === 1 && b[3] === 2 && b[4] === .9), 'window sill');
});

for (const P of PLANS) {
  const solids = planSolids(P);
  const withDoors = [...solids, ...(P.door ? [P.door.closed] : []), ...(P.bookcase ? [[P.bookcase.x0, 0, P.bookcase.z0, P.bookcase.x1, P.bookcase.height, P.bookcase.z1]] : [])];

  test(`${P.id}: every guard post, patrol stop and alert spot is clear of walls and furniture`, () => {
    for (const spot of guardSpots(P)) {
      assert.ok(clear(withDoors, spot), `${P.id} spot ${spot} overlaps a solid`);
      assert.ok(spot[0] > P.bounds[0] && spot[0] < P.bounds[2] && spot[1] > P.bounds[1] && spot[1] < P.bounds[3], `${spot} out of bounds`);
    }
  });

  test(`${P.id}: patrol legs and every run to an alert spot and back are walkable`, () => {
    for (const g of P.guards) {
      if (g.route) g.route.forEach((stop, i) => {
        const next = g.route[(i + 1) % g.route.length];
        assert.ok(reaches(withDoors, P.bounds, stop.at, next.at), `${g.id} cannot walk ${stop.at} → ${next.at}`);
      });
      const home = g.route ? g.route[0].at : g.at;
      if (g.alert.at.join() !== home.join()) {
        assert.ok(reaches(withDoors, P.bounds, home, g.alert.at), `${g.id} cannot reach the alert spot`);
        assert.ok(reaches(withDoors, P.bounds, g.alert.at, home), `${g.id} cannot get back from the alert spot`);
      }
    }
  });

  test(`${P.id}: the walkable area stays inside the bounds and the shell keeps its corners`, () => {
    const corners = [[P.shell[0] + .05, P.shell[1] + .05], [P.shell[2] - .05, P.shell[3] - .05]];
    for (const c of corners) assert.ok(!clear(solids, c), 'a shell corner is solid');
  });
}

test('Hollow Pine: the front door opens onto the porch and shuts it off when closed', () => {
  const P = HOLLOW_PINE, solids = planSolids(P), inside = [-2.05, 3.4], porch = [-2.05, 6.6];
  assert.ok(reaches([...solids, P.door.open], P.bounds, inside, porch), 'open door lets you out');
  assert.ok(!reaches([...solids, P.door.closed], P.bounds, inside, porch), 'closed door keeps you in');
  // The open leaf lies against the wall, clear of the doorway and of the guard who checks it.
  assert.ok(clear([P.door.open], [-2.05, 3.55]));
  // Windows have sills: you cannot climb out of one.
  assert.ok(!reaches([...solids, P.door.closed], P.bounds, [0, 3.6], [0, 5.2]));
});

test('Hollow Pine: the cellar hatch is in the radio room and clear of furniture', () => {
  const P = HOLLOW_PINE, [x0, z0, x1, z1] = P.hatch;
  for (const f of P.furniture) assert.ok(f.box[3] <= x0 || f.box[0] >= x1 || f.box[5] <= z0 || f.box[2] >= z1, `${f.id} over the hatch`);
  assert.ok(x0 > 1.08 && x1 < 5.7 && z0 > .08 && z1 < 4.2);
});

test('Tinker\'s Loft: the hidden room is reached only through the moved bookcase', () => {
  const P = TINKERS_LOFT, solids = planSolids(P), b = P.bookcase, front = [4.15, 2.4], radio = P.guards.find(g => g.id === 'vesna').at;
  const shut = [...solids, [b.x0, 0, b.z0, b.x1, b.height, b.z1]], open = [...solids, [b.x0 + b.slide, 0, b.z0, b.x1 + b.slide, b.height, b.z1]];
  assert.ok(!reaches(shut, P.bounds, front, radio), 'closed bookcase hides the room');
  assert.ok(reaches(open, P.bounds, front, radio), 'open bookcase lets you in');
  assert.ok(open.at(-1)[3] <= 6.2, 'slid bookcase stays inside the room');
});

test('Tinker\'s Loft: the back door leads to the roof terrace and the stairwell is railed off', () => {
  const P = TINKERS_LOFT, solids = planSolids(P);
  assert.ok(reaches(solids, P.bounds, [0, 2.6], [0, -7]), 'front room to terrace');
  assert.ok(inRect(P.terrace, 0, -7));
  assert.ok(!reaches(solids, P.bounds, [-4.4, -.6], [-5.6, -2.5]), 'no walking down the stairs');
  // The terrace is closed in by its parapet.
  assert.ok(!reaches(solids, P.bounds, [0, -7], [5, -7]));
});
