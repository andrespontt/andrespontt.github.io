// Floor plans for Outpost 07's two safe houses behind the Veyr river: walls with door and window openings,
// furniture, floors and stairs, guard posts, guests and prisoners, and the road an enemy patrol drives along.
// Plain data and geometry with no Three.js, shared by the scenes (scenarios/safehouse-*.js through safehouse.js)
// and their tests. Boxes are [minX, minY, minZ, maxX, maxY, maxZ]; rectangles are [minX, minZ, maxX, maxZ]; +Z is south.

// Boxes for one straight wall. axis 'x' runs from `from` to `to` along X at z = at; axis 'z' runs along Z at x = at.
// Openings are [a, b, sill, head] along the wall, measured from the wall's base: a door has sill 0.
export function wallPieces({ axis, at, from, to, thick = .2, height, base = 0, openings = [] }) {
  const pieces = [];
  const add = (a, b, y0, y1) => {
    if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
    pieces.push(axis === 'x' ? [a, base + y0, at - thick / 2, b, base + y1, at + thick / 2] : [at - thick / 2, base + y0, a, at + thick / 2, base + y1, b]);
  };
  let cursor = from;
  for (const [a, b, sill, head] of [...openings].sort((p, q) => p[0] - q[0])) {
    add(cursor, a, 0, height); add(a, b, 0, sill); add(a, b, head, height); cursor = b;
  }
  add(cursor, to, 0, height);
  return pieces;
}

export const planSolids = plan => [...plan.walls.flatMap(w => wallPieces({ height: plan.height, ...w })), ...plan.furniture.map(f => f.box), ...(plan.cityBlocks || [])];
export const furniture = (plan, id) => plan.furniture.find(f => f.id === id).box;
// What stops a body standing on a floor at height `level`: anything between its ankles and its head.
// Window sills do; lintels, shelves overhead and the floor above don't.
export const blocksAt = (b, level = 0) => b[1] < level + 1.7 && b[4] > level + .25;
export const walkRects = (boxes, level = 0) => boxes.filter(b => blocksAt(b, level)).map(b => [b[0], b[2], b[3], b[5]]);
export const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

// The floor under (x, z) for someone now at height `h`: of the floors, stairs and ground there, the nearest one that
// is no more than a step above them. Single-storey plans have no floors listed and stand on `ground` (0).
export function floorAt(plan, x, z, h = 0) {
  const heights = [];
  for (const f of plan.floors || []) if (inRect(f.rect, x, z) && !(f.holes || []).some(r => inRect(r, x, z))) heights.push(f.y);
  for (const r of plan.ramps || []) if (inRect(r.rect, x, z)) heights.push(r.y0 + (r.y1 - r.y0) * (z - r.from) / (r.to - r.from));
  if (!heights.length) heights.push(plan.ground ?? 0);
  const reachable = heights.filter(y => y <= h + .45);
  const pick = reachable.length ? reachable : heights;
  return pick.reduce((a, b) => Math.abs(b - h) < Math.abs(a - h) ? b : a);
}

// Walk a body by (dx, dz) inside `bounds`, sliding along walls and furniture at its own level. With a multi-storey
// `plan`, p.y follows floors and stairs. Someone already overlapping a box (a door swung onto them) may move as long
// as the overlap shrinks, so they can always step back out.
export function walk(p, dx, dz, boxes, bounds, { radius = .26, plan = null, level = 0 } = {}) {
  const out = (x, z) => x < bounds[0] || x > bounds[2] || z < bounds[1] || z > bounds[3];
  const depth = (x, z, h) => {
    let d = 0;
    for (const b of boxes) {
      if (!blocksAt(b, h)) continue;
      const ox = Math.min(x - b[0] + radius, b[3] + radius - x), oz = Math.min(z - b[2] + radius, b[5] + radius - z);
      if (ox > 0 && oz > 0) d = Math.max(d, Math.min(ox, oz));
    }
    return d;
  };
  const here = () => plan ? p.y ?? 0 : level;
  const step = (x, z) => {
    if (out(x, z)) return false;
    const h = plan ? floorAt(plan, x, z, here()) : level, d = depth(x, z, h);
    if (d > 0 && d >= depth(p.x, p.z, here()) - 1e-9) return false;
    p.x = x; p.z = z; if (plan) p.y = h;
    return true;
  };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let i = 0; i < steps; i++) { step(p.x + dx / steps, p.z); step(p.x, p.z + dz / steps); }
  return p;
}

