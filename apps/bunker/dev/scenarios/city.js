import * as THREE from 'three';
import { facing } from '../kit.js';
import { angleDelta, damp } from '../easing.js';
import { aimPistol, aimRifle, crouch } from '../../rig.js';
import { gunshot, impact } from '../sound.js';
import { createEffects, plan, route, seeded } from '../combat.js';

// City operation: soldiers hold a corner store on one block of a city street.
// Only this block is built; fog hides where the city would continue.
// +Z points south (toward the default camera). Rectangles are [minX, minZ, maxX, maxZ].
const STORE = [-7, -10, 7, 1.5];
const BLOCKS = [STORE, [-27, -12, -7.4, 1.5], [9.6, -12, 27, 1.5], [-27, 16.5, -3, 30], [3, 16.5, 27, 30]];
const OUTSIDE_BLOCKS = BLOCKS.slice(1);
const inStore = (x, z) => x > STORE[0] && x < STORE[2] && z > STORE[1] && z < STORE[3];
const DOOR_OUT = [0, 2.7], DOOR_IN = [0, -.7];
const HOSTILES = [[24, 6], [26, 10.5], [23, 13]];
const MODES = ['Patrol', 'Alert', 'Take cover', 'Firefight', 'Intruders'];

// Walking routes that respect the store walls: in or out through the front door.
function walkPath(from, to) {
  const a = inStore(...from), b = inStore(...to);
  if (a && b) return [to];
  if (a) return [DOOR_IN, DOOR_OUT, ...plan(DOOR_OUT, to, OUTSIDE_BLOCKS)];
  if (b) return [...plan(from, DOOR_OUT, OUTSIDE_BLOCKS), DOOR_IN, to];
  return plan(from, to, BLOCKS);
}

