// Floor plans for Outpost 07's two safe houses behind the Veyr river: walls with door and window openings,
// furniture, guard posts, and the road an enemy patrol drives along. Plain data and geometry with no Three.js,
// shared by the scenes (scenarios/safehouse-*.js through safehouse.js) and their tests.
// Boxes are [minX, minY, minZ, maxX, maxY, maxZ]; rectangles are [minX, minZ, maxX, maxZ]. +Z is south, floors at y = 0.

// Boxes for one straight wall. axis 'x' runs from `from` to `to` along X at z = at; axis 'z' runs along Z at x = at.
// Openings are [a, b, sill, head] along the wall: a door has sill 0, a window has its sill above the floor.
export function wallPieces({ axis, at, from, to, thick = .2, height, openings = [] }) {
  const pieces = [];
  const add = (a, b, y0, y1) => {
    if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
    pieces.push(axis === 'x' ? [a, y0, at - thick / 2, b, y1, at + thick / 2] : [at - thick / 2, y0, a, at + thick / 2, y1, b]);
  };
  let cursor = from;
  for (const [a, b, sill, head] of [...openings].sort((p, q) => p[0] - q[0])) {
    add(cursor, a, 0, height); add(a, b, 0, sill); add(a, b, head, height); cursor = b;
  }
  add(cursor, to, 0, height);
  return pieces;
}

export const planSolids = plan => [...plan.walls.flatMap(w => wallPieces({ height: plan.height, ...w })), ...plan.furniture.map(f => f.box)];
export const furniture = (plan, id) => plan.furniture.find(f => f.id === id).box;
// What stops a body: anything between ankle and head height. Window sills do; lintels and shelves overhead don't.
export const blocksWalking = b => b[1] < 1.7 && b[4] > .25;
export const walkRects = boxes => boxes.filter(blocksWalking).map(b => [b[0], b[2], b[3], b[5]]);
export const inRect = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];

// Walk a body by (dx, dz) inside `bounds`, sliding along walls and furniture. Someone already overlapping a box
// (a door swung onto them) may move as long as the overlap shrinks, so they can always step back out.
export function walk(p, dx, dz, boxes, bounds, radius = .26) {
  const low = boxes.filter(blocksWalking);
  const out = (x, z) => x < bounds[0] || x > bounds[2] || z < bounds[1] || z > bounds[3];
  const depth = (x, z) => {
    let d = 0;
    for (const b of low) {
      const ox = Math.min(x - b[0] + radius, b[3] + radius - x), oz = Math.min(z - b[2] + radius, b[5] + radius - z);
      if (ox > 0 && oz > 0) d = Math.max(d, Math.min(ox, oz));
    }
    return d;
  };
  const ok = (x, z) => !out(x, z) && (depth(x, z) === 0 || depth(x, z) < depth(p.x, p.z) - 1e-9);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let i = 0; i < steps; i++) {
    if (ok(p.x + dx / steps, p.z)) p.x += dx / steps;
    if (ok(p.x, p.z + dz / steps)) p.z += dz / steps;
  }
  return p;
}

// Look targets are [x, z] or [x, y, z].
export const lookX = p => p[0], lookZ = p => p[p.length - 1], lookY = (p, y = 1.2) => p.length === 3 ? p[1] : y;

// Every spot a guard stands on (posts, patrol stops, alert positions), for checks.
export const guardSpots = plan => plan.guards.flatMap(g => [g.at, ...(g.route || []).map(r => r.at), g.alert.at].filter(Boolean));