// Look targets are [x, z] or [x, y, z].
export const lookX = p => p[0], lookZ = p => p[p.length - 1], lookY = (p, y = 1.2) => p.length === 3 ? p[1] : y;

// Every spot someone stands on (posts, patrol stops, alert positions), for checks.
export const guardSpots = plan => plan.guards.flatMap(g => [g.at, ...(g.route || []).map(r => r.at), g.alert?.at].filter(Boolean).map(at => ({ id: g.id, at, y: g.y ?? 0 })));

// People: role 'guard' (default), 'guest' (someone under protection), 'prisoner', 'operator' or 'visitor' (a member of
// the public). Duties: watch, radio, patrol, sleep, interrogate, seated (on a chair or a bed edge) and rest (lying
// awake). Ground-floor people carry their y. `model` picks a textured character model instead of a tinted mannequin.

// ── Hollow Pine ────────────────────────────────────────────────────────────────────────────────────────────
// A woodcutter's farmhouse in the pines south-west of Frostford, two kilometres past the North Crossing.
// Great room (hearth, table, kitchen) to the west; bunk room and radio room in the middle; an east wing with the
// interrogation room and the guest room, where a Frostford clerk waits to be taken across. Rangers in uniform.
export const HOLLOW_PINE = {
  id: 'pine', height: 2.7,
  shell: [-6, -4.5, 11, 4.5],
  // Under a roof: no snow falls here. The house and the porch.
  covered: [[-6, -4.5, 11, 4.5], [-3.8, 4.5, -.2, 6]],
  // The yard you can walk: the fence and the tree line close it in.
  bounds: [-14, -9.5, 14, 17],
  walls: [
    { axis: 'x', at: 4.35, from: -6, to: 11, thick: .3, outside: 1, openings: [[-4.9, -3.7, .95, 2], [-2.6, -1.5, 0, 2.15], [-.6, .6, .95, 2], [2.9, 4.1, .95, 2]] },
    { axis: 'x', at: -4.35, from: -6, to: 11, thick: .3, outside: -1, openings: [[-3.8, -2.6, 1.15, 2], [2.6, 3.6, .95, 2]] },
    { axis: 'z', at: -5.85, from: -4.2, to: 4.2, thick: .3, outside: -1, openings: [[1.5, 2.7, .95, 2]] },
    { axis: 'z', at: 10.85, from: -4.2, to: 4.2, thick: .3, outside: 1, openings: [[1.8, 2.8, .95, 2]] }, // guest window, shuttered
    // The old east wall, now inside: doors from the bunk room to the interrogation room, the radio room to the guest room.
    { axis: 'z', at: 5.85, from: -4.2, to: 4.2, thick: .3, openings: [[-3.1, -2, 0, 2.1], [1.6, 2.7, 0, 2.1]] },
    // Log partitions: great room / middle rooms, bunks / radio, interrogation / guest.
    { axis: 'z', at: 1, from: -4.2, to: 4.2, thick: .16, openings: [[-2.9, -1.8, 0, 2.1], [1.3, 2.4, 0, 2.1]] },
    { axis: 'x', at: 0, from: 1.08, to: 5.7, thick: .16 },
    { axis: 'x', at: -.5, from: 6, to: 10.7, thick: .16 },
  ],
  // Front door: hinged at its west jamb, swings inward against the gun rack.
  door: { hinge: [-2.6, 4.35], width: 1.1, closed: [-2.6, 0, 4.25, -1.5, 2.15, 4.45], open: [-2.7, 0, 3.25, -2.56, 2.15, 4.2] },
  hatch: [2.3, 2.8, 3.2, 3.7], // cellar hatch in the radio-room floor
  rooms: { interrogation: [6, -4.2, 10.7, -.58], guest: [6, -.42, 10.7, 4.2] },
  furniture: [
    { id: 'hearth', box: [-5.7, 0, -1.75, -5.1, 1.3, .25] },
    { id: 'logs', box: [-5.7, 0, .45, -5.2, .65, 1.2] },
    { id: 'table', box: [-3.7, 0, -2, -1.5, .8, -.6] },
    { id: 'benchN', box: [-3.6, 0, -2.5, -1.6, .45, -2.15] },
    { id: 'benchS', box: [-3.6, 0, -.45, -1.6, .45, -.1] },
    { id: 'counter', box: [-5.6, 0, -4.2, -1.4, .92, -3.6] },
    { id: 'armchair', box: [-4.5, 0, .75, -3.6, .95, 1.55] },
    { id: 'rack', box: [-3.45, 0, 3.85, -2.8, 1.7, 4.2] },
    { id: 'bunk', box: [3.85, 0, -4.2, 5.7, 1.85, -3.3] },
    { id: 'cot', box: [1.3, 0, -.95, 3.3, .42, -.25] },
    { id: 'locker', box: [4.3, 0, -1, 5.2, .5, -.45] },
    { id: 'radioDesk', box: [5, 0, .35, 5.7, .8, 1.45] },
    { id: 'crates', box: [1.3, 0, 3.35, 2.1, .85, 4.15] },
    // Interrogation room: a table, the prisoner's chair, a bucket.
    { id: 'askTable', box: [7.7, 0, -2.9, 9.1, .76, -1.9] },
    { id: 'askChair', box: [8.15, 0, -1.7, 8.65, .9, -1.2] },
    { id: 'bucket', box: [10.15, 0, -4.05, 10.55, .4, -3.65] },
    // Guest room: bed against the east wall, nightstand, washstand, wardrobe, her suitcase.
    { id: 'guestBed', box: [8.6, 0, -.42, 10.7, .55, .98] },
    { id: 'nightstand', box: [10.1, 0, 1.05, 10.7, .6, 1.6] },
    { id: 'washstand', box: [6, 0, -.42, 6.65, .9, .35] },
    { id: 'wardrobe', box: [6, 0, 3.45, 7.3, 1.95, 4.2] },
    { id: 'suitcase', box: [7.7, 0, 3.5, 8.5, .3, 3.95] },
    // Outside.
    { id: 'chimney', box: [-6.6, 0, -1.25, -6, 5.1, .05] },
    { id: 'woodpile', box: [-1.8, 0, -5.2, 1.6, 1.3, -4.55] },
    { id: 'stump', box: [-.45, 0, -6.6, .05, .55, -6.1] },
    { id: 'outhouse', box: [7.3, 0, -7.8, 8.5, 2.3, -6.6] },
    { id: 'truck', box: [-11.6, 0, 5, -7.4, 2.2, 8.6] },
    { id: 'porchPostW', box: [-3.55, 0, 5.6, -3.4, 2.45, 5.75] },
    { id: 'porchPostE', box: [-.6, 0, 5.6, -.45, 2.45, 5.75] },
    { id: 'fenceW', box: [-14, 0, 10.3, -3.1, 1.1, 10.5] },
    { id: 'fenceE', box: [-.8, 0, 10.3, 14, 1.1, 10.5] },
  ],
  guards: [
    { id: 'halvorsen', name: 'Sgt. Halvorsen', speaker: 'SGT HALVORSEN', duty: 'watch', weapon: 'ready', at: [0, 3.72], look: [0, 12.5], scan: .35,
      alert: { at: [0, 3.78], look: [0, 1.1, 12.5], crouch: .35 } },
    { id: 'dahl', name: 'Cpl. Dahl', speaker: 'CPL DAHL', duty: 'radio', weapon: 'slung', at: [4.55, .9], look: [5.4, .9], hand: [5.32, 1, .85],
      alert: { at: [3.6, 3.75], look: [3.6, 1.1, 12.5], crouch: .3 } },
    { id: 'moss', name: 'Pvt. Moss', speaker: 'PVT MOSS', duty: 'patrol', weapon: 'ready',
      route: [
        { at: [-4.4, -.2], look: [-5.6, -.75], wait: 5 },    // warming his hands at the hearth
        { at: [-3, -3.1], look: [-3, -4.3], wait: 2 },       // kitchen window
        { at: [.3, -2.35], look: [3, -2.35], wait: 2.5 },    // looks in on the bunk room
        { at: [4.95, -2.55], look: [8, -2.55], wait: 3 },    // and through to the prisoner
        { at: [.3, 1.9], look: [3, 1.9], wait: 2.5 },        // the radio room
        { at: [-2.05, 3.55], look: [-2.05, 6], wait: 3.5 },  // checks the front door
      ],
      alert: { at: [-2.05, 3.65], look: [-2.05, 1.1, 9], crouch: .4 } },
    { id: 'lund', name: 'Pvt. Lund', speaker: 'PVT LUND', duty: 'sleep', weapon: 'ready', at: [4.7, -2.75],
      // Asleep on the lower bunk, feet to the door, head to the east wall.
      bed: { x: 3.92, z: -3.75, y: .45, yaw: Math.PI / 2 },
      alert: { at: [3.1, -3.75], look: [3.1, 1.1, -12], crouch: .3 } },
    // The interrogation room: Lt. Sorensen across the table from a Frostford garrison driver tied to his chair.
    { id: 'sorensen', name: 'Lt. Sorensen', speaker: 'LT SORENSEN', duty: 'interrogate', weapon: 'slung', at: [8.4, -3.45], look: [8.4, -1.42],
      lean: [[8.15, .78, -2.78], [8.65, .78, -2.78]],
      alert: { at: [9.15, -1.1], look: [8.4, -1.42], crouch: .1, unarmed: true, hand: [8.55, 1.25, -1.35] } },
    { id: 'rask', name: 'the prisoner', speaker: 'PRISONER', role: 'prisoner', duty: 'seated', tint: '#5e6652', trim: '#2b2d27',
      at: [8.4, -1.42], seat: { x: 8.4, z: -1.42, yaw: 0, hips: .56, hands: 'tied' } },
    // The guest room: Ilse Varga, the clerk who copied Frostford's convoy timetables, and her bodyguard.
    { id: 'brandt', name: 'Cpl. Brandt', speaker: 'CPL BRANDT', duty: 'watch', weapon: 'ready', at: [7, 2.9], look: [5.9, 2.15], scan: .3,
      alert: { at: [9.6, 2.4], look: [12, 1.1, 2.3], crouch: .3 } },
    { id: 'varga', name: 'Ilse Varga', speaker: 'ILSE VARGA', role: 'guest', duty: 'seated', tint: '#7c4a5c', trim: '#3a2a2e',
      at: [9.5, 1.55], seat: { x: 9.5, z: .92, yaw: Math.PI, hips: .62, hands: 'lap' },
      alert: { at: [7.3, .55], look: [6, .6, 2], crouch: .55, unarmed: true } },
  ],
  // The Frostford road along the bottom of the yard. A patrol slows to a crawl past the house and sweeps it.
  road: { y: 0, z: 12.5, from: -48, to: 48, slow: [-12, 15], speed: 9, crawl: 2.4, model: 'suv', length: 4.6, sweep: { z: 4.6, x: [-5.5, 10.5], y: [1, 2] } },
};