// --- Scene building ---------------------------------------------------------
function facadeTexture(random, { cols, rows, base, lit = .18 }) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  const w = 256 / cols, h = 256 / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    g.fillStyle = random() < lit ? (random() < .5 ? '#e8c27a' : '#c9d6e0') : '#151b20';
    g.fillRect(x * w + w * .22, y * h + h * .2, w * .56, h * .55);
    g.fillStyle = '#00000040'; g.fillRect(x * w + w * .18, y * h + h * .75, w * .64, h * .06);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function signTexture(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1c2a2e'; g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#e9d29a'; g.font = 'bold 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildCity(group) {
  const random = seeded(31);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const mat = (color, roughness = 1, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const box = (parent, x0, y0, z0, x1, y1, z1, m) => { const b = new THREE.Mesh(cube, m); b.scale.set(x1 - x0, y1 - y0, z1 - z0); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(b); return b; };
  const asphalt = mat('#25292b'), sidewalk = mat('#4a4d4b'), paint = new THREE.MeshBasicMaterial({ color: '#b7b19c' });

  // Ground: street, sidewalks, side street and alley.
  box(group, -40, -.05, -20, 40, 0, 40, mat('#202325'));
  box(group, -32, 0, 4, 32, .02, 14, asphalt);
  box(group, -3, 0, 14, 3, .02, 40, asphalt);
  box(group, -32, 0, 1.5, 32, .14, 4, sidewalk);
  box(group, -32, 0, 14, -3, .14, 16.5, sidewalk); box(group, 3, 0, 14, 32, .14, 16.5, sidewalk);
  for (let x = -30; x < 30; x += 4) box(group, x, .02, 8.92, x + 2, .03, 9.08, paint);
  for (let x = -2.6; x < 3; x += .9) box(group, x, .02, 14.3, x + .5, .03, 16.2, paint); // crosswalk

  // Neighbouring buildings: plain boxes with a window texture on the street face only.
  const facade = (rect, height, faceSouth, cols, base) => {
    const side = mat('#2a2f33');
    const front = new THREE.MeshStandardMaterial({ map: facadeTexture(random, { cols, rows: Math.round(height / 3), base }), roughness: 1 });
    const materials = [side, side, side, side, faceSouth ? front : side, faceSouth ? side : front];
    const b = new THREE.Mesh(cube, materials);
    b.scale.set(rect[2] - rect[0], height, rect[3] - rect[1]); b.position.set((rect[0] + rect[2]) / 2, height / 2, (rect[1] + rect[3]) / 2); group.add(b);
  };
  facade([-27, -12, -7.4, 1.5], 10.5, true, 6, '#5b5048');
  facade([9.6, -12, 27, 1.5], 13, true, 6, '#4c5258');
  facade([-27, 16.5, -3, 30], 12, false, 8, '#565a52');
  facade([3, 16.5, 27, 30], 9, false, 8, '#5e4d45');
  for (const x of [-30, 30]) box(group, x - 1.5, 0, -14, x + 1.5, 14, 32, mat('#1b2125')); // street ends, mostly lost in fog

  // The store: brick shell with a broken storefront and an interior.
  const brick = mat('#6e5146'), plaster = mat('#8b867b'), trim = mat('#2d3436', .6, .4), dark = new THREE.MeshBasicMaterial({ color: '#0e1316' });
  const store = new THREE.Group(); group.add(store);
  const T = .3, H1 = 4.4, H2 = 7.6;
  // Front wall (z 1.2..1.5): two display windows and a central door.
  box(store, -7, 0, 1.2, -6, H1, 1.5, brick); box(store, 6, 0, 1.2, 7, H1, 1.5, brick);
  for (const [x0, x1] of [[-6, -1.8], [1.8, 6]]) { box(store, x0, 0, 1.2, x1, .9, 1.5, brick); box(store, x0, 3.2, 1.2, x1, H1, 1.5, brick); box(store, x0, .86, 1.1, x1, .92, 1.6, trim); }
  box(store, -1.8, 0, 1.2, -1, H1, 1.5, brick); box(store, 1, 0, 1.2, 1.8, H1, 1.5, brick); box(store, -1, 2.6, 1.2, 1, H1, 1.5, brick);
  const glass = new THREE.MeshStandardMaterial({ color: '#9cc3cf', transparent: true, opacity: .22, roughness: .1, metalness: .2, depthWrite: false });
  box(store, -6, .92, 1.33, -4.3, 3.2, 1.37, glass); box(store, 4.8, 2.1, 1.33, 6, 3.2, 1.37, glass); // what's left of the glass
  for (let i = 0; i < 18; i++) { const s = box(store, 0, 0, 0, .25 + random() * .3, .01, .2 + random() * .3, glass); s.position.set(-6 + random() * 12, .16, 1.9 + random() * 1.6); s.rotation.y = random() * 3; } // shards on the pavement
  box(store, -7, H1, 1.2, 7, H2, 1.5, brick);
  for (const x of [-5, -1.7, 1.7, 5]) box(store, x - .7, 5.2, 1.5, x + .7, 6.9, 1.52, dark);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: signTexture('CORNER MARKET 24') }));
  sign.position.set(0, 3.8, 1.52); store.add(sign);
  // Sides and back; the east wall has a side door onto the alley.
  box(store, -7, 0, -10, -6.7, H2, 1.2, brick);
  box(store, 6.7, 0, -10, 7, H2, -7.8, brick); box(store, 6.7, 0, -6.2, 7, H2, 1.2, brick); box(store, 6.7, 2.4, -7.8, 7, H2, -6.2, brick);
  box(store, -7, 0, -10, 7, H2, -9.7, brick);
  box(store, -7.2, H2, -10.2, 7.2, H2 + .5, 1.7, mat('#3f3a36')); // roof + parapet
  // Interior: tiled floor, ceiling, storeroom partition, aisles, counter, lights.
  box(store, -6.7, 0, -9.7, 6.7, .03, 1.2, mat('#585b56'));
  box(store, -6.7, H1 - .1, -9.7, 6.7, H1, 1.2, plaster);
  box(store, -6.7, 0, -7.9, -1, H1, -7.7, plaster); box(store, 1, 0, -7.9, 6.7, H1, -7.7, plaster); box(store, -1, 2.5, -7.9, 1, H1, -7.7, plaster);
  const shelf = mat('#3b474b', .7, .3), goods = ['#a8533f', '#d0b25e', '#5d8a6a', '#c8c6bb', '#4f6d8e'].map(c => mat(c, .8));
  for (const x of [-3.5, 3.5]) {
    box(store, x - .4, 0, -6.2, x + .4, 1.9, -2.4, shelf);
    for (const y of [.45, 1.05, 1.65]) for (let i = 0; i < 9; i++) {
      if (random() < .3) continue; // looted gaps
      const side = random() < .5 ? -1 : 1, z = -6 + i * .42;
      box(store, x + side * .2 - .12, y, z, x + side * .2 + .12, y + .22 + random() * .12, z + .3, goods[Math.floor(random() * goods.length)]);
    }
  }
  const tipped = box(store, -6.6, 0, -6, -5.8, 1.9, -3, shelf); tipped.rotation.z = -1.1; tipped.position.set(-5.2, .5, -4.5);
  for (let i = 0; i < 14; i++) { const p = box(store, 0, 0, 0, .25, .2, .3, goods[i % goods.length]); p.position.set(-5.4 + random() * 2, .1, -6 + random() * 3); p.rotation.y = random() * 3; }
  box(store, 3.2, 0, -.95, 6.2, 1.05, -.35, mat('#4a3c33')); box(store, 4.8, 1.05, -.85, 5.4, 1.35, -.45, trim);
  const tube = new THREE.MeshBasicMaterial({ color: '#dfe9e4' });
  const fixtures = [];
  for (const [x, z] of [[-3.5, -4.3], [3.5, -4.3], [0, -.5]]) {
    box(store, x - .1, H1 - .18, z - 1.2, x + .1, H1 - .1, z + 1.2, tube);
    const light = new THREE.PointLight('#dbe7ff', 10, 12, 1.5); light.position.set(x, H1 - .4, z); store.add(light); fixtures.push(light);
  }

  // Street furniture and the military cordon.
  const concrete = mat('#7d817a'), tan = mat('#8a7a58', .9), tyre = mat('#141618');
  const barrier = (x, z, alongZ) => {
    const [w, d] = alongZ ? [.7, 2.4] : [2.4, .7];
    box(group, x - w / 2, 0, z - d / 2, x + w / 2, .35, z + d / 2, concrete);
    box(group, x - (alongZ ? .16 : 1.2), .35, z - (alongZ ? 1.2 : .16), x + (alongZ ? .16 : 1.2), 1.05, z + (alongZ ? 1.2 : .16), concrete);
  };
  for (const side of [-1, 1]) for (const z of [5.2, 7.6, 12.6]) barrier(side * 15, z, true);
  for (const x of [-1.3, 1.3]) barrier(x, 17.6, false);
  const vehicle = (x, z, rotation, body) => {
    const v = new THREE.Group(); v.position.set(x, 0, z); v.rotation.y = rotation; group.add(v);
    box(v, -1.1, .55, -2.3, 1.1, 1.45, 2.3, body); box(v, -1, 1.45, -1.2, 1, 2.1, 1, body); box(v, -.95, 1.55, 1.01, .95, 2, 1.04, dark);
    for (const sx of [-1, 1]) for (const sz of [-1.5, 1.5]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .35, 14), tyre); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.05, .45, sz); v.add(w); }
    return v;
  };
  vehicle(-12.6, 10, 0, tan); vehicle(12.6, 10, Math.PI, tan);
  const car = (x, z, rotation, color, burned) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = rotation; group.add(c);
    const m = burned ? mat('#26221f') : mat(color, .6, .3);
    box(c, -.9, .35, -2.1, .9, 1, 2.1, m); box(c, -.8, 1, -1.1, .8, 1.5, .9, m); box(c, -.78, 1.04, -1.12, .78, 1.45, -1.08, dark);
    for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .25, 12), tyre); w.rotation.z = Math.PI / 2; w.position.set(sx * .9, .33, sz); c.add(w); }
  };
  car(6.3, 10.9, Math.PI / 2 + .15, '#6b2f2a', false); car(-7, 5.6, Math.PI / 2 - .1, '#2f4b63', false); car(24.5, 9, .4, '', true); car(23, 13.3, -.3, '#7f7a6e', false); car(25.5, 5.5, 1.3, '', true);
  // Sandbags beside the store door.
  const bag = new THREE.BoxGeometry(.4, .3, .7), sand = mat('#8a7b5c');
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) { const b = new THREE.Mesh(bag, sand); b.position.set(3.6, .3 + row * .3, 2.4 + (i + row / 2) * .72); group.add(b); }
  // Streetlights (two of them actually light the scene) and a burning barrel.
  for (const [x, z, lit] of [[-12, 3.6, true], [12, 3.6, false], [-8, 14.4, false], [16, 14.4, true]]) {
    box(group, x - .08, 0, z - .08, x + .08, 5.5, z + .08, trim); box(group, x - .25, 5.4, z - .4, x + .25, 5.55, z + .4, new THREE.MeshBasicMaterial({ color: lit ? '#ffd9a0' : '#3b3d3a' }));
    if (lit) { const l = new THREE.PointLight('#ffcf8a', 14, 16, 1.4); l.position.set(x, 5.2, z); group.add(l); }
  }
  box(group, -19.4, 0, 14.6, -18.8, .9, 15.2, mat('#3c2a20'));
  const fire = new THREE.PointLight('#ff8a3c', 5, 9, 1.5); fire.position.set(-19.1, 1.4, 14.9); group.add(fire);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.28, .7, 8), new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: .85 })); flame.position.set(-19.1, 1.2, 14.9); group.add(flame);
  // Back alley: dumpster and a chain-link fence the intruders climb.
  box(group, 7.6, 0, -9, 9.2, 1.3, -7.2, mat('#2f4a3a'));
  for (let x = 7.1; x <= 9.6; x += .5) box(group, x - .03, 0, -12.1, x + .03, 2.2, -12, trim);
  const mesh = new THREE.MeshBasicMaterial({ color: '#6c746f', transparent: true, opacity: .35 }); box(group, 7, .1, -12.07, 9.6, 2.1, -12.03, mesh);

  return {
    update(time) {
      // A failing tube in the store and a flickering barrel fire.
      fixtures[1].intensity = Math.sin(time * 23) > .7 || Math.sin(time * 3.1) > .95 ? 1.5 : 10;
      fire.intensity = 4 + Math.sin(time * 17) * .8 + Math.sin(time * 7.3) * .6;
      flame.scale.y = 1 + Math.sin(time * 13) * .15;
    },
  };
}

