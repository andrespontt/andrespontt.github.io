import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { facing } from '../kit.js';
import { angleDelta, damp } from '../easing.js';
import { aimPistol, aimRifle, crouch } from '../../rig.js';
import { glass, gunshot, impact, reload as reloadSound } from '../sound.js';
import { createEffects, plan, route, seeded } from '../combat.js';
import { firstObstruction, sphereEntry, moveThroughCity, STORE_FRONT, FIRE_BARRELS, WINDOWS } from '../city-space.js';

// City operation: soldiers hold a corner store on one block of a city street.
// Only this block is built; fog hides where the city would continue.
// +Z points south (toward the default camera). Rectangles are [minX, minZ, maxX, maxZ].
const STORE = [-7, -10, 7, 1.5];
const BLOCKS = [STORE, [-27, -12, -7.4, 1.5], [9.6, -12, 27, 1.5], [-27, 16.5, -3, 30], [3, 16.5, 27, 30]];
const OUTSIDE_BLOCKS = BLOCKS.slice(1);
const INTERIOR_BLOCKS = [[-3.9,-6.2,-3.1,-2.4],[3.1,-6.2,3.9,-2.4],[3.2,-.95,6.2,-.35]];
const inStore = (x, z) => x > STORE[0] && x < STORE[2] && z > STORE[1] && z < STORE[3];
// Height of the surface underfoot: store tiles, the raised sidewalks, or the street.
const groundAt = (x, z) => inStore(x, z) ? .03
  : Math.abs(x) < 32 && ((z > 1.5 && z < 4) || (z > 14 && z < 16.5 && Math.abs(x) > 3)) ? .14 : 0;
const DOOR_OUT = [0, 2.7], DOOR_IN = [0, -.7];
const HOSTILES = [[28.1, 3], [28.1, 12], [25.2, 15.8]];
const MODES = ['Patrol', 'Alert', 'Take cover', 'Firefight', 'Intruders'];
// Magazines and reload times in seconds. A trained rifleman changes mags in ~2.5 s;
// from empty it takes longer (bolt release). Civilians with pistols fumble a little more.
const RIFLE_MAG = 30, PISTOL_MAG = 15;
const RELOAD = { soldier: [2.4, 3.1], intruder: [2.2, 3.4], player: 2.5, playerEmpty: 3.1 };