// ── Tinker's Loft ──────────────────────────────────────────────────────────────────────────────────────────
// A clock shop in Drakenburg's Riverside district with the flat above it. Upstairs: the front room, kitchen,
// landing, the hidden radio room behind a sliding bookcase (where a defecting engineer sleeps) and a roof terrace.
// Downstairs, 4.4 m lower: the street door, the shuttered shop and Voss's back workshop, now the interrogation room.
// Steep stairs along the west wall join the two. Operatives in plain clothes.
const S = -4.4; // street and shop floor
export const TINKERS_LOFT = {
  id: 'loft', height: 2.8,
  shell: [-6.5, -4.5, 6.5, 4.5],
  covered: [[-6.5, -4.5, 6.5, 4.5]],
  street: S,
  bounds: [-14, -9.4, 14, 13.6],
  ground: S,
  floors: [
    { rect: [-6.2, -4.2, 6.2, 4.2], y: 0, holes: [[-6.2, -4.2, -5, -1]] }, // the flat (stairwell open)
    { rect: [-3.2, -9.4, 3.6, -4.2], y: 0 },                               // roof terrace and back-door sill
    { rect: [-6.2, -4.2, 6.2, 4.5], y: S, holes: [[-6.2, -4.2, -5, 1]] },  // shop floor (the stairs take its west strip)
    { rect: [-14, 4.5, 14, 6.5], y: S + .15 },                             // pavement
    { rect: [-14, 12.5, 14, 14], y: S + .15 },                             // far pavement
  ],
  // The stairs climb north along the west wall, from the street-door corridor to the landing.
  ramps: [{ rect: [-6.2, -4.2, -5, 1], axis: 'z', from: -4.2, to: 1, y0: 0, y1: S }],
  walls: [
    // Upstairs.
    { axis: 'x', at: 4.35, from: -6.5, to: 6.5, thick: .3, outside: 1, openings: [[-5.1, -3.9, .8, 2.35], [-.6, .6, .8, 2.35], [3.9, 5.1, .8, 2.35]] },
    { axis: 'x', at: -4.35, from: -6.5, to: 6.5, thick: .3, outside: -1, openings: [[.4, 1.5, 0, 2.15], [5, 5.9, 1.55, 2.2]] },
    { axis: 'z', at: -6.35, from: -4.2, to: 4.2, thick: .3, outside: -1 },
    { axis: 'z', at: 6.35, from: -4.2, to: 4.2, thick: .3, outside: 1 },
    // Front room / back rooms; the third opening is the hidden room, behind the bookcase.
    { axis: 'x', at: .6, from: -6.2, to: 6.2, thick: .14, openings: [[-4.3, -3.2, 0, 2.15], [-1.1, 0, 0, 2.15], [3.65, 4.65, 0, 2.1]] },
    { axis: 'z', at: -2.5, from: -4.2, to: .53, thick: .14, openings: [[-2.7, -1.6, 0, 2.15]] },
    { axis: 'z', at: 2.3, from: -4.2, to: .53, thick: .14 },
    // Downstairs (4.1 m high, up to the underside of the flat's floor).
    { axis: 'x', at: 4.35, from: -6.5, to: 6.5, thick: .3, outside: 1, base: S, height: 4.1, openings: [[-6.1, -5.1, 0, 2.3], [-3, 3, .6, 2.9]] },
    { axis: 'x', at: -4.35, from: -6.5, to: 6.5, thick: .3, outside: -1, base: S, height: 4.1 },
    { axis: 'z', at: -6.35, from: -4.2, to: 4.2, thick: .3, outside: -1, base: S, height: 4.1 },
    { axis: 'z', at: 6.35, from: -4.2, to: 4.2, thick: .3, outside: 1, base: S, height: 4.1 },
    { axis: 'z', at: -4.93, from: -4.2, to: 4.2, thick: .14, base: S, height: 4.1, openings: [[2.9, 3.9, 0, 2.2]] }, // stair corridor / shop
    { axis: 'x', at: .6, from: -4.86, to: 6.2, thick: .14, base: S, height: 4.1, openings: [[2.6, 3.6, 0, 2.2]] },  // shop / workshop
  ],
  // The bookcase in front of the hidden doorway slides east along the partition.
  bookcase: { x0: 3.45, x1: 4.85, z0: .67, z1: 1.05, height: 2.25, slide: 1.33 },
  // Street door at the foot of the stairs: hinged on the west wall, opens inward along it.
  door: { hinge: [-6.1, 4.35], width: 1, closed: [-6.1, S, 4.25, -5.1, S + 2.3, 4.45], open: [-6.2, S, 3.25, -6.08, S + 2.3, 4.2] },
  stairwell: [-6.2, -4.2, -5, -1],
  terrace: [-3.2, -9.4, 3.6, -4.5],
  rooms: { interrogation: [-4.86, -4.2, 6.2, .53], shop: [-4.86, .67, 6.2, 4.2] },
  furniture: [
    // Upstairs. The stairwell is railed on the east and south; you step onto the stairs at its north end.
    { id: 'railE', box: [-5.05, 0, -3.5, -4.95, 1, -1] },
    { id: 'railS', box: [-6.2, 0, -1.05, -5, 1, -.95] },
    { id: 'coats', box: [-3.2, 0, -4.1, -2.8, 1.8, -3.7] },
    { id: 'counter', box: [-2.43, 0, -4.2, .25, .92, -3.6] },
    { id: 'fridge', box: [1.6, 0, -4.2, 2.23, 1.75, -3.6] },
    { id: 'chess', box: [-1.4, 0, -2.3, -.2, .74, -1.3] },
    { id: 'chairW', box: [-1.95, 0, -2.05, -1.55, .9, -1.55] },
    { id: 'chairE', box: [-.05, 0, -2.05, .35, .9, -1.55] },
    { id: 'bench', box: [-6.2, 0, 1.2, -5.45, .95, 3.3] },
    { id: 'sofa', box: [-2.9, 0, 1.3, -.9, .85, 2.15] },
    { id: 'lamp', box: [-3.32, 0, 1.3, -3.02, 1.6, 1.6] },
    { id: 'coffee', box: [-2.5, 0, 2.6, -1.3, .42, 3.25] },
    { id: 'grandfather', box: [1.15, 0, .67, 1.7, 2.1, 1.1] },
    { id: 'radioDesk', box: [5.55, 0, -3.1, 6.2, .8, -1.1] },
    { id: 'tripod', box: [5.15, 0, -4.05, 5.65, 1.5, -3.55] },
    { id: 'files', box: [2.37, 0, -4.2, 2.95, 1.3, -3.6] },
    { id: 'guestBed', box: [2.37, 0, -3.45, 3.3, .5, -1.45] }, // the engineer's bed in the hidden room
    // Roof terrace.
    { id: 'parapetW', box: [-3.4, 0, -9.6, -3.2, 1, -4.5] },
    { id: 'parapetE', box: [3.6, 0, -9.6, 3.8, 1, -4.5] },
    { id: 'parapetN', box: [-3.4, 0, -9.6, 3.8, 1, -9.4] },
    { id: 'tank', box: [1.8, 0, -9.3, 3.4, 2.4, -7.8] },
    { id: 'coop', box: [-3.15, 0, -7.6, -2, 1.4, -6.4] },
    { id: 'mast', box: [-2.75, 0, -9.05, -2.45, 5, -8.75] },
    // Downstairs: the shop behind its shutter, and the workshop.
    { id: 'shutter', box: [-3.05, S, 4.5, 3.05, S + 2.95, 4.58] },
    { id: 'shopCounter', box: [-1.5, S, 1.6, 2.5, S + 1, 2.2] },
    { id: 'cases', box: [5.3, S, 1.2, 6.2, S + 1, 4] },
    { id: 'sheeted', box: [-3.4, S, 3.35, -2, S + .95, 4.1] },
    { id: 'workbench', box: [-4.8, S, -4.2, -1, S + .95, -3.55] },
    { id: 'crates', box: [-4.8, S, -1.6, -3.7, S + 1.1, -.5] },
    { id: 'askTable', box: [2.4, S, -2.7, 3.8, S + .76, -1.7] },
    { id: 'askChair', box: [2.85, S, -1.4, 3.35, S + .9, -.9] },
    // Across the street: lamp posts.
    { id: 'lampW', box: [-9.1, S, 6, -8.9, S + 4.6, 6.2] },
    { id: 'lampE', box: [9.9, S, 12.8, 10.1, S + 4.6, 13] },
  ],
  guards: [
    { id: 'okafor', name: 'Sgt. Okafor', speaker: 'SGT OKAFOR', duty: 'watch', weapon: 'concealed', tint: '#4a5f86', at: [5.55, 3.9], look: [3.2, 9.5], scan: .2,
      alert: { at: [4.5, 3.85], look: [4.5, -3.4, 9.5], crouch: .4 } },
    // Marek watches the top of the stairs from a step back, leaving the way along the rail to the stairs open.
    { id: 'marek', name: 'Marek', speaker: 'MAREK', duty: 'watch', weapon: 'ready', tint: '#5d6168', at: [-3.85, -3], look: [-5.6, -3.9], scan: .25,
      alert: { at: [-3.95, -2.4], look: [-5.6, -2.2, -.5], crouch: .4 } },
    { id: 'teo', name: 'Teo', speaker: 'TEO', duty: 'patrol', weapon: 'concealed', tint: '#8a6446',
      route: [
        { at: [0, 2.75], look: [0, 9.5], wait: 3 },                    // the street from the middle window
        { at: [-4.6, 2.2], look: [-5.8, 2.2], wait: 3.5 },             // Voss's workbench
        { at: [-.75, -.88], look: [-.8, -1.8], wait: 4.5, act: 'chess' }, // makes his move
        { at: [.95, -5.6], look: [.4, -9.6], wait: 4 },                // over the parapet at the rail yard
        { at: [-1.4, -6.6], look: [-2.6, -7], wait: 3 },               // the pigeons
        { at: [-3.4, -1.9], look: [-3.85, -3], wait: 2.5 },            // a word with Marek
      ],
      alert: { at: [-4.5, 3.85], look: [-4.5, -3.4, 9.5], crouch: .35 } },
    { id: 'vesna', name: 'Cpl. Ilić', speaker: 'CPL ILIĆ', duty: 'radio', weapon: 'concealed', tint: '#58745f', at: [5, -2.1], look: [5.8, -2.1], hand: [5.72, .98, -2.1],
      alert: { at: [5, -2.1], look: [5.8, .9, -2.1], crouch: .3, unarmed: true } },
    // The defector, awake on the bed in the hidden room. He stays put when the patrol comes: that is what the room is for.
    { id: 'roth', name: 'Dr. Roth', speaker: 'DR ROTH', role: 'guest', duty: 'rest', tint: '#6b7280', trim: '#2f3136', at: [3.75, -1],
      bed: { x: 2.83, z: -1.6, y: .5, yaw: Math.PI } },
    // Downstairs: Piet holds the shop behind the street door; Rosa questions a militia courier in the workshop.
    { id: 'piet', name: 'Piet', speaker: 'PIET', duty: 'watch', weapon: 'ready', tint: '#4d5a4a', y: S, at: [-4.1, 2.2], look: [-5, 3.4], scan: .3,
      alert: { at: [-4.2, 3.4], look: [-5.6, S + 1.1, 4.5], crouch: .3 } },
    { id: 'rosa', name: 'Rosa', speaker: 'ROSA', duty: 'interrogate', weapon: 'concealed', tint: '#6e4a6a', y: S, at: [3.1, -3.3], look: [3.1, -1.12],
      lean: [[2.85, S + .78, -2.58], [3.35, S + .78, -2.58]],
      alert: { at: [3.85, -.85], look: [3.1, -1.12], crouch: .1, unarmed: true, hand: [3.25, S + 1.25, -1.05] } },
    { id: 'courier', name: 'the courier', speaker: 'COURIER', role: 'prisoner', duty: 'seated', tint: '#2f2f35', trim: '#1c1c1f', y: S,
      at: [3.1, -1.12], seat: { x: 3.1, z: -1.12, yaw: 0, hips: .56, hands: 'tied' } },
  ],
  // The street below. An armoured militia van crawls past and sweeps the facade with its roof light.
  road: { y: S, z: 9.5, from: -46, to: 46, slow: [-10, 10], speed: 8, crawl: 2.2, model: 'van', length: 5, sweep: { z: 4.6, x: [-5, 5], y: [.9, 2.2] } },
};