// The player's rifle, drawn in front of the camera in first-person views.
function createViewmodel(group) {
  const metal = new THREE.MeshStandardMaterial({ color: '#3a4245', roughness: .5, metalness: .4, emissive: '#11161a' });
  const rifle = new THREE.Group();
  const part = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metal); m.position.set(x, y, z); rifle.add(m); };
  part(.06, .09, .5, 0, 0, -.1); part(.03, .03, .35, 0, .015, -.5); part(.05, .12, .06, 0, -.09, .02); part(.05, .1, .2, 0, -.01, .25); part(.04, .05, .12, 0, .07, -.05);
  rifle.traverse(n => { if (n.isMesh) { n.renderOrder = 10; n.material.depthTest = true; } });
  group.add(rifle);
  const offset = new THREE.Vector3(), muzzle = new THREE.Vector3();
  let kick = 0;
  return {
    rifle,
    fired() { kick = 1; },
    // Returns the muzzle position in group space (for tracers and flashes).
    place(camera, visible) {
      rifle.visible = visible;
      if (!visible) return null;
      kick = Math.max(0, kick - .18);
      offset.set(.2, -.19 + kick * .02, -.42 + kick * .06).applyQuaternion(camera.quaternion);
      rifle.position.copy(camera.position).add(offset);
      rifle.quaternion.copy(camera.quaternion);
      rifle.rotateX(kick * .08);
      group.worldToLocal(rifle.position);
      muzzle.set(0, .015, -.7).applyMatrix4(rifle.matrix.compose(rifle.position, rifle.quaternion, rifle.scale));
      return muzzle;
    },
  };
}