// ── Hollow Pine ────────────────────────────────────────────────────────────────────────────────────────────
// A woodcutter's farmhouse in the pines south of Frostford, two kilometres past the North Crossing.
// Great room (hearth, table, kitchen) to the west; bunk room and radio room to the east. Four rangers in uniform.
export const HOLLOW_PINE = {
  id: 'pine', height: 2.7,
  shell: [-6, -4.5, 6, 4.5],
  // Under a roof: no snow falls here. The house and the porch.
  covered: [[-6, -4.5, 6, 4.5], [-3.8, 4.5, -.2, 6]],
  // The yard you can walk: the fence and the tree line close it in.
  bounds: [-14, -9.5, 14, 17],
  walls: [
    { axis: 'x', at: 4.35, from: -6, to: 6, thick: .3, outside: 1, openings: [[-4.9, -3.7, .95, 2], [-2.6, -1.5, 0, 2.15], [-.6, .6, .95, 2], [2.9, 4.1, .95, 2]] },
    { axis: 'x', at: -4.35, from: -6, to: 6, thick: .3, outside: -1, openings: [[-3.8, -2.6, 1.15, 2], [2.6, 3.6, .95, 2]] },
    { axis: 'z', at: -5.85, from: -4.2, to: 4.2, thick: .3, outside: -1, openings: [[1.5, 2.7, .95, 2]] },
    { axis: 'z', at: 5.85, from: -4.2, to: 4.2, thick: .3, outside: 1, openings: [[-3.1, -2, .95, 2], [1.6, 2.7, .95, 2]] },
    // Log partition between the great room and the two east rooms, and between bunks and radio.
    { axis: 'z', at: 1, from: -4.2, to: 4.2, thick: .16, openings: [[-2.9, -1.8, 0, 2.1], [1.3, 2.4, 0, 2.1]] },
    { axis: 'x', at: 0, from: 1.08, to: 5.7, thick: .16 },
  ],
  // Front door: hinged at its west jamb, swings inward against the gun rack.
  door: { hinge: [-2.6, 4.35], width: 1.1, closed: [-2.6, 0, 4.25, -1.5, 2.15, 4.45], open: [-2.7, 0, 3.25, -2.56, 2.15, 4.2] },
  hatch: [2.3, 2.8, 3.2, 3.7], // cellar hatch in the radio-room floor
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
    // Outside.
    { id: 'chimney', box: [-6.6, 0, -1.25, -6, 5.1, .05] },
    { id: 'woodpile', box: [6.05, 0, -2, 6.75, 1.3, 1.2] },
    { id: 'stump', box: [7.25, 0, 2.25, 7.75, .55, 2.75] },
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
        { at: [-4.4, -.2], look: [-5.6, -.75], wait: 5 },   // warming his hands at the hearth
        { at: [-3, -3.1], look: [-3, -4.3], wait: 2 },      // kitchen window
        { at: [.3, -2.35], look: [3, -2.35], wait: 3 },     // looks in on the bunk room
        { at: [.3, 1.9], look: [3, 1.9], wait: 2.5 },       // and the radio room
        { at: [-2.05, 3.55], look: [-2.05, 6], wait: 3.5 }, // checks the front door
      ],
      alert: { at: [-2.05, 3.65], look: [-2.05, 1.1, 9], crouch: .4 } },
    { id: 'lund', name: 'Pvt. Lund', speaker: 'PVT LUND', duty: 'sleep', weapon: 'ready', at: [4.7, -2.75],
      // Asleep on the lower bunk, feet to the door, head to the east wall.
      bed: { x: 3.92, z: -3.75, y: .45, yaw: Math.PI / 2 },
      alert: { at: [5.25, -2.55], look: [12, 1.1, -2.55], crouch: .3 } },
  ],
  // The Frostford road along the bottom of the yard. A patrol slows to a crawl past the house and sweeps it.
  road: { y: 0, z: 12.5, from: -48, to: 48, slow: [-12, 12], speed: 9, crawl: 2.4, model: 'suv', length: 4.6, sweep: { z: 4.6, x: [-5.5, 5.5], y: [1, 2] } },
};