// Walking routes that respect the store walls: in or out through the front door.
function walkPath(from, to) {
  const a = inStore(...from), b = inStore(...to);
  if (a && b) return plan(from,to,INTERIOR_BLOCKS);
  if (a) return [...plan(from,DOOR_IN,INTERIOR_BLOCKS), DOOR_OUT, ...plan(DOOR_OUT, to, OUTSIDE_BLOCKS)];
  if (b) return [...plan(from, DOOR_OUT, OUTSIDE_BLOCKS), DOOR_IN, ...plan(DOOR_IN,to,INTERIOR_BLOCKS)];
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

// Street vehicles: Kenney Car Kit models (CC0), loaded once and cloned. Each spot shows a box car
// until its model arrives, and keeps it if the download fails.
const vehicleLoads = new Map();
const loadVehicle = name => {
  if (!vehicleLoads.has(name)) vehicleLoads.set(name, new GLTFLoader().loadAsync(new URL('../../assets/vehicles/' + name + '.glb', import.meta.url).href));
  return vehicleLoads.get(name);
};
// Replace a placeholder's contents with the model, scaled to `length` metres and sat on the ground.
function dressVehicle(holder, name, length, burned) {
  return loadVehicle(name).then(gltf => {
    if (!holder.parent?.parent) return; // the scenario was rebuilt meanwhile
    const model = gltf.scene.clone(true), box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const k = length / Math.max(size.x, size.z);
    model.scale.setScalar(k);
    model.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
    // Burned-out wrecks: same model, charred.
    if (burned) model.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); n.material.color.set('#3b342e'); n.material.roughness = 1; n.material.metalness = 0; } });
    holder.clear(); holder.add(model);
    return size.y * k; // the model's height, for anything mounted on top
  }).catch(error => console.warn('Vehicle model failed to load; keeping the placeholder.', name, error));
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
  for (const x of [-35, 35]) box(group, x - 1.5, 0, -14, x + 1.5, 14, 32, mat('#1b2125')); // street ends, mostly lost in fog

  // The store: brick shell with a broken storefront and an interior.
  const brick = mat('#6e5146'), plaster = mat('#8b867b'), trim = mat('#2d3436', .6, .4), dark = new THREE.MeshBasicMaterial({ color: '#0e1316' });
  const store = new THREE.Group(); group.add(store);
  const T = .3, H1 = 4.4, H2 = 7.6;
  // Compact shop windows: geometry and collision use the same wall segments.
  for (const bounds of STORE_FRONT) box(store, ...bounds, brick);
  const glass = new THREE.MeshStandardMaterial({ color: '#9cc3cf', transparent: true, opacity: .26, roughness: .08, metalness: .4, depthWrite: false });
  // Each display window holds two intact panes; a bullet through one shatters it (see breakPane).
  const panes = [];
  for (const [a,b] of WINDOWS) {
    box(store,a-.06,1.19,1.12,b+.06,1.29,1.6,trim);
    box(store,a-.06,2.41,1.15,b+.06,2.51,1.55,trim);
    for(const x of [a,b]) box(store,x-.04,1.25,1.15,x+.04,2.45,1.55,trim);
    for (const [x0, x1] of [[a + .04, (a + b) / 2], [(a + b) / 2, b - .04]]) {
      const bounds = [x0, 1.29, 1.32, x1, 2.41, 1.36];
      panes.push({ bounds, mesh: box(store, ...bounds, glass), intact: true });
    }
  }
  // Seat the frame inside the opening; no faces overlap the brick reveal.
  for (const x of [-.96,.96]) box(store,x-.04,.03,1.08,x+.04,2.52,1.57,trim);
  box(store,-1,2.52,1.08,1,2.6,1.57,trim);
  // Deep fascia, shallow canopy and a durable painted plinth.
  box(store,-7.1,2.85,1.08,7.1,3.08,2.05,trim);
  box(store,-7.05,.12,1.5,-1.1,.38,1.56,trim);
  box(store,1.1,.12,1.5,7.05,.38,1.56,trim);
  const upperFacade = box(store, -7, H1, 1.2, 7, H2, 1.5, brick);
  for (const x of [-5, -1.7, 1.7, 5]) box(store, x - .7, 5.2, 1.5, x + .7, 6.9, 1.52, dark);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1), new THREE.MeshBasicMaterial({ map: signTexture('CORNER MARKET 24') }));
  sign.position.set(0, 3.8, 1.52); store.add(sign);
  // Sides and back; the east wall has a side door onto the alley.
  box(store, -7, 0, -10, -6.7, H2, 1.2, brick);
  box(store, 6.7, 0, -10, 7, H2, -7.8, brick); box(store, 6.7, 0, -6.2, 7, H2, 1.2, brick); box(store, 6.7, 2.4, -7.8, 7, H2, -6.2, brick);
  box(store, -7, 0, -10, 7, H2, -9.7, brick);
  const roof = box(store, -7.2, H2, -10.2, 7.2, H2 + .5, 1.7, mat('#3f3a36')); // roof + parapet
  // Interior: tiled floor, ceiling, storeroom partition, aisles, counter, lights.
  const floorCanvas=document.createElement('canvas');floorCanvas.width=floorCanvas.height=128;
  const fg=floorCanvas.getContext('2d');fg.fillStyle='#686b62';fg.fillRect(0,0,128,128);
  fg.fillStyle='#74766c';fg.fillRect(0,0,64,64);fg.fillRect(64,64,64,64);
  fg.strokeStyle='#424943';fg.lineWidth=2;for(const v of [0,64,128]){fg.beginPath();fg.moveTo(v,0);fg.lineTo(v,128);fg.moveTo(0,v);fg.lineTo(128,v);fg.stroke();}
  const floorMap=new THREE.CanvasTexture(floorCanvas);floorMap.colorSpace=THREE.SRGBColorSpace;floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;floorMap.repeat.set(11,9);
  box(store,-6.7,0,-9.7,6.7,.03,1.2,new THREE.MeshStandardMaterial({map:floorMap,roughness:.85}));
  // Interior skirting and aisle identification keep the room readable at eye level.
  for(const x of [-6.65,6.65]) box(store,x-.035,.03,-9.65,x+.035,.24,1.1,trim);
  for(const [x,text] of [[-3.5,'01 / SUPPLIES'],[3.5,'02 / PROVISIONS']]){
    const marker=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.3),new THREE.MeshBasicMaterial({map:signTexture(text),side:THREE.DoubleSide}));marker.position.set(x,2.3,-2.35);marker.rotation.y=Math.PI;store.add(marker);
  }
  const ceiling = box(store, -6.7, H1 - .1, -9.7, 6.7, H1, 1.2, plaster);
  box(store, -6.7, 0, -7.9, -1, H1, -7.7, plaster); box(store, 1, 0, -7.9, 6.7, H1, -7.7, plaster); box(store, -1, 2.5, -7.9, 1, H1, -7.7, plaster);
  const shelf = mat('#3b474b', .7, .3), goods = ['#a8533f', '#d0b25e', '#5d8a6a', '#c8c6bb', '#4f6d8e'].map(c => mat(c, .8));
  for (const x of [-3.5, 3.5]) {
    // Low gondolas (1.45 m) so you can see across the store at eye level.
    box(store,x-.04,0,-6.2,x+.04,1.45,-2.4,shelf);
    for(const y of [.05,.5,.95,1.4]) box(store,x-.4,y,-6.2,x+.4,y+.045,-2.4,shelf);
    for(const z of [-6.16,-2.44]) for(const side of [-1,1]) box(store,x+side*.36-.025,0,z-.025,x+side*.36+.025,1.48,z+.025,shelf);
    for (const y of [.55, 1]) for (let i = 0; i < 9; i++) {
      if (random() < .3) continue; // looted gaps
      const side = random() < .5 ? -1 : 1, z = -6 + i * .42;
      box(store, x + side * .2 - .12, y, z, x + side * .2 + .12, y + .22 + random() * .12, z + .3, goods[Math.floor(random() * goods.length)]);
    }
  }
  const tipped = box(store, -6.6, 0, -6, -5.8, 1.9, -3, shelf); tipped.rotation.z = -1.1; tipped.position.set(-5.2, .5, -4.5);
  for (let i = 0; i < 14; i++) { const p = box(store, 0, 0, 0, .25, .2, .3, goods[i % goods.length]); p.position.set(-5.4 + random() * 2, .1, -6 + random() * 3); p.rotation.y = random() * 3; }
  box(store, 3.2, 0, -.95, 6.2, 1.05, -.35, mat('#4a3c33')); box(store, 4.8, 1.05, -.85, 5.4, 1.35, -.45, trim);
  // Cooler bank on the storeroom partition: lit glass doors with rows of stock behind them.
  const coolerBody = mat('#c9cdc8', .5, .2), coolerGlow = new THREE.MeshBasicMaterial({ color: '#8fb4c0' }), stock = new THREE.MeshBasicMaterial({ color: '#3b4a52' });
  for (const [a, b] of [[-6.5, -1.2], [1.2, 5.6]]) {
    box(store, a, 0, -7.7, b, 2.3, -7.12, coolerBody); box(store, a, 2.3, -7.7, b, 2.6, -7.05, trim);
    const doors = Math.round((b - a) / .9), wide = (b - a) / doors;
    for (let i = 0; i < doors; i++) {
      const x0 = a + wide * i;
      box(store, x0 + .06, .25, -7.12, x0 + wide - .06, 2.05, -7.1, coolerGlow);
      for (const y of [.75, 1.3, 1.85]) box(store, x0 + .1, y, -7.1, x0 + wide - .1, y + .05, -7.09, stock);
      box(store, x0 + wide - .03, .25, -7.13, x0 + wide + .03, 2.05, -7.06, trim);
    }
  }
  // Behind the counter: a cigarette and lottery rack on the east wall.
  box(store, 6.35, 0, -2.5, 6.7, 2.3, -.4, trim);
  for (let i = 0; i < 6; i++) box(store, 6.3, .6 + i * .27, -2.4, 6.36, .8 + i * .27, -.5, goods[i % goods.length]);
  // Entrance mat, wall posters, and boards across the top of each window: soldiers fire through the slit below.
  box(store, -1, .03, -.4, 1, .05, 1.1, mat('#1c2124'));
  for (const [z, text] of [[-1.6, 'OPEN 24/7'], [-5.2, 'HOT COFFEE']]) {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .3), new THREE.MeshBasicMaterial({ map: signTexture(text) }));
    poster.position.set(-6.68, 2.6, z); poster.rotation.y = Math.PI / 2; store.add(poster);
  }
  const plank = mat('#5e4a35', .95);
  for (const [a, b] of WINDOWS) for (const [y, tilt] of [[2.05, .04], [2.3, -.03]]) {
    const board = box(store, a - .1, y - .08, 1.08, b + .1, y + .08, 1.13, plank); board.rotation.z = tilt;
  }
  const staff = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .3), new THREE.MeshBasicMaterial({ map: signTexture('STAFF ONLY') }));
  staff.position.set(0, 2.75, -7.66); store.add(staff);
  // Storeroom: stacked crates the VIP shelters behind, and a manager's desk.
  const crateWood = mat('#5b4a32');
  box(store, -5.6, 0, -9.6, -4.4, .9, -8.4, crateWood); box(store, -5.4, .9, -9.5, -4.6, 1.6, -8.7, crateWood);
  box(store, 2, 0, -9.6, 3.6, .8, -8.9, mat('#4a3c33')); box(store, 2.6, .8, -9.5, 3.1, 1.15, -9.3, trim);
  const tube = new THREE.MeshBasicMaterial({ color: '#dfe9e4' });
  for (const [x, z] of [[-3.5, -4.3], [3.5, -4.3], [0, -.5]]) {
    box(store, x - .1, H1 - .18, z - 1.2, x + .1, H1 - .1, z + 1.2, tube);
    const light = new THREE.PointLight('#dbe7ff', 10, 12, 1.5); light.position.set(x, H1 - .4, z); store.add(light);
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
  const car = (x, z, rotation, color, burned, kind = 'sedan', length = 4.4) => {
    const c = new THREE.Group(); c.position.set(x, 0, z); c.rotation.y = rotation; group.add(c);
    // Box car placeholder, replaced by the model when it loads (resolves to the model's height).
    const m = burned ? mat('#26221f') : mat(color, .6, .3);
    box(c, -.9, .35, -2.1, .9, 1, 2.1, m); box(c, -.8, 1, -1.1, .8, 1.5, .9, m); box(c, -.78, 1.04, -1.12, .78, 1.45, -1.08, dark);
    for (const sx of [-1, 1]) for (const sz of [-1.3, 1.3]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .25, 12), tyre); w.rotation.z = Math.PI / 2; w.position.set(sx * .9, .33, sz); c.add(w); }
    return dressVehicle(c, kind, length, burned);
  };
  // Parked cars inside the cordon, abandoned ones and burned-out wrecks down the street.
  car(6.3, 10.9, Math.PI / 2 + .15, '#6b2f2a', false, 'sedan'); car(-7, 5.6, Math.PI / 2 - .1, '#2f4b63', false, 'van', 4.6);
  car(24.5, 9, .4, '', true, 'suv', 4.6); car(23, 13.3, -.3, '#7f7a6e', false, 'taxi'); car(25.5, 5.5, 1.3, '', true, 'sedan');
  car(-24.5, 9.5, -.4, '', true, 'van', 4.6); car(-22.5, 4.6, .2, '', true, 'suv', 4.6);
  // Emergency vehicles at the cordon: a police car with its light bar going, and an ambulance.
  const police = car(6.5, 14.8, Math.PI / 2, '#d8d8d8', false, 'police', 4.6); car(-12, 14.8, -Math.PI / 2, '#e0e0e0', false, 'ambulance', 5.4);
  const blinkers = ['#ff2a2a', '#2a6bff'].map((color, i) => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(.32, .12, .2), new THREE.MeshBasicMaterial({ color }));
    light.position.set(6.5, 1.72, 14.8 + (i ? .3 : -.3)); group.add(light); return light;
  });
  // Sit the lights just above the roof once the model is in (it has its own light bar geometry).
  police.then(height => { if (height) for (const light of blinkers) light.position.y = height + .07; });
  // Traffic cones along the barriers.
  for (const [x, z] of [[-4.1, 17.6], [4.1, 17.6], [-15, 3.6], [15, 3.6], [-16, 13.6], [16, 13.6], [-3.6, 18.4], [3.6, 18.4]]) {
    const holder = new THREE.Group(); holder.position.set(x, groundAt(x, z), z); group.add(holder);
    dressVehicle(holder, 'cone', .5, false);
  }
  // Intruder cover outside the cordon (matching boxes live in COVER_PROPS).
  const rust = mat('#4a3a2c'), crate = mat('#5b4a32');
  box(group, -21.6, 0, 13.6, -20.2, 1.3, 15, rust); box(group, 1.4, 0, 21.5, 2.9, 1.4, 23.3, mat('#2f4a3a'));
  box(group, -2.9, 0, 20, -1.7, .6, 21, crate); box(group, -2.75, .6, 20.15, -1.85, 1.1, 20.85, crate);
  // Sandbags beside the store door.
  const bag = new THREE.BoxGeometry(.4, .3, .7), sand = mat('#8a7b5c');
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) { const b = new THREE.Mesh(bag, sand); b.position.set(3.6, .3 + row * .3, 2.4 + (i + row / 2) * .72); group.add(b); }
  // Streetlights (two of them actually light the scene) and a burning barrel.
  for (const [x, z, lit] of [[-12, 3.6, true], [12, 3.6, false], [-8, 14.4, false], [16, 14.4, true]]) {
    box(group, x - .08, 0, z - .08, x + .08, 5.5, z + .08, trim); box(group, x - .25, 5.4, z - .4, x + .25, 5.55, z + .4, new THREE.MeshBasicMaterial({ color: lit ? '#ffd9a0' : '#3b3d3a' }));
    if (lit) { const l = new THREE.PointLight('#ffcf8a', 14, 16, 1.4); l.position.set(x, 5.2, z); group.add(l); }
  }
  // Burning barrels along the street; only some cast light, to keep the light count low on phones.
  const barrelMetal = mat('#3c2a20'), flameGeometry = new THREE.ConeGeometry(.28, .7, 8);
  const flameMaterial = new THREE.MeshBasicMaterial({ color: '#ffb35a', transparent: true, opacity: .85 });
  const fires = FIRE_BARRELS.map(([x, z, lit], i) => {
    box(group, x - .3, 0, z - .3, x + .3, .9, z + .3, barrelMetal);
    const flame = new THREE.Mesh(flameGeometry, flameMaterial); flame.position.set(x, 1.2, z); group.add(flame);
    let light = null;
    if (lit) { light = new THREE.PointLight('#ff8a3c', 5, 9, 1.5); light.position.set(x, 1.4, z); group.add(light); }
    return { flame, light, phase: i * 2.3 };
  });
  // Fog banks at the street ends, beyond the intruder spawns, swaying slowly.
  const fogCanvas = document.createElement('canvas'); fogCanvas.width = fogCanvas.height = 128;
  const fogContext = fogCanvas.getContext('2d'), fogGradient = fogContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  fogGradient.addColorStop(0, 'rgba(255,255,255,.9)'); fogGradient.addColorStop(1, 'rgba(255,255,255,0)');
  fogContext.fillStyle = fogGradient; fogContext.fillRect(0, 0, 128, 128);
  const fogMaterial = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(fogCanvas), color: '#55636c', transparent: true, opacity: .35, depthWrite: false, fog: false });
  const fogPatches = Array.from({ length: 28 }, (_, i) => {
    const sprite = new THREE.Sprite(fogMaterial), size = 10 + random() * 8;
    sprite.scale.set(size, size * .45, 1); group.add(sprite);
    const end = i % 4, across = random();
    // East and west street ends, the south side street, and the back alley.
    const [x, z] = end === 0 ? [33 + random() * 8, 1 + across * 15] : end === 1 ? [-33 - random() * 8, 1 + across * 15] : end === 2 ? [-3 + across * 6, 35 + random() * 8] : [6 + across * 5, -20 - random() * 6];
    return { sprite, x, y: .6 + random() * 1.6, z, phase: random() * 6 };
  });
  // Back alley: dumpster and a chain-link fence the intruders climb.
  box(group, 7.6, 0, -9, 9.2, 1.3, -7.2, mat('#2f4a3a'));
  for (let x = 7.1; x <= 9.6; x += .5) box(group, x - .03, 0, -12.1, x + .03, 2.2, -12, trim);
  const mesh = new THREE.MeshBasicMaterial({ color: '#6c746f', transparent: true, opacity: .35 }); box(group, 7, .1, -12.07, 9.6, 2.1, -12.03, mesh);

  return {
    setOverview(enabled) { roof.visible = ceiling.visible = upperFacade.visible = !enabled; },
    panes,
    update(time) {
      // Store lighting stays steady; the barrel fires flicker and the fog drifts east.
      for (const f of fires) {
        const t = time + f.phase;
        if (f.light) f.light.intensity = 4 + Math.sin(t * 17) * .8 + Math.sin(t * 7.3) * .6;
        f.flame.scale.y = 1 + Math.sin(t * 13) * .15;
      }
      // Police light bar: red and blue alternate in quick double flashes.
      const phase = (time * 2.2) % 1;
      blinkers[0].visible = phase < .5 && (phase % .25) < .13; blinkers[1].visible = phase >= .5 && (phase % .25) < .13;
      for (const p of fogPatches) p.sprite.position.set(p.x + Math.sin(time * .15 + p.phase) * 1.5, p.y, p.z + Math.cos(time * .11 + p.phase) * 1.2);
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
    // reload: 0..1 progress while changing magazines (null when not reloading).
    place(camera, visible, dt = 0, reload = null) {
      rifle.visible = visible;
      if (!visible) return null;
      kick = Math.max(0, kick - dt * 10.8);
      // Reloading: the rifle dips and cants toward you, then comes back up.
      const dip = reload == null ? 0 : Math.sin(Math.PI * Math.min(1, reload * 1.15));
      offset.set(.2 - dip * .06, -.19 + kick * .02 - dip * .16, -.42 + kick * .06 + dip * .08).applyQuaternion(camera.quaternion);
      rifle.position.copy(camera.position).add(offset);
      rifle.quaternion.copy(camera.quaternion);
      rifle.rotateX(kick * .08 + dip * .35); rifle.rotateZ(dip * .7);
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
  ambientIntensity: 1.05, keyIntensity: .7,
  // Clear across the block; the fog closes in just past the intruder spawns so the city seems to go on.
  fog: ['#141b21', 24, 46],
  models: ['xbot'],
  modes: MODES,
  weapon: true,
  // Down in the valley it's sleet, not the mountain blizzard (the shell's weather doesn't apply here).
  weatherLabel: 'Sleet · 1 °C',
  defaultView: 'Inside store',
  views: [
    { label: 'Overhead', x: 0, z: 15, yaw: Math.PI, pitch: -.95, eye: 21 },
    { label: 'Street', x: -6, z: 15.2, yaw: 2.77, pitch: -.04, eye: 1.7 },
    { label: 'Inside store', x: 0, z: -7.3, yaw: 0, pitch: -.05, eye: 1.7 },
    { label: 'Alley', x: 8.3, z: -10.5, yaw: 0, pitch: -.04, eye: 1.7 },
    { label: 'Drone', x: 0, z: 34, yaw: Math.PI, pitch: -.85, eye: 36, orbit: { radius: 29, centerZ: 5, targetY: 1, speed: .085 } },
  ],
  create({ group, soldier, character, label, linked = false }) {
    const random = seeded(99);
    const city = buildCity(group);
    const fx = createEffects(group);
    // Sleet: short streaks falling around the viewer, slanting with the wind. None inside the store.
    const SLEET = 700, sleetBox = 26;
    const sleetPositions = new Float32Array(SLEET * 6), drops = Array.from({ length: SLEET }, () => ({ x: (random() - .5) * sleetBox, y: random() * 14, z: (random() - .5) * sleetBox, v: 7 + random() * 3 }));
    const sleetGeometry = new THREE.BufferGeometry(); sleetGeometry.setAttribute('position', new THREE.BufferAttribute(sleetPositions, 3));
    const sleet = new THREE.LineSegments(sleetGeometry, new THREE.LineBasicMaterial({ color: '#9fb3c0', transparent: true, opacity: .32, depthWrite: false }));
    sleet.frustumCulled = false; group.add(sleet);
    function updateSleet(camera, dt) {
      const cx = camera.position.x, cz = camera.position.z, top = Math.min(camera.position.y + 6, 16);
      drops.forEach((d, i) => {
        d.y -= d.v * dt; d.x -= 1.4 * dt;
        if (d.y < 0) { d.y += top; d.x = (random() - .5) * sleetBox; d.z = (random() - .5) * sleetBox; }
        const x = cx + d.x, z = cz + d.z, hidden = inStore(x, z);
        sleetPositions.set(hidden ? [0, -5, 0, 0, -5, 0] : [x, d.y, z, x + .06, d.y + .32, z], i * 6);
      });
      sleetGeometry.attributes.position.needsUpdate = true;
    }
    // Status report for the bunker's situation map (read by the shell as 'bunker-city-report').
    let reportTimer = 0;
    // While the feed is open, this scene is the operation: it reports to the shared store
    // (city-store.js, IndexedDB) that the bunker map reads and that keeps simulating when it's closed.
    // Only the drone feed (opened from the bunker map) is the live operation. As a dev scenario the
    // City always starts from zero and never touches the stored operation.
    let opsStore = null, waveDownBase = 0, joinedWounded = 0, linkedReady = false, disposed = false, reportBusy = false;
    const feedSession = globalThis.crypto?.randomUUID?.() || String(Date.now())+Math.random();
    let operation = null, lastHeartbeat = 0, sessionWounded = 0;
    function syncOperation(op) {
      operation = op; linkedReady = true;
      if (op.phase === 'contact') joinWave(op);
      else { setMode('Patrol'); wave=op.wave; tally.down=op.down; waveDownBase=0; }
    }
    if (linked) import('../../city-store.js').then(async store => {
      if(disposed)return;opsStore=store;
      const op=await store.getOperation();if(!disposed)syncOperation(op);
    }).catch(error => console.warn('City operation store unavailable', error));
    // A real-time heartbeat also runs while the game/menu is paused.
    function saveReport() {
      const now=performance.now();
      if(disposed||!linkedReady||reportBusy||now<reportTimer||!opsStore)return;
      reportTimer=now+2000;reportBusy=true;
      const resume=lastHeartbeat>0 && now-lastHeartbeat>12000;lastHeartbeat=now;
      const run=async()=>{
        if(resume){const op=await opsStore.getOperation();if(disposed)return;syncOperation(op);}
        const op=await opsStore.reportLive({session:feedSession,
          wave, contact: mode==='Intruders' && !surprise && intruders.some(alive),
          active:intruders.filter(alive).length,down:tally.down-waveDownBase,
          vip:vip.state==='shelter'||vip.state==='to-shelter'?'sheltering':'safe',
          rounds:rounds+playerShots,wounded:sessionWounded,
        });
        if(disposed)return;
        operation=op;
        if(op.liveSession!==feedSession || op.wave>wave)syncOperation(op);
      };
      run().catch(error=>console.warn('City report unavailable',error)).finally(()=>reportBusy=false);
    }
    // Join the operation as it stands: the intruders still fighting come on, the ones already down lie
    // where they fell along the approaches, and the casualty counts carry over.
    function joinWave(op) {
      setMode('Intruders');
      wave = Math.max(0, op.wave - 1); startWave();
      if (surprise) { surprise = false; assignWaveCover(); }
      const remaining = Math.max(1, op.active), count = Math.min(POOL, 8 + wave * 4);
      intruders.forEach((it, i) => {
        if (i < remaining) return;
        if (i < Math.min(count, remaining + op.down)) {
          // Shot somewhere on the way in, before the barrier.
          const k = 1 + Math.floor(random() * Math.max(1, it.climbAt - 1)), a = it.steps[k - 1], b = it.steps[k], t = .35 + random() * .6;
          Object.assign(it, { state: 'down', fall: 1, x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: 0, crouch: 0 });
          it.yaw = facing(DOOR_OUT[0] - it.x, DOOR_OUT[1] - it.z); chooseFall(it);
          it.c.model.visible = true; it.pistol.visible = false;
        } else { it.state = 'wait'; it.c.model.visible = false; it.pistol.visible = false; }
      });
      tally.down = op.down; waveDownBase = 0; tally.soldiersHit = joinedWounded = op.soldiersWounded || 0; tally.breached = op.breaches || 0;
    }
    // One shared light for muzzle flashes: it stays in the scene (intensity 0) so shaders never recompile.
    const muzzleLight = new THREE.PointLight('#ffc070', 0, 11, 1.6); group.add(muzzleLight);
    let muzzleGlow = 0;
    // Shards from broken panes fall, bounce once and stay on the floor.
    const shardGeometry = new THREE.BoxGeometry(1, 1, .008);
    const shardMaterial = new THREE.MeshStandardMaterial({ color: '#b6d4dc', transparent: true, opacity: .45, roughness: .1, metalness: .4, depthWrite: false });
    const shards = [];
    function breakPane(pane, dir) {
      if (!pane.intact) return;
      pane.intact = false; pane.mesh.visible = false;
      const [x0, y0, z0, x1, y1, z1] = pane.bounds;
      for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(shardGeometry, shardMaterial);
        m.scale.set(.05 + random() * .14, .05 + random() * .16, 1);
        m.position.set(x0 + random() * (x1 - x0), y0 + random() * (y1 - y0), (z0 + z1) / 2);
        m.rotation.set(random() * 3, random() * 3, random() * 3); group.add(m);
        const push = 1 + random() * 2;
        shards.push({ m, v: new THREE.Vector3(dir.x * push + (random() - .5), random() * 1.2, dir.z * push + (random() - .5)), spin: (random() - .5) * 14, bounced: false, resting: false });
      }
      glass(audio, listener, (x0 + x1) / 2, (z0 + z1) / 2);
    }
    function updateShards(dt) {
      for (const s of shards) {
        if (s.resting) continue;
        s.v.y -= 9.8 * dt; s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += s.spin * dt; s.m.rotation.y += s.spin * .6 * dt;
        if (s.m.position.y <= .012) {
          s.m.position.y = .012;
          if (!s.bounced && s.v.y < -1.5) { s.bounced = true; s.v.y *= -.25; s.v.x *= .4; s.v.z *= .4; }
          else { s.resting = true; s.m.rotation.set(-Math.PI / 2, 0, random() * 6); }
        }
      }
    }
    // Magazines: `unit.mag` rounds left, `unit.reload` seconds until the new magazine is in.
    function startReload(unit, [min, max]) {
      unit.reload = min + random() * (max - min);
      reloadSound(audio, listener, unit.x, unit.z, unit.reload);
    }
    function tickReload(unit, dt, size) {
      if (unit.reload > 0 && (unit.reload -= dt) <= 0) { unit.reload = 0; unit.mag = size; }
    }
    // Every shot: flash the light, reveal the shooter, and break any intact pane along its path.
    function shotFired(shooter, from, dir, reach) {
      muzzleLight.position.copy(from); muzzleGlow = 1;
      if (shooter) shooter.revealed = 2.5;
      contact();
      for (const pane of city.panes) {
        if (!pane.intact) continue;
        const t = firstObstruction(from, dir, reach, [pane.bounds]);
        if (t < reach) { const shotEpoch = epoch; pending.push({ at: clock + t / 170, fire: () => { if (shotEpoch === epoch) breakPane(pane, dir); } }); }
      }
    }
    const viewmodel = createViewmodel(group);

    // --- Soldiers -----------------------------------------------------------
    // Five soldiers: two inside the store, one at the door, one on each side of the cordon.
    const ROUTES = [
      { pts: [[-5.6, -1.4], [-5.6, -6.7], [-1.6, -6.7], [-1.6, -1.4]], dir: 1, speed: 1.1, pause: .5 },
      { pts: [[1.6, -1.4], [1.6, -6.7], [5.6, -6.7], [5.6, -1.6]], dir: -1, speed: 1.1, pause: .5 },
      { pts: [[-3.2, 3], [-1.5, 3]], speed: .8, pause: 1 },
      { pts: [[-13.6, 5.2], [-13.6, 8.4]], speed: .9, pause: .8 },
      { pts: [[13.6, 11.6], [13.6, 13.4]], speed: .9, pause: .8 },
    ].map(r => ({ ...r, dir: r.dir || 1, path: route(r.pts) }));
    const COVER = [
      ...[5.2, 7.6, 12.6].flatMap(z => [[14.25, z - .6], [14.25, z + .6]]).map(([x, z]) => ({ x, z, h: 1.05 })),
      { x: 11.1, z: 10, h: 1.6 }, { x: 5.1, z: 10.8, h: 1.3 }, { x: 2.95, z: 3.1, h: .9 },
      { x: 4.6, z: .85, h: .9, window: true }, { x: 3.2, z: .85, h: .9, window: true }, { x: -4.2, z: .85, h: .9, window: true },
    ];
    const rifleGeometry = new THREE.BoxGeometry(.06, .09, .82), dark = new THREE.MeshStandardMaterial({ color: '#1d2224', roughness: .6, metalness: .5 });
    const guards = ROUTES.map(r => {
      const s = soldier(); group.add(s.model);
      const p = r.path.at(0);
      s.actions.Walk.time = random() * 2; s.actions.Idle.time = random() * 2;
      const rifle = new THREE.Mesh(rifleGeometry, dark); rifle.visible = false; group.add(rifle);
      return { s, r, rifle, dist: 0, speed: 0, wait: random() * 2, scanYaw: 0, state: 'route', path: [], after: null, x: p.x, z: p.z, yaw: facing(p.dx * r.dir, p.dz * r.dir), crouch: 0, aim: 0, spot: null, timer: 0, shots: 0, target: new THREE.Vector3(20, 1, 8), foe: null, underFire: 0, segment: undefined, mag: RIFLE_MAG, reload: 0 };
    });

    // --- Armed civilians ------------------------------------------------------
    const JACKETS = ['#3d4c5c', '#5c3d33', '#4c5338', '#3a3a42'];
    const ENTRIES = [
      { zone: 'east', lane: [0, 1], steps: [[27.8, 2.6], [19, 2.8], [16, 5.8], [14.1, 5.8, 'climb'], [6, 6], [1, 2.7], [0, -1.4]] },
      { zone: 'west', lane: [0, 1], steps: [[-27.8, 12.6], [-16, 12.6], [-14.1, 12.6, 'climb'], [-6, 7], [-1, 2.7], [0, -1.2]] },
      { zone: 'south', lane: [1, 0], steps: [[0, 34], [0, 18.5], [0, 16.6, 'climb'], [0, 6], [.5, 2.7], [.3, -1.6]] },
    ];
    // They have the numbers: a pool of 24, spread over the three streets in side-by-side lanes.
    const POOL = 24, LANES = [0, .7, -.7, .35, -.35, 1, -1, .15];
    const pistolGeometry = new THREE.BoxGeometry(.04, .11, .2);
    const intruders = Array.from({ length: POOL }, (_, i) => {
      const entry = ENTRIES[i % ENTRIES.length], lane = LANES[Math.floor(i / ENTRIES.length) % LANES.length];
      // Each lane offsets the route sideways; the door step only slightly, so they still fit through.
      const steps = entry.steps.map(([x, z, kind], n) => { const k = n === entry.steps.length - 2 ? lane * .4 : lane; return [x + entry.lane[0] * k, z + entry.lane[1] * k, kind]; });
      const c = character('xbot', { tint(m, name) { m.color.set(/Joints/i.test(m.name) ? '#1d1d1f' : JACKETS[i % JACKETS.length]); m.roughness = .9; m.metalness = 0; } });
      c.model.rotation.order = 'YXZ'; c.model.visible = false; group.add(c.model);
      const pistol = new THREE.Mesh(pistolGeometry, dark); pistol.visible = false; group.add(pistol);
      return { c, entry, steps, climbAt: steps.findIndex(p => p[2] === 'climb'), pistol, state: 'wait', x: 0, z: 0, y: 0, yaw: 0, hp: 3, step: 0, speed: 0, timer: 0, aim: 0, foe: null, cooldown: 0, spotted: false, fall: 0, climbFrom: null };
    });
    let wave = 0, waveTimer = 0, startupRemaining = linked ? 0 : 5;
    // Wave 1 is an ambush: soldiers keep patrolling, unaware, until first contact.
    let surprise = false, contactCheck = 0;
    const tally = { down: 0, escaped: 0, breached: 0, soldiersHit: 0 };
    const alive = i => i.state !== 'wait' && i.state !== 'down' && i.state !== 'escaped';
    // Intruders still waiting off-screen at their start point can't be targeted yet.
    const exposed = i => alive(i) && i.c.model.visible;
    // Where intruders crouch on the way in: behind wrecks outside the cordon, then the parked cars inside it.
    // Zones keep them from cutting across the cordon: 'in' spots are only used after climbing in.
    const INTRUDER_COVER = [
      ...[[28.2, 5.4], [26.6, 9.4], [25, 13.3]].map(p => [...p, 'east']),
      ...[[-26.6, 9.8], [-22.1, 14.3], [-24.3, 4.6]].map(p => [...p, 'west']),
      ...[[2.15, 23.8], [-2.3, 21.5], [-1.3, 18.4], [1.3, 18.4]].map(p => [...p, 'south']),
      [-7, 7.25, 'in'], [-8.4, 7.25, 'in'], [5.5, 12.4, 'in'], [7.1, 12.4, 'in'],
    ].map(([x, z, zone]) => ({ x, z, zone, by: null }));
    const zoneOf = it => it.step > it.climbAt ? 'in' : it.entry.zone;
    const doorDistance = p => Math.hypot(p.x - DOOR_OUT[0], p.z - DOOR_OUT[1]);
    // You, as something the intruders can shoot at while you're on foot.
    const player = { isPlayer: true, x: 0, z: 0, active: false, underFire: 0, hits: 0, revealed: 0 };
    let hurtTimer = 0;
    function hurtPlayer() {
      player.hits++;
      document.body.classList.add('hurt'); clearTimeout(hurtTimer);
      hurtTimer = setTimeout(() => document.body.classList.remove('hurt'), 260);
    }
    let epoch = 0;
    function startWave() {
      epoch++; wave++; waveDownBase = tally.down;
      surprise = wave === 1;
      if (!surprise) assignWaveCover();
      const count = Math.min(POOL, 8 + wave * 4);
      intruders.forEach((it, n) => {
        if (n >= count) { it.state = 'wait'; it.c.model.visible = false; it.pistol.visible = false; return; }
        const [x, z] = it.steps[0];
        Object.assign(it, { state: 'sneak', x, z, y: 0, hp: 3, step: 1, speed: 0, timer: 1.2 * Math.floor(n / ENTRIES.length) + random() * 2.5, suppressed: 0, mag: PISTOL_MAG, reload: 0, pushing: 0, scan: 0, calm: 0, aim: 0, foe: null, cooldown: 2, spotted: false, fall: 0, breached: false, shotTimer: .5, crouch: 0, cover: null, peeks: 0 });
        it.c.model.visible = false; it.c.model.rotation.x = 0;
      });
    }
    // First contact: everyone opens up at once; soldiers react a moment later and run for cover.
    function contact() {
      if (!surprise) return;
      surprise = false;
      for (const it of intruders) if (alive(it)) { it.spotted = true; it.cooldown = random() * .6; }
      const shotEpoch = epoch;
      pending.push({ at: clock + .6 + random() * .6, fire: () => { if (shotEpoch === epoch) assignWaveCover(); } });
    }
    // Soldiers only notice sneaking intruders up close in the dark (9 m), or 14 m if one is running.
    function checkContact(dt) {
      if (!surprise || (contactCheck -= dt) > 0) return;
      contactCheck = .25;
      for (const g of guards) for (const it of intruders) {
        if (!exposed(it)) continue;
        const d = Math.hypot(it.x - g.x, it.z - g.z);
        if (d < (it.speed > 2 ? 14 : 9) && sightTo(g, it)) return contact();
      }
    }
    // Pick a way to fall with room for the body: backwards, forwards, then either side. Keeps bodies out of shelves and walls.
    function chooseFall(it) {
      for (const [yaw, sign] of [[it.yaw, 1], [it.yaw, -1], [it.yaw + Math.PI / 2, 1], [it.yaw - Math.PI / 2, 1]]) {
        // rotation.x > 0 tips the model onto its back (local +Z); < 0 onto its front.
        const dir = new THREE.Vector3(Math.sin(yaw) * sign, 0, Math.cos(yaw) * sign);
        if (firstObstruction(new THREE.Vector3(it.x, .35, it.z), dir, 1.9) >= 1.85) { it.fallYaw = yaw; it.fallSign = sign; return; }
      }
      it.fallYaw = it.yaw; it.fallSign = 1;
    }
    function hideIntruders() { for (const it of intruders) { it.state = 'wait'; it.c.model.visible = false; it.pistol.visible = false; } }
    function hitIntruder(it, damage) {
      if (!alive(it)) return;
      it.hp -= damage; it.spotted = true;
      if (it.hp <= 0) { it.state = 'down'; it.fall = 0; it.pistol.visible = false; tally.down++; chooseFall(it); }
      // Hit while peeking: duck back behind cover.
      else if (it.state === 'peek') { it.state = 'cover'; it.timer = .8 + random() * .8; }
      // Wounded intruders stay in combat so every wave can be fully cleared.
    }

    const readout = label('', { width: 4.4, lines: 2 }); readout.visible = false; readout.position.set(0, 9.3, 0); group.add(readout);
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

    function assignWaveCover() {
      // Cover faces the three street approaches; each soldier owns one position.
      const free = [
        ...[-14.25,14.25].flatMap(x=>[5.2,7.6,12.6].map(z=>({x,z,h:1.05}))),
        ...[-4.5,-3.4,3.4,4.5].map(x=>({x,z:.6,h:1.25,window:true})),
        {x:2.95,z:3.1,h:.9},{x:-7,z:4,h:1.5},
      ];
      for(const g of guards){
        free.sort((a,b)=>(Math.hypot(a.x-g.x,a.z-g.z)+(inStore(g.x,g.z)!==!!a.window?12:0))-(Math.hypot(b.x-g.x,b.z-g.z)+(inStore(g.x,g.z)!==!!b.window?12:0)));
        const spot=free.shift();g.spot=spot;g.foe=null;g.shots=0;
        travel(g,[spot.x,spot.z],'sprint',()=>{g.state='engage';g.timer=.6;});
      }
    }
    function setMode(next) {
      if (!MODES.includes(next)) return;
      epoch++; waveTimer = 0; hostileTimer = 1; startupRemaining = 0;
      mode = next;
      pending.length = 0;
      if (mode !== 'Intruders') hideIntruders();
      if (mode === 'Patrol' || mode === 'Alert' || mode === 'Intruders') {
        for (const g of guards) if (g.state !== 'route') backToRoute(g);
        if (mode === 'Intruders') { wave = 0; tally.down = tally.escaped = tally.breached = tally.soldiersHit = 0; player.hits = 0; startWave(); }
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
          const ray=to.clone().sub(from),distance=ray.length();to.copy(from).addScaledVector(ray.normalize(),firstObstruction(from,ray,distance));
          fx.flash(from, 1);
          gunshot(audio, listener, hx, hz, { hostile: true });
          fx.tracer(from, to, () => { fx.puff(to); impact(audio, listener, to.x, to.z); });
          incoming++;
        },
      });
    }

    // A soldier fires one round at a world point; `hit` decides if it connects.
    function clearSight(a, b) {
      const dir = new THREE.Vector3().subVectors(b,a), length = dir.length();
      return length < .01 || firstObstruction(a,dir.normalize(),length) >= length - .1;
    }
    // A crouched intruder's head drops below barriers and car bodies.
    // A soldier at a window looks (and fires) from the window opening itself, so the frame doesn't hide the street.
    const atWindow = g => !!g.spot?.window && g.state === 'engage';
    const guardEye = (g, y = 1.5) => new THREE.Vector3(g.x, y, atWindow(g) ? 1.3 : g.z);
    const sightTo = (g,it) => clearSight(guardEye(g),new THREE.Vector3(it.x,1.55+it.y-(it.crouch||0),it.z));
    // What an intruder can see of a soldier: ducked below a sill or barrier, they're hidden.
    const exposedTo = (g,it) => clearSight(new THREE.Vector3(it.x,1.55+it.y-(it.crouch||0),it.z),guardEye(g,1.5-(g.crouch||0)));
    function guardShot(g, target, onHit) {
      const muzzle = g.rifle.position.clone().addScaledVector(w.set(0, 0, 1).applyQuaternion(g.rifle.quaternion), .45);
      // At a window the barrel is out over the sill, just behind the glass, so rounds go through (and break) the pane.
      if (atWindow(g)) muzzle.set(g.x, Math.min(1.85, Math.max(1.35, muzzle.y)), 1.3);
      const dir = target.clone().sub(muzzle), distance = dir.length(), obstruction = firstObstruction(muzzle,dir.normalize(),distance);
      const end = muzzle.clone().addScaledVector(dir,obstruction), shotEpoch = epoch;
      fx.flash(muzzle, .55);
      shotFired(g, muzzle, dir, obstruction);
      fx.tracer(muzzle, end, () => { if (shotEpoch !== epoch) return; if(obstruction >= distance-.1) onHit?.(); else fx.puff(end); });
      gunshot(audio, listener, g.x, g.z);
      rounds++;
    }

    function updateGuard(g, dt) {
      tickReload(g, dt, RIFLE_MAG);
      const { s, r } = g;
      let faceYaw = g.yaw, wantCrouch = 0, wantAim = 0;
      g.underFire = Math.max(0, g.underFire - dt);
      const indoor = inStore(g.x, g.z);
      if (g.state === 'route') {
        const alert = mode === 'Alert' || (mode === 'Intruders' && !surprise);
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
        wantAim = mode === 'Intruders' && !surprise ? .35 : 0;
      } else if (g.state === 'sprint' || g.state === 'return') {
        if (!g.path.length) { backToRoute(g); }
        const [tx, tz] = g.path[0], dx = tx - g.x, dz = tz - g.z, distance = Math.hypot(dx, dz);
        const top = g.state === 'sprint' ? 4.2 : 1.6;
        g.speed = damp(g.speed, g.path.length === 1 ? Math.min(top, distance * 2.5 + .3) : top, 4, dt);
        const step = Math.min(distance, g.speed * dt);
        if (distance > 1e-3) { g.x += dx / distance * step; g.z += dz / distance * step; faceYaw = facing(dx, dz); }
        if (distance < .08) { g.path.shift(); if (!g.path.length) { g.speed = 0; g.after?.(); } }
      } else if (g.state === 'engage') {
        g.speed = damp(g.speed, 0, 6, dt);
        wantCrouch = .55;
        if (!g.foe || !exposed(g.foe) || !sightTo(g,g.foe)) {
          // Next armed civilian in range, otherwise back to the route.
          let next = null, nd = atWindow(g) ? 24 : 18;
          for (const it of intruders) if (exposed(it) && sightTo(g,it)) { const d = Math.hypot(it.x - g.x, it.z - g.z); if (d < nd) { next = it; nd = d; } }
          if (next) {g.foe = next;next.spotted=true;} else {g.foe=null;}
          // Lull in the fight: top up a half-empty magazine.
          if (!g.foe && g.mag < 12 && g.reload <= 0) startReload(g, RELOAD.soldier);
        }
        if (g.foe) {
          const f = g.foe;
          faceYaw = facing(f.x - g.x, f.z - g.z);
          g.target.set(f.x, 1.2 + f.y, f.z);
          // Fire in bursts, ducking below the sill (or barrier) between them.
          // Reloading: get down behind cover until the new magazine is in.
          wantAim = g.reload > 0 ? .2 : 1;
          wantCrouch = g.reload > 0 || g.underFire > 0 || (g.shots <= 0 && g.timer > .35) ? .55 : .12;
          g.timer -= dt;
          if (g.timer <= 0 && g.aim > .9 && g.reload <= 0) {
            if (g.shots <= 0) g.shots = 2 + Math.floor(random() * 2);
            g.shots--;
            if (--g.mag <= 0) { startReload(g, RELOAD.soldier); g.shots = 0; }
            g.timer = g.shots > 0 ? .14 : .6 + random() * .8;
            const hit = random() < .3;
            const target = hit ? g.target.clone() : g.target.clone().add(v.set((random() - .5) * 1.6, (random() - .5) * .8 - .4, (random() - .5) * 1.6));
            guardShot(g, target, () => { if (hit) { hitIntruder(f, 1); fx.puff(target); } else { fx.puff(target); impact(audio, listener, target.x, target.z); if (Math.hypot(target.x - f.x, target.z - f.z) < 2.5) f.suppressed = 1.5; } });
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
      s.model.position.set(g.x, groundAt(g.x, g.z), g.z);
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
      let faceYaw = it.yaw, wantAim = 0, wantCrouch = 0;
      const steps = it.steps;
      if (it.state === 'down') {
        // Fall over half a second, then lie still on top of the surface (the body is ~0.25 m thick).
        it.fall = Math.min(1, it.fall + dt * 2.2);
        const k = 1 - (1 - it.fall) ** 3;
        c.model.rotation.y = it.fallYaw;
        c.model.rotation.x = it.fallSign * Math.PI / 2 * k;
        c.model.position.set(it.x, groundAt(it.x, it.z) + .13 * k, it.z);
        if (it.fall < 1) { c.setSpeed(0); c.mixer.update(dt); }
        return;
      }
      it.suppressed = Math.max(0, (it.suppressed || 0) - dt);
      tickReload(it, dt, PISTOL_MAG);
      it.pushing = Math.max(0, it.pushing - dt);
      // Time since rounds last landed close: they only feel safe to move after a quiet moment.
      it.calm = it.suppressed > 0 ? 0 : it.calm + dt;
      if (it.timer > 0 && it.state === 'sneak' && it.step === 1 && it.speed === 0) { it.timer -= dt; c.model.visible = it.timer < 1; }
      else if (it.state === 'sneak' || it.state === 'flee') {
        const fleeing = it.state === 'flee';
        const goal = fleeing ? steps[Math.max(0, it.step - 1)] : steps[it.step];
        const dx = goal[0] - it.x, dz = goal[1] - it.z, distance = Math.hypot(dx, dz);
        if (!fleeing && goal[2] === 'climb') { it.state = 'climb'; it.timer = 0; it.climbFrom = [it.x, it.z]; }
        else {
          // Firing while advancing means a fast walk, not a sprint.
          const top = fleeing ? 3.8 : it.pushing > 0 && it.foe ? 2.2 : it.spotted ? 3.4 : surprise ? 1 : 1.25;
          if (surprise) wantCrouch = .22;
          it.speed = damp(it.speed, top, 3, dt);
          const step = Math.min(distance, it.speed * dt);
          if (distance > 1e-3) { moveThroughCity(it, dx / distance * step, dz / distance * step); faceYaw = facing(dx, dz); }
          if (distance < .1) {
            if (fleeing) { it.step--; if (it.step <= 0) { it.state = 'escaped'; c.model.visible = false; it.pistol.visible = false; tally.escaped++; } }
            else if (++it.step >= steps.length) { it.state = 'hold'; it.speed = 0; it.shotTimer = .5; if (!it.breached) { it.breached = true; tally.breached++; } }
          }
          // A soldier (or you) in sight: dive into nearby cover if there is any, else stop and shoot.
          it.cooldown -= dt;
          // Rounds landing close (suppressed) send them to cover straight away. Near the door they just rush it.
          // Pushing forward: keep moving and fire on the move; only heavy fire (or an empty gun) stops them.
          if (!surprise && it.pushing > 0) {
            if ((it.scan -= dt) <= 0) { it.scan = .3; it.foe = nearestTarget(it, 18); }
            if (it.foe && it.reload <= 0) {
              wantAim = 1; it.shotTimer -= dt;
              if (it.shotTimer <= 0 && it.aim > .7) { it.shotTimer = .5 + random() * .6; intruderShot(it, true); }
            }
            if (it.suppressed > 1.2 && random() < dt * 3 * (1 - courage(it))) it.pushing = 0;
          }
          // Under fire, take cover; otherwise advance. Near the door they just rush it.
          else if (!surprise && !fleeing && it.state === 'sneak' && (it.cooldown <= 0 || it.suppressed > 0) && it.step < steps.length - 2) {
            const target = nearestTarget(it, 18);
            if (!target) it.cooldown = .3;
            else if (it.suppressed <= 0 && random() < courage(it)) push(it, target);
            else {
              it.foe = target;
              const spot = freeCover(it, it.suppressed > 0 ? 9 : 7);
              if (spot) { spot.by = it; it.cover = spot; it.state = 'tocover'; }
              // Pinned with nowhere to hide: back off a few metres the way they came, then try again.
              else if (it.suppressed > 0 && it.step > 1) fallBack(it);
              else { it.state = 'shoot'; it.timer = 1 + random(); it.shotTimer = .3; }
            }
          }
        }
      } else if (it.state === 'fallback') {
        // Crouched retreat toward the previous waypoint; after a moment (or on arrival) they advance again.
        const back = steps[Math.max(0, it.step - 1)], dx = back[0] - it.x, dz = back[1] - it.z, distance = Math.hypot(dx, dz);
        it.speed = damp(it.speed, 3, 5, dt); wantCrouch = .3;
        const step = Math.min(distance, it.speed * dt);
        if (distance > 1e-3) { moveThroughCity(it, dx / distance * step, dz / distance * step); faceYaw = facing(dx, dz); }
        // Cover turns up on the way back: take it.
        const spot = (it.scan -= dt) <= 0 && (it.scan = .3, freeCover(it, 4));
        if (spot) { spot.by = it; it.cover = spot; it.state = 'tocover'; }
        else if ((it.timer -= dt) <= 0 || distance < .2) { it.state = 'sneak'; it.cooldown = 1 + random(); }
      } else if (it.state === 'tocover') {
        const dx = it.cover.x - it.x, dz = it.cover.z - it.z, distance = Math.hypot(dx, dz);
        it.speed = damp(it.speed, Math.min(3.6, distance * 3 + .4), 5, dt);
        const step = Math.min(distance, it.speed * dt);
        if (distance > 1e-3) { moveThroughCity(it, dx / distance * step, dz / distance * step); faceYaw = facing(dx, dz); }
        if (distance < .1) { it.state = 'cover'; it.timer = .8 + random(); it.peeks = 2 + Math.floor(random() * 2); }
      } else if (it.state === 'cover' || it.state === 'peek') {
        // Crouch behind cover, rise to fire a few rounds, duck again; after a few peeks move on.
        it.speed = damp(it.speed, 0, 8, dt);
        if (it.foe) faceYaw = facing(it.foe.x - it.x, it.foe.z - it.z);
        it.timer -= dt;
        if (it.state === 'cover') {
          wantCrouch = .55;
          // Pinned: rounds keep landing close, so they stay down. Reloading also happens down here.
          if (it.suppressed > 0 || it.reload > 0) it.timer = Math.max(it.timer, .4);
          if (it.timer <= 0) {
            // Quiet for a moment and friends close by: get up and go instead of peeking.
            if (it.calm > 1 && random() < courage(it) * .8) leaveCover(it, true);
            else { it.foe = nearestTarget(it, 18) || it.foe; it.state = 'peek'; it.timer = 1.3 + random() * .9; it.shotTimer = .35 + random() * .3; }
          }
        } else {
          wantCrouch = .08; wantAim = 1;
          if (it.foe && !sightTo(it.foe, it)) it.foe = nearestTarget(it, 18);
          it.shotTimer -= dt;
          if (it.foe && it.shotTimer <= 0 && it.aim > .85) { it.shotTimer = .45 + random() * .55; intruderShot(it); }
          // Empty: duck back down to reload.
          if (it.reload > 0) { it.state = 'cover'; it.timer = it.reload + .2; }
          // Rounds snapping past: get down early.
          if (it.suppressed > 1.2 && it.timer > .4) { it.state = 'cover'; it.timer = .7 + random() * .8; }
          if (it.timer <= 0) {
            if (--it.peeks > 0 && it.foe) { it.state = 'cover'; it.timer = .9 + random() * 1.3; }
            else leaveCover(it, false);
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
        // Standing in the open under heavy fire: break off and find cover or fall back (not once inside the store).
        if (it.state === 'shoot' && it.suppressed > 1.2 && random() < dt * 4 * (1 - courage(it))) {
          const spot = freeCover(it, 9);
          if (spot) { spot.by = it; it.cover = spot; it.state = 'tocover'; } else if (it.step > 1) fallBack(it);
        }
        if (!it.foe || it.state === 'hold' || !sightTo(it.foe,it)) it.foe = nearestTarget(it, 16);
        if (it.foe) {
          faceYaw = facing(it.foe.x - it.x, it.foe.z - it.z); wantAim = 1;
          it.shotTimer -= dt;
          if (it.shotTimer <= 0 && it.aim > .85) { it.shotTimer = .45 + random() * .5; intruderShot(it); }
        }
        // Reloading in the open: crouch while the new magazine goes in.
        if (it.reload > 0) { wantAim = 0; wantCrouch = .45; }
        if (it.state === 'shoot') { it.timer -= dt; if (it.timer <= 0) { it.state = 'sneak'; it.cooldown = 2 + random() * 2.5; } }
      }
      it.yaw += angleDelta(it.yaw, faceYaw) * (1 - Math.exp(-dt * 7));
      it.aim = damp(it.aim, wantAim, 8, dt);
      c.model.position.set(it.x, it.y + groundAt(it.x, it.z), it.z);
      c.model.rotation.y = it.yaw;
      c.setSpeed(it.state === 'climb' ? .6 : it.speed);
      c.mixer.update(dt);
      it.crouch = damp(it.crouch || 0, wantCrouch, 7, dt);
      crouch(c.model, it.crouch);
      const pose = it.aim > .02 && it.foe ? aimPistol(c.model, group.localToWorld(v.set(it.foe.x, 1.3, it.foe.z)), it.aim) : null;
      it.pistol.visible = !!pose && it.aim > .3;
      if (pose) {
        group.worldToLocal(pose.hand);
        it.pistol.position.copy(pose.hand);
        it.pistol.lookAt(group.localToWorld(w.copy(pose.hand).addScaledVector(pose.dir, 3)));
      }
    }
    // Nearest soldier in sight, or you if you're on foot, in sight and closer.
    function nearestTarget(it, range) {
      const guard = nearestGuard(it, range);
      if (!player.active) return guard;
      const d = Math.hypot(player.x - it.x, player.z - it.z);
      const closer = d < (guard ? Math.hypot(guard.x - it.x, guard.z - it.z) : player.revealed > 0 ? Math.max(range, 32) : range);
      return closer && clearSight(new THREE.Vector3(it.x, 1.5 + it.y, it.z), new THREE.Vector3(player.x, 1.5, player.z)) ? player : guard;
    }
    // Courage to advance instead of hiding: grows with friends close by (peer pressure), drops under fire.
    function fallBack(it) { it.state = 'fallback'; it.pushing = 0; it.timer = 1.5 + random() * 1.5; it.scan = 0; }
    function courage(it) {
      let friends = 0;
      for (const o of intruders) if (o !== it && exposed(o) && Math.hypot(o.x - it.x, o.z - it.z) < 6) friends++;
      const base = Math.min(.75, .12 + friends * .14);
      return it.suppressed > 0 ? (friends >= 4 ? .25 : 0) : base;
    }
    // Advance for a few seconds, firing on the move. Nearby friends who are not pinned often join in.
    function push(it, target, rally = true) {
      if (it.cover) { it.cover.by = null; it.cover = null; }
      Object.assign(it, { state: 'sneak', foe: target || it.foe, pushing: 3 + random() * 3, spotted: true, cooldown: 2 + random() * 2, timer: 0, shotTimer: .4 + random() * .4 });
      if (!rally) return;
      for (const o of intruders) {
        if (o === it || !exposed(o) || o.pushing > 0 || o.suppressed > 0 || Math.hypot(o.x - it.x, o.z - it.z) > 6) continue;
        if (['cover', 'peek', 'shoot', 'sneak'].includes(o.state) && random() < .6) push(o, null, false);
      }
    }
    // Done with this cover: bound to cover closer to the store, or push forward in the open.
    function leaveCover(it, eager) {
      const from = it.cover; from.by = null; it.cover = null;
      const next = !eager || random() < .5 ? freeCover(it, 10, doorDistance(from) - 2) : null;
      if (next) { next.by = it; it.cover = next; it.state = 'tocover'; }
      else push(it, it.foe, eager);
    }
    // Nearest free cover on the intruder's side of the cordon; `closerThan` keeps only spots nearer the store door.
    function freeCover(it, range, closerThan = Infinity) {
      let best = null, bestDistance = range;
      const zone = zoneOf(it);
      for (const s of INTRUDER_COVER) {
        if (s.zone !== zone || doorDistance(s) >= closerThan) continue;
        if (s.by && s.by.cover === s && alive(s.by)) continue;
        const d = Math.hypot(s.x - it.x, s.z - it.z);
        if (d < bestDistance) { best = s; bestDistance = d; }
      }
      return best;
    }
    // One pistol round. Intruders are poor shots: wide misses, and only a few rounds connect.
    function intruderShot(it, moving = false) {
      if (it.mag <= 0 || it.reload > 0) return;
      if (--it.mag <= 0) startReload(it, RELOAD.intruder);
      const f = it.foe;
      const muzzle = it.pistol.position.clone().addScaledVector(w.set(0, 0, 1).applyQuaternion(it.pistol.quaternion), .14);
      const range = Math.hypot(f.x - it.x, f.z - it.z), spread = 1.2 + range * .15;
      // Firing on the move halves what little accuracy they have.
      const hit = random() < (f.isPlayer ? .1 : .14) * Math.min(1, 8 / range) * (moving ? .5 : 1);
      const aim = hit ? new THREE.Vector3(f.x, f.isPlayer ? 1.3 : 1.1, f.z)
        : new THREE.Vector3(f.x + (random() - .5) * spread, .2 + random() * 2.2, f.z + (random() - .5) * spread);
      // A miss keeps flying past the target until it meets a wall, cover or the ground.
      const dir = aim.sub(muzzle), toTarget = dir.length(); dir.normalize();
      let reach = hit ? toTarget : 40;
      if (!hit && dir.y < -1e-3) reach = Math.min(reach, -muzzle.y / dir.y);
      const blocked = firstObstruction(muzzle, dir, reach), end = muzzle.clone().addScaledVector(dir, blocked);
      const connects = hit && blocked >= toTarget - .1, shotEpoch = epoch;
      fx.flash(muzzle, .35);
      shotFired(null, muzzle, dir, blocked);
      fx.tracer(muzzle, end, () => {
        if (shotEpoch !== epoch) return;
        if (connects && f.isPlayer) hurtPlayer();
        else { fx.puff(end); impact(audio, listener, end.x, end.z); }
        if (connects && !f.isPlayer) {tally.soldiersHit++;sessionWounded++;}
      });
      gunshot(audio, listener, it.x, it.z, { pistol: true });
      f.underFire = 2;
      incoming++;
    }
    // --- VIP ---------------------------------------------------------------------
    // Unarmed, inside the store. Paces the centre aisle; at the first sign of shooting runs to the
    // storeroom and crouches behind the crates until it has been quiet for a few seconds.
    const VIP_PACE = [[0, -2.6], [0, -6.3]], VIP_SHELTER = [[0, -6.9], [0, -8.5], [-3.9, -8.9]];
    const vip = (() => {
      const c = character('xbot', { tint(m) { m.color.set(/Joints/i.test(m.name) ? '#b9b1a3' : '#262a33'); m.roughness = .7; m.metalness = 0; } });
      group.add(c.model);
      return { c, x: 0, z: -2.6, yaw: 0, speed: 0, crouch: 0, state: 'pace', path: [], end: 1, wait: 1.5, calm: 0, hits: 0 };
    })();
    function updateVip(dt) {
      const v = vip, threat = mode === 'Take cover' || mode === 'Firefight' || (!surprise && intruders.some(exposed));
      let top = 0, wantCrouch = 0, faceYaw = v.yaw;
      if (threat && v.state !== 'shelter' && v.state !== 'to-shelter') {
        v.state = 'to-shelter'; v.path = v.z > -7.3 ? VIP_SHELTER.map(p => [...p]) : [VIP_SHELTER[2]];
      }
      if (v.state === 'shelter') {
        wantCrouch = .6; faceYaw = 0;
        v.calm = threat ? 0 : v.calm + dt;
        if (v.calm > 3) { v.state = 'return'; v.path = [[0, -8.5], [0, -6.9], [...VIP_PACE[0]]]; }
      } else if (v.state === 'pace' && !v.path.length) {
        // Pause at each end of the aisle, glancing side to side, then walk to the other end.
        v.wait -= dt; faceYaw = v.yaw + Math.sin(v.wait * 2) * .02;
        if (v.wait <= 0) { v.end = 1 - v.end; v.path = [[...VIP_PACE[v.end]]]; }
      }
      if (v.path.length) {
        top = v.state === 'to-shelter' ? 3.8 : .9;
        const [tx, tz] = v.path[0], dx = tx - v.x, dz = tz - v.z, distance = Math.hypot(dx, dz);
        v.speed = damp(v.speed, Math.min(top, distance * 3 + .3), 5, dt);
        const step = Math.min(distance, v.speed * dt);
        if (distance > 1e-3) { v.x += dx / distance * step; v.z += dz / distance * step; faceYaw = facing(dx, dz); }
        if (distance < .06) {
          v.path.shift();
          if (!v.path.length) {
            v.speed = 0;
            if (v.state === 'to-shelter') { v.state = 'shelter'; v.calm = 0; }
            else { v.state = 'pace'; v.wait = 2 + random() * 2; }
          }
        }
      } else v.speed = damp(v.speed, 0, 8, dt);
      v.yaw += angleDelta(v.yaw, faceYaw) * (1 - Math.exp(-dt * 6));
      v.crouch = damp(v.crouch, wantCrouch, 6, dt);
      v.c.model.position.set(v.x, groundAt(v.x, v.z), v.z); v.c.model.rotation.y = v.yaw;
      v.c.setSpeed(v.speed); v.c.mixer.update(dt);
      crouch(v.c.model, v.crouch);
    }
    // Keep bodies from overlapping: push apart from each other and step off soldiers, never into walls.
    function separateIntruders() {
      const live = intruders.filter(i => exposed(i) && i.state !== 'climb');
      for (const a of live) {
        for (const b of [...live, ...guards]) {
          if (a === b) continue;
          const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = .7;
          if (d >= min) continue;
          // Exactly overlapping: pick a sideways direction.
          const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0, push = (min - d) * (guards.includes(b) ? 1 : .5);
          moveThroughCity(a, nx * push, nz * push);
        }
      }
    }
    function nearestGuard(it, range) {
      let best = null, bestDistance = range;
      for (const g of guards) { const d = Math.hypot(g.x - it.x, g.z - it.z); if (d < (g.revealed > 0 ? Math.max(bestDistance, 32) : bestDistance) && exposedTo(g,it)) { best = g; bestDistance = d; } }
      return best;
    }

    // --- Player weapon ----------------------------------------------------------
    let muzzle = null, firstPerson = false;
    // Your rifle: 30 rounds; R (or tapping the ammo counter) reloads, and it reloads itself when empty.
    let playerMag = RIFLE_MAG, playerReload = 0, playerReloadTotal = 0;
    function startPlayerReload(empty) {
      if (playerReload > 0 || playerMag >= RIFLE_MAG) return;
      playerReload = playerReloadTotal = empty ? RELOAD.playerEmpty : RELOAD.player;
      reloadSound(audio, listener, listener.x, listener.z, playerReload);
    }
    function fire({ origin, dir }) {
      if (origin.y >= 4) return null;
      if (playerReload > 0) return { reloading: true };
      if (playerMag <= 0) { startPlayerReload(true); return { reloading: true }; }
      const o = group.worldToLocal(origin.clone()), d = dir.clone().transformDirection(new THREE.Matrix4().copy(group.matrixWorld).invert());
      // Nearest hit among intruder heads (one-shot) and torsos, else the ground or far away.
      let best = firstObstruction(o,d,60), victim = null, damage = 0;
      if(d.y < -1e-3)best=Math.min(best,Math.max(0,-o.y/d.y));
      for (const it of intruders) if (alive(it)) for (const [y, radius, dmg] of [[1.62 + it.y - it.crouch, .14, 3], [1.15 + it.y - it.crouch, .32, 2]]) {
        const distance = sphereEntry(o,d,{x:it.x,y,z:it.z},radius);
        if(distance < best){best=distance;victim=it;damage=dmg;}
      }
      let vipHit = false;
      for (const [y, radius] of [[1.62 - vip.crouch, .14], [1.15 - vip.crouch, .32]]) {
        const distance = sphereEntry(o,d,{x:vip.x,y,z:vip.z},radius);
        if (distance < best) { best = distance; victim = null; vipHit = true; }
      }
      const end = o.clone().addScaledVector(d,best), shotEpoch = epoch;
      const from = muzzle ? muzzle.clone() : o.clone();
      fx.flash(from, .45);
      shotFired(player, o, d, best);
      fx.tracer(from, end, () => {
        if (shotEpoch !== epoch) return;
        if (vipHit) { vip.hits++; fx.puff(end); }
        else if (victim) { hitIntruder(victim, damage); fx.puff(end); }
        else { fx.puff(end); impact(audio, listener, end.x, end.z); }
      });
      gunshot(audio, listener, listener.x, listener.z);
      viewmodel.fired();
      playerShots++;
      if (--playerMag <= 0) startPlayerReload(true);
      // Near misses pin intruders down: anyone within ~1.5 m of the round's path is suppressed.
      for (const it of intruders) {
        if (!exposed(it) || it === victim) continue;
        const along = Math.max(0, Math.min(best, (it.x - o.x) * d.x + (1.2 - o.y) * d.y + (it.z - o.z) * d.z));
        const px = o.x + d.x * along - it.x, py = o.y + d.y * along - 1.2, pz = o.z + d.z * along - it.z;
        if (px * px + py * py + pz * pz < 2.25) it.suppressed = Math.max(it.suppressed, 1.5);
      }
      return { hit: !!victim };
    }

    return {
      setMode: next => { if(!linked)setMode(next); },
      heartbeat: saveReport,
      fire,
      move: moveThroughCity,
      reload() { startPlayerReload(playerMag === 0); },
      getAmmo: () => firstPerson ? { mag: playerMag, size: RIFLE_MAG, reloading: playerReload > 0 ? 1 - playerReload / playerReloadTotal : null } : null,
      getStatus() {
        const active = intruders.filter(alive).length;
        return { mode: mode === "Intruders" && surprise ? "Patrol" : mode, title: mode === "Intruders" && !surprise ? "Defend the market" : "City operation", detail: startupRemaining > 0 || (mode === "Intruders" && surprise) ? "Night patrol. All quiet on the block." : mode === "Intruders" ? `${wave === 1 ? "Ambush! " : ""}Wave ${wave} · ${active} active · ${tally.down} stopped · ${tally.breached} breached · ${guards.filter(g=>g.state === "engage").length} in cover` : mode === "Patrol" ? "Observe the patrols. Choose Intruders to defend the store." : mode === "Alert" ? "Patrols are moving at alert pace." : "Eastern contact. Use the barriers and broken storefront as cover.", stats: `${playerShots} shots fired · VIP ${vip.state === 'shelter' ? 'sheltering' : vip.state === 'to-shelter' ? 'running to shelter' : 'safe'}${vip.hits ? ` (hit by you ${vip.hits}×)` : ''}${mode === 'Intruders' ? ` · you were hit ${player.hits}× · soldiers hit ${tally.soldiersHit}×` : ''}${!linked && waveTimer > 0 ? " · Next wave in " + Math.ceil(6-waveTimer) + "s" : ""}` };
      },
      beforeRender(camera, dt) {
        updateSleet(camera, dt);
        // Show the rifle only in first-person (low) views.
        firstPerson = camera.position.y < 4;
        city.setOverview(!firstPerson);
        muzzle = viewmodel.place(camera, firstPerson, dt, playerReload > 0 ? 1 - playerReload / playerReloadTotal : null);
      },
      update(dt, env = {}) {
        audio = env.audio || null;
        if (env.listener) listener = env.listener;
        player.x = listener.x; player.z = listener.z; player.active = firstPerson && !!env.listener;
        if (dt <= 0) return;
        clock += dt;
        if(linked && linkedReady && operation && operation.liveSession===feedSession && operation.phase!=='contact' && Date.now()>=operation.phaseEnds){
          const nextWave=operation.wave+1;
          joinWave({...operation,phase:'contact',wave:nextWave,active:Math.min(24,8+nextWave*4),down:0});
          operation={...operation,phase:'contact',wave:nextWave};
        }
        if (startupRemaining > 0) { startupRemaining = Math.max(0,startupRemaining-dt); if (startupRemaining === 0) setMode('Intruders'); }
        city.update(clock);
        saveReport(dt);
        muzzleGlow = Math.max(0, muzzleGlow - dt * 16); muzzleLight.intensity = muzzleGlow * 14;
        player.revealed = Math.max(0, player.revealed - dt);
        for (const g of guards) g.revealed = Math.max(0, (g.revealed || 0) - dt);
        updateShards(dt);
        if (playerReload > 0 && (playerReload -= dt) <= 0) { playerReload = 0; playerMag = RIFLE_MAG; }
        updateVip(dt);
        for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= clock) { pending[i].fire(); pending.splice(i, 1); }
        for (const g of guards) updateGuard(g, dt);
        for (const it of intruders) updateIntruder(it, dt);
        checkContact(dt);
        separateIntruders();
        hostileFire(dt);
        if (mode === 'Intruders' && wave > 0 && startupRemaining === 0 && !intruders.some(alive)) { if(waveTimer===0)for(const g of guards)backToRoute(g); waveTimer += dt; if (!linked && waveTimer > 6) { waveTimer = 0; startWave(); } } else waveTimer = 0;
        fx.update(dt);
        const counts = guards.reduce((c, g) => (c[g.state] = (c[g.state] || 0) + 1, c), {});
        const line = mode === 'Intruders'
          ? `wave ${wave} · ${intruders.filter(alive).length} active · ${tally.down} down · ${tally.escaped} fled · ${tally.breached} got in · ${counts.engage || 0} engaging`
          : mode === 'Patrol' || mode === 'Alert'
            ? `${counts.route || 0} on post · ${counts.return || 0} returning`
            : `${counts.sprint || 0} moving · ${counts.cover || 0} in cover · ${counts.peek || 0} firing`;
        readout.userData.set(`${mode.toUpperCase()}${audio ? '' : ' · tap Sound for audio'}\n${line} · you fired ${playerShots}`);
      },
      dispose() { disposed=true;if(opsStore)opsStore.releaseLive(feedSession).catch(()=>{});clearTimeout(hurtTimer); document.body.classList.remove('hurt'); },
      interaction: () => { if(linked)return null;const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; return { label: 'Mode → ' + next, action() { setMode(next); } }; },
    };
  },
};