export default {
  id: 'city',
  title: 'City operation',
  summary: 'Soldiers hold a corner store on a city street; armed civilians try to get in. Watch from inside, the street or above, and shoot.',
  noPad: true,
  lighting: 'night',
  fog: ['#141b21', .028],
  models: ['xbot'],
  modes: MODES,
  weapon: true,
  views: [
    { label: 'Overhead', x: 0, z: 15, yaw: Math.PI, pitch: -.95, eye: 21 },
    { label: 'Street', x: -6, z: 15.2, yaw: 2.77, pitch: -.04, eye: 1.7 },
    { label: 'Inside store', x: 0, z: -7.3, yaw: 0, pitch: -.05, eye: 1.7 },
    { label: 'Alley', x: 8.3, z: -10.5, yaw: 0, pitch: -.04, eye: 1.7 },
  ],
  create({ group, soldier, character, label }) {
    const random = seeded(99);
    const city = buildCity(group);
    const fx = createEffects(group);
    const viewmodel = createViewmodel(group);

    // --- Soldiers -----------------------------------------------------------
    const ROUTES = [
      { pts: [[-5.6, -1.4], [-5.6, -6.7], [-1.6, -6.7], [-1.6, -1.4]], dir: 1, speed: 1.1, pause: .5 },
      { pts: [[1.6, -1.4], [1.6, -6.7], [5.6, -6.7], [5.6, -1.6]], dir: -1, speed: 1.1, pause: .5 },
      { pts: [[-.9, -.6], [.9, -.6]], speed: .7, pause: 1 },
      { pts: [[-3.2, 3], [-1.5, 3]], speed: .8, pause: 1 },
      { pts: [[1.5, 3], [2.9, 3]], speed: .8, pause: 1 },
      { pts: [[-13.6, 5.2], [-13.6, 8.4]], speed: .9, pause: .8 },
      { pts: [[-13.6, 11.6], [-13.6, 13.4]], speed: .9, pause: .8 },
      { pts: [[13.6, 5.2], [13.6, 8.4]], speed: .9, pause: .8 },
      { pts: [[13.6, 11.6], [13.6, 13.4]], speed: .9, pause: .8 },
      { pts: [[8.3, .6], [8.3, -3.5]], speed: .9, pause: .8 },
    ].map(r => ({ ...r, dir: r.dir || 1, path: route(r.pts) }));
    const COVER = [
      ...[5.2, 7.6, 12.6].flatMap(z => [[14.25, z - .6], [14.25, z + .6]]).map(([x, z]) => ({ x, z, h: 1.05 })),
      { x: 11.1, z: 10, h: 1.6 }, { x: 5.1, z: 10.8, h: 1.3 }, { x: 2.95, z: 3.1, h: .9 },
      { x: 4.6, z: .85, h: .9, window: true }, { x: 2.7, z: .85, h: .9, window: true }, { x: -4.2, z: .85, h: .9, window: true },
    ];
    const rifleGeometry = new THREE.BoxGeometry(.06, .09, .82), dark = new THREE.MeshStandardMaterial({ color: '#1d2224', roughness: .6, metalness: .5 });
    const guards = ROUTES.map(r => {
      const s = soldier(); group.add(s.model);
      const p = r.path.at(0);
      s.actions.Walk.time = random() * 2; s.actions.Idle.time = random() * 2;
      const rifle = new THREE.Mesh(rifleGeometry, dark); rifle.visible = false; group.add(rifle);
      return { s, r, rifle, dist: 0, speed: 0, wait: random() * 2, scanYaw: 0, state: 'route', path: [], after: null, x: p.x, z: p.z, yaw: facing(p.dx * r.dir, p.dz * r.dir), crouch: 0, aim: 0, spot: null, timer: 0, shots: 0, target: new THREE.Vector3(20, 1, 8), foe: null, underFire: 0, segment: undefined };
    });

    // --- Armed civilians ------------------------------------------------------
    const JACKETS = ['#3d4c5c', '#5c3d33', '#4c5338', '#3a3a42'];
    const ENTRIES = [
      { steps: [[31, 6], [16, 5.8], [14.1, 5.8, 'climb'], [6, 6], [1, 2.7], [0, -1.4]] },
      { steps: [[-31, 12.6], [-16, 12.6], [-14.1, 12.6, 'climb'], [-6, 7], [-1, 2.7], [0, -1.2]] },
      { steps: [[0, 34], [0, 18.5], [0, 16.6, 'climb'], [0, 6], [.5, 2.7], [.3, -1.6]] },
      { steps: [[8.3, -22], [8.3, -12.8], [8.3, -11.2, 'climb'], [8.3, -7], [6.1, -7], [4.4, -5]] },
    ];
    const pistolGeometry = new THREE.BoxGeometry(.04, .11, .2);
    const intruders = ENTRIES.map((entry, i) => {
      const c = character('xbot', { tint(m, name) { m.color.set(/Joints/i.test(m.name) ? '#1d1d1f' : JACKETS[i]); m.roughness = .9; m.metalness = 0; } });
      c.model.rotation.order = 'YXZ'; c.model.visible = false; group.add(c.model);
      const pistol = new THREE.Mesh(pistolGeometry, dark); pistol.visible = false; group.add(pistol);
      return { c, entry, pistol, state: 'wait', x: 0, z: 0, y: 0, yaw: 0, hp: 3, step: 0, speed: 0, timer: 0, aim: 0, foe: null, cooldown: 0, spotted: false, fall: 0, climbFrom: null };
    });
    let wave = 0, waveTimer = 0;
    const tally = { down: 0, escaped: 0, breached: 0 };
    const alive = i => i.state !== 'wait' && i.state !== 'down' && i.state !== 'escaped';
    function startWave() {
      wave++;
      intruders.forEach((it, n) => {
        const [x, z] = it.entry.steps[0];
        Object.assign(it, { state: 'sneak', x, z, y: 0, hp: 3, step: 1, speed: 0, timer: 1.5 * n + random() * 2, aim: 0, foe: null, cooldown: 2, spotted: false, fall: 0, breached: false, shotTimer: .5 });
        it.c.model.visible = true; it.c.model.rotation.x = 0;
      });
    }
    function hideIntruders() { for (const it of intruders) { it.state = 'wait'; it.c.model.visible = false; it.pistol.visible = false; } }
    function hitIntruder(it, damage) {
      if (!alive(it)) return;
      it.hp -= damage; it.spotted = true;
      if (it.hp <= 0) { it.state = 'down'; it.fall = 0; it.pistol.visible = false; tally.down++; }
      else if (it.hp === 1 && it.state !== 'hold') { it.state = 'flee'; it.step = Math.max(1, it.step - 1); }
    }

    const readout = label('', { width: 4.4, lines: 2 }); readout.position.set(0, 9.3, 0); group.add(readout);
    let mode = 'Patrol', hostileTimer = 1, rounds = 0, incoming = 0, playerShots = 0, clock = 0;
    let audio = null, listener = { x: 0, z: 0, yaw: 0 };
    const pending = [];
    const v = new THREE.Vector3(), w = new THREE.Vector3();

    const gapAhead = g => {
      let best = Infinity;
      for (const o of guards) if (o !== g && o.r === g.r && o.state === 'route') {
        const gap = ((o.dist - g.dist) * g.r.dir % g.r.path.total + g.r.path.total) % g.r.path.total;
        if (gap > 0) best = Math.min(best, gap);
      }
      return best;
    };
    const travel = (g, to, state, after) => { g.path = walkPath([g.x, g.z], to); g.state = state; g.after = after; };
    const backToRoute = g => { const p = g.r.path.at(g.dist); g.spot = null; g.foe = null; travel(g, [p.x, p.z], 'return', () => { g.state = 'route'; g.wait = 0; }); };

    function setMode(next) {
      mode = next;
      pending.length = 0;
      if (mode !== 'Intruders') hideIntruders();
      if (mode === 'Patrol' || mode === 'Alert' || mode === 'Intruders') {
        for (const g of guards) if (g.state !== 'route') backToRoute(g);
        if (mode === 'Intruders') { wave = 0; tally.down = tally.escaped = tally.breached = 0; startWave(); }
        return;
      }
      // Take cover / Firefight: hostiles at the east end of the street. Nearest free cover wins.
      const free = COVER.filter(s => !guards.some(g => g.spot === s));
      for (const g of [...guards].filter(g => !g.spot).sort((a, b) => b.x - a.x)) {
        let best = null, bestDistance = Infinity;
        for (const s of free) { const d = Math.hypot(s.x - g.x, s.z - g.z) + (inStore(g.x, g.z) !== !!s.window ? 12 : 0); if (d < bestDistance) { best = s; bestDistance = d; } }
        if (!best) continue;
        free.splice(free.indexOf(best), 1); g.spot = best;
        travel(g, [best.x, best.z], 'sprint', () => { g.state = 'cover'; g.timer = .5 + random() * 2; });
      }
    }

    // Hostile riflemen at the east end (Take cover / Firefight).
    function hostileFire(dt) {
      if (mode !== 'Take cover' && mode !== 'Firefight') return;
      hostileTimer -= dt;
      if (hostileTimer > 0) return;
      hostileTimer = .6 + random() * 1.6;
      const [hx, hz] = HOSTILES[Math.floor(random() * HOSTILES.length)];
      const victim = guards[Math.floor(random() * guards.length)];
      const from = new THREE.Vector3(hx, 1.1, hz);
      const shots = 2 + Math.floor(random() * 4);
      for (let i = 0; i < shots; i++) pending.push({
        at: clock + i * (.09 + random() * .06),
        fire() {
          const spot = victim.spot && victim.state !== 'sprint' ? victim.spot : null;
          const to = !spot ? new THREE.Vector3(victim.x + (random() - .5) * 3, .05, victim.z + (random() - .5) * 3)
            : spot.window ? new THREE.Vector3(spot.x + (random() - .5) * 2, .3 + random() * 3, 1.56)
              : new THREE.Vector3(spot.x + .9, .3 + random() * (spot.h - .3), spot.z + (random() - .5) * 1.4);
          fx.flash(from, 1);
          gunshot(audio, listener, hx, hz, { hostile: true });
          fx.tracer(from, to, () => { fx.puff(to); impact(audio, listener, to.x, to.z); });
          incoming++;
        },
      });
    }

    // A soldier fires one round at a world point; `hit` decides if it connects.
    function guardShot(g, target, onHit) {
      const muzzle = g.rifle.position.clone().addScaledVector(w.set(0, 0, 1).applyQuaternion(g.rifle.quaternion), .45);
      fx.flash(muzzle, .55);
      fx.tracer(muzzle, target, onHit);
      gunshot(audio, listener, g.x, g.z);
      rounds++;
    }

    function updateGuard(g, dt) {
      const { s, r } = g;
      let faceYaw = g.yaw, wantCrouch = 0, wantAim = 0;
      g.underFire = Math.max(0, g.underFire - dt);
      const indoor = inStore(g.x, g.z);
      // Intruders: notice armed civilians nearby on the same side of the store walls.
      if (mode === 'Intruders' && (g.state === 'route' || g.state === 'return')) {
        let best = null, bestDistance = 15;
        for (const it of intruders) if (alive(it) && inStore(it.x, it.z) === indoor) { const d = Math.hypot(it.x - g.x, it.z - g.z); if (d < bestDistance) { best = it; bestDistance = d; } }
        if (best && guards.filter(o => o.state === 'engage').length < 7) { g.state = 'engage'; g.foe = best; g.timer = .8 + random() * .6; best.spotted = true; }
      }
      if (g.state === 'route') {
        const alert = mode === 'Alert' || mode === 'Intruders';
        let targetSpeed = mode === 'Alert' ? 2.6 : r.speed;
        if (g.wait > 0) { g.wait -= dt; targetSpeed = 0; }
        if (gapAhead(g) < 2.2) targetSpeed = 0;
        g.speed = damp(g.speed, targetSpeed, alert ? 4 : 2.5, dt);
        g.dist += g.speed * dt * r.dir;
        const segment = r.path.segment(g.dist);
        if (g.segment !== undefined && segment !== g.segment && mode !== 'Alert' && random() < r.pause) { g.wait = 1.4 + random() * 2.2; g.scanYaw = (random() - .5) * 1.6; }
        g.segment = segment;
        const p = r.path.at(g.dist);
        g.x = p.x; g.z = p.z;
        faceYaw = g.wait > 0 ? facing(p.dx * r.dir, p.dz * r.dir) + Math.PI / 2 * Math.sign(g.scanYaw || 1) + g.scanYaw * Math.sin(g.wait * 1.3) : facing(p.dx * r.dir, p.dz * r.dir);
        wantAim = mode === 'Intruders' ? .35 : 0;
      } else if (g.state === 'sprint' || g.state === 'return') {
        const [tx, tz] = g.path[0], dx = tx - g.x, dz = tz - g.z, distance = Math.hypot(dx, dz);
        const top = g.state === 'sprint' ? 4.2 : 1.6;
        g.speed = damp(g.speed, g.path.length === 1 ? Math.min(top, distance * 2.5 + .3) : top, 4, dt);
        const step = Math.min(distance, g.speed * dt);
        if (distance > 1e-3) { g.x += dx / distance * step; g.z += dz / distance * step; faceYaw = facing(dx, dz); }
        if (distance < .08) { g.path.shift(); if (!g.path.length) { g.speed = 0; g.after?.(); } }
      } else if (g.state === 'engage') {
        g.speed = damp(g.speed, 0, 6, dt);
        if (!g.foe || !alive(g.foe)) {
          // Next armed civilian in range, otherwise back to the route.
          let next = null, nd = 18;
          for (const it of intruders) if (alive(it)) { const d = Math.hypot(it.x - g.x, it.z - g.z); if (d < nd) { next = it; nd = d; } }
          if (next) g.foe = next; else { backToRoute(g); }
        }
        if (g.foe) {
          const f = g.foe;
          faceYaw = facing(f.x - g.x, f.z - g.z);
          g.target.set(f.x, 1.2 + f.y, f.z);
          wantAim = 1; wantCrouch = g.underFire > 0 ? .45 : 0;
          g.timer -= dt;
          if (g.timer <= 0 && g.aim > .9) {
            if (g.shots <= 0) g.shots = 2 + Math.floor(random() * 2);
            g.shots--;
            g.timer = g.shots > 0 ? .14 : .6 + random() * .8;
            const hit = random() < .3;
            const target = hit ? g.target.clone() : g.target.clone().add(v.set((random() - .5) * 1.6, (random() - .5) * .8 - .4, (random() - .5) * 1.6));
            guardShot(g, target, () => { if (hit) { hitIntruder(f, 1); fx.puff(target, '#7a2a24'); } else { fx.puff(target); impact(audio, listener, target.x, target.z); } });
          }
        }
      } else {
        // 'cover' or 'peek' during Take cover / Firefight.
        g.speed = damp(g.speed, 0, 6, dt);
        const [hx, hz] = HOSTILES.reduce((a, b) => Math.hypot(b[0] - g.x, b[1] - g.z) < Math.hypot(a[0] - g.x, a[1] - g.z) ? b : a);
        faceYaw = facing(hx - g.x, hz - g.z);
        g.timer -= dt;
        if (g.state === 'cover') {
          wantCrouch = g.spot.h < 1.4 ? .55 : .25;
          if (mode === 'Firefight' && g.timer <= 0) { g.state = 'peek'; g.shots = 3 + Math.floor(random() * 4); g.timer = .35; g.target.set(hx + (random() - .5) * 2, 1 + random() * .5, hz + (random() - .5) * 2); }
        } else {
          wantAim = 1; wantCrouch = g.spot.h < 1.4 ? .12 : 0;
          if (mode !== 'Firefight') { g.state = 'cover'; g.timer = 1; }
          else if (g.timer <= 0 && g.aim > .9) {
            if (g.shots-- > 0) {
              g.timer = .11 + random() * .05;
              const target = g.target.clone().add(v.set((random() - .5) * 1.2, (random() - .5) * .6, (random() - .5) * 1.2));
              guardShot(g, target, () => fx.puff(target));
            } else { g.state = 'cover'; g.timer = 1.2 + random() * 2.4; }
          }
        }
      }
      g.yaw += angleDelta(g.yaw, faceYaw) * (1 - Math.exp(-dt * (g.state === 'sprint' ? 10 : 6)));
      g.crouch = damp(g.crouch, wantCrouch, 8, dt);
      g.aim = damp(g.aim, wantAim, 9, dt);
      s.model.position.set(g.x, 0, g.z);
      s.model.rotation.y = g.yaw;
      s.setSpeed(g.speed);
      s.mixer.update(dt);
      crouch(s.model, g.crouch);
      // On patrol with intruders about, rifles are held low-ready toward the walking direction.
      if (g.state === 'route' && g.aim > .02) g.target.set(g.x + Math.sin(g.yaw + Math.PI) * 5, .2, g.z + Math.cos(g.yaw + Math.PI) * 5);
      const hands = g.aim > .02 ? aimRifle(s.model, group.localToWorld(v.copy(g.target)), g.aim) : null;
      g.rifle.visible = !!hands && g.aim > .25;
      if (hands) {
        group.worldToLocal(hands.right); group.worldToLocal(hands.left);
        g.rifle.position.copy(hands.right).lerp(hands.left, .45);
        g.rifle.lookAt(group.localToWorld(w.copy(hands.left).sub(hands.right).multiplyScalar(4).add(hands.left)));
      }
    }

    function updateIntruder(it, dt) {
      const { c } = it;
      if (it.state === 'wait' || it.state === 'escaped') return;
      let faceYaw = it.yaw, wantAim = 0;
      const steps = it.entry.steps;
      if (it.state === 'down') {
        // Fall backwards over half a second, then lie still.
        it.fall = Math.min(1, it.fall + dt * 2.2);
        c.model.rotation.x = Math.PI / 2 * (1 - (1 - it.fall) ** 3);
        c.model.position.set(it.x, 0, it.z);
        if (it.fall < 1) { c.setSpeed(0); c.mixer.update(dt); }
        return;
      }
      if (it.timer > 0 && it.state === 'sneak' && it.step === 1 && it.speed === 0) { it.timer -= dt; c.model.visible = it.timer < 1; }
      else if (it.state === 'sneak' || it.state === 'flee') {
        const fleeing = it.state === 'flee';
        const goal = fleeing ? steps[Math.max(0, it.step - 1)] : steps[it.step];
        const dx = goal[0] - it.x, dz = goal[1] - it.z, distance = Math.hypot(dx, dz);
        if (!fleeing && goal[2] === 'climb') { it.state = 'climb'; it.timer = 0; it.climbFrom = [it.x, it.z]; }
        else {
          const top = fleeing ? 3.8 : it.spotted ? 3.4 : 1.25;
          it.speed = damp(it.speed, top, 3, dt);
          const step = Math.min(distance, it.speed * dt);
          if (distance > 1e-3) { it.x += dx / distance * step; it.z += dz / distance * step; faceYaw = facing(dx, dz); }
          if (distance < .1) {
            if (fleeing) { it.step--; if (it.step <= 0) { it.state = 'escaped'; c.model.visible = false; it.pistol.visible = false; tally.escaped++; } }
            else if (++it.step >= steps.length) { it.state = 'hold'; it.speed = 0; it.shotTimer = .5; if (!it.breached) { it.breached = true; tally.breached++; } }
          }
          // Spotted and a soldier is close: stop and shoot for a moment.
          it.cooldown -= dt;
          if (!fleeing && it.spotted && it.cooldown <= 0) {
            const g = nearestGuard(it, 12);
            if (g) { it.state = 'shoot'; it.foe = g; it.timer = 1 + random(); it.shotTimer = .3; }
          }
        }
      } else if (it.state === 'climb') {
        // Vault the barrier or fence: short hop along the segment.
        it.timer += dt / .9;
        const t = Math.min(1, it.timer), [x0, z0] = it.climbFrom, goal = steps[it.step];
        it.x = x0 + (goal[0] - x0) * t; it.z = z0 + (goal[1] - z0) * t; it.y = Math.sin(Math.PI * t) * .95;
        faceYaw = facing(goal[0] - x0, goal[1] - z0);
        it.speed = 1;
        if (t >= 1) { it.y = 0; it.step++; it.state = 'sneak'; }
      } else if (it.state === 'shoot' || it.state === 'hold') {
        it.speed = damp(it.speed, 0, 6, dt);
        if (!it.foe || it.state === 'hold') it.foe = nearestGuard(it, 16) || it.foe;
        if (it.foe) {
          faceYaw = facing(it.foe.x - it.x, it.foe.z - it.z); wantAim = 1;
          it.shotTimer -= dt;
          if (it.shotTimer <= 0 && it.aim > .85) {
            it.shotTimer = .45 + random() * .5;
            const muzzle = it.pistol.position.clone().addScaledVector(w.set(0, 0, 1).applyQuaternion(it.pistol.quaternion), .14);
            const target = new THREE.Vector3(it.foe.x + (random() - .5) * 1.4, .4 + random() * 1.2, it.foe.z + (random() - .5) * 1.4);
            fx.flash(muzzle, .35);
            fx.tracer(muzzle, target, () => { fx.puff(target); impact(audio, listener, target.x, target.z); });
            gunshot(audio, listener, it.x, it.z, { pistol: true });
            it.foe.underFire = 2;
            incoming++;
          }
        }
        if (it.state === 'shoot') { it.timer -= dt; if (it.timer <= 0) { it.state = 'sneak'; it.cooldown = 2 + random() * 2.5; } }
      }
      it.yaw += angleDelta(it.yaw, faceYaw) * (1 - Math.exp(-dt * 7));
      it.aim = damp(it.aim, wantAim, 8, dt);
      c.model.position.set(it.x, it.y, it.z);
      c.model.rotation.y = it.yaw;
      c.setSpeed(it.state === 'climb' ? .6 : it.speed);
      c.mixer.update(dt);
      const pose = it.aim > .02 && it.foe ? aimPistol(c.model, group.localToWorld(v.set(it.foe.x, 1.3, it.foe.z)), it.aim) : null;
      it.pistol.visible = !!pose && it.aim > .3;
      if (pose) {
        group.worldToLocal(pose.hand);
        it.pistol.position.copy(pose.hand);
        it.pistol.lookAt(group.localToWorld(w.copy(pose.hand).addScaledVector(pose.dir, 3)));
      }
    }
    function nearestGuard(it, range) {
      let best = null, bestDistance = range;
      for (const g of guards) { const d = Math.hypot(g.x - it.x, g.z - it.z); if (d < bestDistance && inStore(g.x, g.z) === inStore(it.x, it.z)) { best = g; bestDistance = d; } }
      return best;
    }

    // --- Player weapon ----------------------------------------------------------
    let muzzle = null, firstPerson = false;
    function fire({ origin, dir }) {
      const o = group.worldToLocal(origin.clone()), d = dir.clone().normalize();
      // Nearest hit among intruder heads (one-shot) and torsos, else the ground or far away.
      let best = Infinity, victim = null, damage = 0;
      for (const it of intruders) if (alive(it)) for (const [y, radius, dmg] of [[1.62 + it.y, .14, 3], [1.15 + it.y, .32, 2]]) {
        v.set(it.x, y, it.z).sub(o);
        const along = v.dot(d); if (along < 0) continue;
        const miss = v.lengthSq() - along * along;
        if (miss < radius * radius && along < best) { best = along; victim = it; damage = dmg; }
      }
      let end;
      if (victim) end = o.clone().addScaledVector(d, best);
      else { const t = d.y < -1e-3 ? -o.y / d.y : 60; end = o.clone().addScaledVector(d, Math.min(t, 60)); }
      const from = muzzle ? muzzle.clone() : o.clone();
      fx.flash(from, .45);
      fx.tracer(from, end, () => {
        if (victim) { hitIntruder(victim, damage); fx.puff(end, '#7a2a24'); }
        else { fx.puff(end); impact(audio, listener, end.x, end.z); }
      });
      gunshot(audio, listener, listener.x, listener.z);
      viewmodel.fired();
      playerShots++;
      return { hit: !!victim };
    }

    return {
      setMode,
      fire,
      beforeRender(camera) {
        // Show the rifle only in first-person (low) views.
        firstPerson = camera.position.y < 4;
        muzzle = viewmodel.place(camera, firstPerson);
      },
      update(dt, env = {}) {
        audio = env.audio || null;
        if (env.listener) listener = env.listener;
        if (dt <= 0) return;
        clock += dt;
        city.update(clock);
        for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= clock) { pending[i].fire(); pending.splice(i, 1); }
        for (const g of guards) updateGuard(g, dt);
        for (const it of intruders) updateIntruder(it, dt);
        hostileFire(dt);
        if (mode === 'Intruders' && !intruders.some(alive)) { waveTimer += dt; if (waveTimer > 6) { waveTimer = 0; startWave(); } } else waveTimer = 0;
        fx.update(dt);
        const counts = guards.reduce((c, g) => (c[g.state] = (c[g.state] || 0) + 1, c), {});
        const line = mode === 'Intruders'
          ? `wave ${wave} · ${intruders.filter(alive).length} active · ${tally.down} down · ${tally.escaped} fled · ${tally.breached} got in · ${counts.engage || 0} engaging`
          : mode === 'Patrol' || mode === 'Alert'
            ? `${counts.route || 0} on post · ${counts.return || 0} returning`
            : `${counts.sprint || 0} moving · ${counts.cover || 0} in cover · ${counts.peek || 0} firing`;
        readout.userData.set(`${mode.toUpperCase()}${audio ? '' : ' · tap Sound for audio'}\n${line} · you fired ${playerShots}`);
      },
      interaction: () => { const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; return { label: 'Mode → ' + next, action() { setMode(next); } }; },
    };
  },
};