// Veyr Transport: street-level appointments office, rear dispatch and a real basement.
export const VEYR_TRANSPORT = {
 id:'transport',height:3.2,ground:0,street:0,shell:[-6.5,-10,6.5,5],covered:[[-20,-5,19.5,5],[-6.5,-10,6.5,-5]],bounds:[-35,-10,35,35],
 cityBlocks:[[-20,0,-5,-6.5,3.45,5],[-35,0,17,-25,13,32],[-20,0,17,1,18,32],[3,0,17,19,14,32],[27,0,17,35,20,32]],
 garageDoors:[{id:'garageA',x:8,width:4,z:4.9,height:2.9},{id:'garageB',x:14,width:4,z:4.9,height:2.9}],
 floors:[{rect:[6.3,-9.8,19.3,4.8],y:0},{rect:[-6.3,-9.8,6.3,4.8],y:0,holes:[[-6.2,-4,-4.6,2]]},{rect:[-6.3,-9.8,19.3,4.8],y:-3.2,holes:[[-6.2,-4.4,-4.6,2.4]]}],
 ramps:[{rect:[-6.2,-4.4,-4.6,2.4],from:-4.4,to:2.4,y0:0,y1:-3.2}],
 rooms:{interrogation:[10.1,-9.8,19.2,-3.1]},
 walls:[
  {axis:'x',at:-3,from:10,to:19.3,base:-3.2,openings:[[11,12.4,0,2.4],[14,17.8,1,2.4]]},
  {axis:'z',at:10,from:-9.8,to:-3,base:-3.2,openings:[[-8.5,-5,1,2.4]]},
  {axis:'x',at:4.9,from:6.5,to:19.5,thick:.25,outside:1,openings:[[8,12,0,2.9],[14,18,0,2.9]]},
  {axis:'x',at:-4.9,from:6.5,to:19.5,thick:.25,outside:-1},
  {axis:'z',at:19.4,from:-4.775,to:4.775,thick:.2,outside:1},
  {axis:'x',at:4.9,from:-6.5,to:6.5,thick:.25,outside:1,openings:[[-1, .4,0,2.4],[2,3.4,1.2,2.35],[-4,-2.6,1.2,2.35]]},
  {axis:'x',at:-9.9,from:-6.5,to:6.5,thick:.25,outside:-1},
  {axis:'z',at:-6.4,from:-9.775,to:4.775,thick:.2,outside:-1},
  {axis:'z',at:6.4,from:-9.775,to:4.775,thick:.2,outside:1,openings:[[-3.8,-2.3,0,2.4]]},
  {axis:'x',at:0,from:-4.4,to:6.3,openings:[[.8,2.2,0,2.4]]},
  {axis:'z',at:-4.45,from:-3.6,to:4.8,thick:.2},
  // Below the ground floor the stairs are walled in: nobody walks under them or climbs on from the side.
  // The side wall rises to the slab and carries the partition above; the end wall stops just under the floor.
  {axis:'z',at:-4.45,from:-4.6,to:2.4,base:-3.2,thick:.2},
  {axis:'x',at:-4.5,from:-6.3,to:-4.55,base:-3.2,height:3.18,thick:.2},
  ...[-3.2].flatMap(base=>[
   {axis:'x',at:-9.9,from:-6.5,to:19.5,base,thick:.25},
   {axis:'x',at:4.9,from:-6.5,to:19.5,base,thick:.25},
   {axis:'z',at:-6.4,from:-9.775,to:4.775,base,thick:.2},
   {axis:'z',at:19.4,from:-9.775,to:4.775,base,thick:.2}]),
 ],
 furniture:[
  {id:'serverA',box:[7.6,-3.2,-9.5,8.4,-.85,-8.6]},
  {id:'serverB',box:[8.5,-3.2,-9.5,9.3,-.85,-8.6]},
  {id:'lockers',box:[3,-3.2,4.02,5.9,-1.1,4.7]},
  {id:'restBench',box:[8.3,-3.2,4.05,10.5,-2.7,4.65]},
  {id:'breakCounter',box:[11,-3.2,3.9,15,-2.35,4.65]},
  {id:'briefSeatW',box:[-1.65,-3.2,-.35,-1.1,-2.68,.25]},
  {id:'briefSeatE',box:[2,-3.2,-.35,2.55,-2.68,.25]},
  {id:'opsDesk',box:[1.8,-3.2,-8.5,7.2,-2.4,-7.3]},
  {id:'askTable',box:[13.5,-3.2,-7.4,16,-2.4,-6.1]},
  {id:'terminalSeatA',box:[2.7,-3.2,-7.2,3.3,-2.68,-6.6]},
  {id:'terminalSeatB',box:[5.7,-3.2,-7.2,6.3,-2.68,-6.6]},
  {id:'askSeatA',box:[14.4,-3.2,-8.4,15,-2.68,-7.8]},
  {id:'askSeatB',box:[14.4,-3.2,-5.7,15,-2.68,-5.1]},

  {id:'reception',box:[-3.8,0,1.1,-.8,1.05,1.85]},
  {id:'waiting',box:[4.9,0,1.1,5.9,.5,3.8]},
  {id:'files',box:[3.7,0,-4.65,6.1,2,-4.05]},
  {id:'dispatch',box:[-2.8,0,-4.6,.3,.8,-3.7]},
  {id:'cargo',box:[4.8,0,-8.8,6.1,1.3,-7.1]},
  // Rear dispatch: a wrapped pallet and two roll cages against the back wall.
  {id:'pallet',box:[-4.3,0,-9.7,-3.1,1.25,-8.5]},
  {id:'cageA',box:[.5,0,-9.7,1.3,1.75,-9]},
  {id:'cageB',box:[1.45,0,-9.7,2.25,1.75,-9]},
  {id:'radioDesk',box:[2,-3.2,-4.6,5.8,-2.4,-3.7]},
  {id:'stores',box:[18.3,-3.2,-1.5,19.1,-1,3.8]},
  {id:'briefing',box:[-.8,-3.2,-.8,1.6,-2.4,.8]},
  {id:'rail',box:[-4.7,0,-3.6,-4.55,1,2.5]},
 ],
 guards:[
  {id:'marek',name:'Marek',speaker:'MAREK',duty:'watch',weapon:'ready',uniform:true,tint:'#535d5c',at:[3,-1.4],look:[1.5,0],scan:.15},
  {id:'piet',name:'Piet',speaker:'PIET',duty:'watch',weapon:'ready',uniform:true,tint:'#5c6251',y:-3.2,at:[-3,2.9],look:[-5.3,2.5],scan:.18},
  {id:'ilya',name:'Cpl. Ilya',speaker:'ILYA',uniform:true,duty:'watch',weapon:'ready',at:[3.8,-7],look:[6.4,-3],scan:.15},
  {id:'nash',name:'Pvt. Nash',speaker:'NASH',uniform:true,duty:'watch',weapon:'ready',y:-3.2,at:[9,-1.8],look:[11.7,-3],scan:.15},
  ...[['vesna','Vesna',3],['oren','Oren',6]].map(([id,name,x])=>({id,name,speaker:name.toUpperCase(),role:'operator',duty:'seated',tint:'#566578',y:-3.2,at:[x,-6.3],seat:{x,z:-6.9,yaw:0,hips:.6,hands:'terminal'}})),
  // A delivery driver waiting on a parcel: the only member of the public inside. He drifts between the empty
  // counter, the street window and the waiting bench.
  {id:'tomas',name:'Tomas',speaker:'TOMAS',role:'visitor',duty:'patrol',model:'delivery',route:[
   {at:[-2.3,2.45],look:[-2.3,1.4],wait:6},
   {at:[2.7,4.15],look:[2.7,7],wait:5},
   {at:[4.25,2.6],look:[6.3,2.6],wait:7},
  ]},
 ],
 road:{y:0,z:10,from:-48,to:48,slow:[-12,15],speed:9,crawl:2.4,model:'van',length:4.6,sweep:{z:5,x:[-5,5],y:[1,2.5]}},
};