// ── Tinker's Loft ──────────────────────────────────────────────────────────────────────────────────────────
// A flat above a shuttered clock shop in Drakenburg's Riverside district. The street is 4.4 m below the front
// windows; the back door opens onto a flat roof. Four operatives in plain clothes.
export const TINKERS_LOFT = {
  id: 'loft', height: 2.8,
  shell: [-6.5, -4.5, 6.5, 4.5],
  covered: [[-6.5, -4.5, 6.5, 4.5]],
  street: -4.4,
  bounds: [-6.2, -9.4, 6.2, 4.2],
  walls: [
    { axis: 'x', at: 4.35, from: -6.5, to: 6.5, thick: .3, outside: 1, openings: [[-5.1, -3.9, .8, 2.35], [-.6, .6, .8, 2.35], [3.9, 5.1, .8, 2.35]] },
    { axis: 'x', at: -4.35, from: -6.5, to: 6.5, thick: .3, outside: -1, openings: [[.4, 1.5, 0, 2.15], [5, 5.9, 1.55, 2.2]] },
    { axis: 'z', at: -6.35, from: -4.2, to: 4.2, thick: .3, outside: -1 },
    { axis: 'z', at: 6.35, from: -4.2, to: 4.2, thick: .3, outside: 1 },
    // Front room / back rooms; the third opening is the hidden room, behind the bookcase.
    { axis: 'x', at: .6, from: -6.2, to: 6.2, thick: .14, openings: [[-4.3, -3.2, 0, 2.15], [-1.1, 0, 0, 2.15], [3.65, 4.65, 0, 2.1]] },
    { axis: 'z', at: -2.5, from: -4.2, to: .53, thick: .14, openings: [[-2.7, -1.6, 0, 2.15]] },
    { axis: 'z', at: 2.3, from: -4.2, to: .53, thick: .14 },
  ],
  // The bookcase in front of the hidden doorway slides east along the partition.
  bookcase: { x0: 3.45, x1: 4.85, z0: .67, z1: 1.05, height: 2.25, slide: 1.33 },
  stairwell: [-6.2, -4.2, -5, -1], // stairs down to the shop; the rail and Marek keep it shut
  terrace: [-3.2, -9.4, 3.6, -4.5],
  furniture: [
    { id: 'stairs', box: [-6.2, 0, -4.2, -5, 1, -1] },
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
    // Roof terrace.
    { id: 'parapetW', box: [-3.4, 0, -9.6, -3.2, 1, -4.5] },
    { id: 'parapetE', box: [3.6, 0, -9.6, 3.8, 1, -4.5] },
    { id: 'parapetN', box: [-3.4, 0, -9.6, 3.8, 1, -9.4] },
    { id: 'tank', box: [1.8, 0, -9.3, 3.4, 2.4, -7.8] },
    { id: 'coop', box: [-3.15, 0, -7.6, -2, 1.4, -6.4] },
    { id: 'mast', box: [-2.75, 0, -9.05, -2.45, 5, -8.75] },
  ],
  guards: [
    { id: 'okafor', name: 'Sgt. Okafor', speaker: 'SGT OKAFOR', duty: 'watch', weapon: 'concealed', tint: '#4a5f86', at: [5.55, 3.9], look: [3.2, 9.5], scan: .2,
      alert: { at: [4.5, 3.85], look: [4.5, -3.4, 9.5], crouch: .4 } },
    { id: 'marek', name: 'Marek', speaker: 'MAREK', duty: 'watch', weapon: 'ready', tint: '#5d6168', at: [-4.45, -.5], look: [-5.6, -2.6], scan: .25,
      alert: { at: [-4.55, -1.3], look: [-5.6, -2.2, -3.6], crouch: .4 } },
    { id: 'teo', name: 'Teo', speaker: 'TEO', duty: 'patrol', weapon: 'concealed', tint: '#8a6446',
      route: [
        { at: [0, 2.75], look: [0, 9.5], wait: 3 },                    // the street from the middle window
        { at: [-4.6, 2.2], look: [-5.8, 2.2], wait: 3.5 },             // Voss's workbench
        { at: [-.75, -.88], look: [-.8, -1.8], wait: 4.5, act: 'chess' }, // makes his move
        { at: [.95, -5.6], look: [.4, -9.6], wait: 4 },                // over the parapet at the rail yard
        { at: [-1.4, -6.6], look: [-2.6, -7], wait: 3 },               // the pigeons
        { at: [-3.6, -2], look: [-4.45, -.5], wait: 2.5 },             // a word with Marek
      ],
      alert: { at: [-4.5, 3.85], look: [-4.5, -3.4, 9.5], crouch: .35 } },
    { id: 'vesna', name: 'Cpl. Ilić', speaker: 'CPL ILIĆ', duty: 'radio', weapon: 'concealed', tint: '#58745f', at: [5, -2.1], look: [5.8, -2.1], hand: [5.72, .98, -2.1],
      alert: { at: [5, -2.1], look: [5.8, .9, -2.1], crouch: .3, unarmed: true } },
  ],
  // The street below. An armoured militia van crawls past and sweeps the facade with its roof light.
  road: { y: -4.4, z: 9.5, from: -46, to: 46, slow: [-10, 10], speed: 8, crawl: 2.2, model: 'van', length: 5, sweep: { z: 4.6, x: [-5, 5], y: [.9, 2.2] } },
};
