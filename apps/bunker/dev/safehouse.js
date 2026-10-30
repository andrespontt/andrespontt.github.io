import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { facing } from './kit.js';
import { angleDelta, damp } from './easing.js';
import { aimRifle, crouch, bone, solveTwoBone } from '../rig.js';
import { seeded } from './combat.js';
import { firstObstruction } from './city-space.js';
import { plan as planRoute } from './city-paths.js';
import { followRoute } from './actor-motion.js';
import { wallPieces, planSolids, walkRects, walk, inRect, lookX, lookY, lookZ } from './safehouse-plans.js';
import { dateLabel, military } from '../protectorate.mjs?v=protect3';

// Outpost 07 safe houses behind the Veyr river (Hollow Pine, Tinker's Loft). Each scenario file supplies a floor plan
// (safehouse-plans.js), its own furnishing and lines; this module runs what they share: guards on their posts, a
// patrol stop, the sleeper, the radio operator, an enemy patrol that drives past every minute or two (lights out,
// everyone to the windows), weather, the cutaway view and talking to the guards.
export const MODES = ['Routine', 'Patrol passing'];

// --- Building helpers ----------------------------------------------------------------------------------------
export function createBuilder(group) {
  const cube = new THREE.BoxGeometry(1, 1, 1), cache = new Map();
  const mat = (color, roughness = .9, metalness = 0) => {
    const key = color + '|' + roughness + '|' + metalness;
    if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    return cache.get(key);
  };
  const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const box = (x0, y0, z0, x1, y1, z1, m, parent = group) => {
    const b = new THREE.Mesh(cube, m); b.scale.set(x1 - x0, y1 - y0, z1 - z0); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(b); return b;
  };
  // A box with UVs in metres, so tiling textures (logs, bricks, boards) keep one scale on pieces of any size.
  const worldBox = (x0, y0, z0, x1, y1, z1, m, parent = group) => {
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0, geometry = new THREE.BoxGeometry(sx, sy, sz), uv = geometry.attributes.uv;
    // Faces +x, -x, +y, -y, +z, -z with four vertices each; u/v run along (z, y), (x, z) and (x, y).
    const spans = [[sz, sy, z0, y0], [sz, sy, z0, y0], [sx, sz, x0, z0], [sx, sz, x0, z0], [sx, sy, x0, y0], [sx, sy, x0, y0]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k, [su, sv, ou, ov] = spans[f]; uv.setXY(i, ou + uv.getX(i) * su, ov + uv.getY(i) * sv); }
    const b = new THREE.Mesh(geometry, m); b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(b); return b;
  };
  const cylinder = (x, y0, z, radius, y1, m, parent = group, segments = 12) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, y1 - y0, segments), m); c.position.set(x, (y0 + y1) / 2, z); parent.add(c); return c;
  };
  const tex = (w, h, draw, repeat) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    return t;
  };
  // A flat picture (map, sign, photo board), facing +Z before `rotation`.
  const picture = (map, w, h, x, y, z, rotation = 0, { parent = group, lit = false } = {}) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lit ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshStandardMaterial({ map, roughness: .9 }));
    m.position.set(x, y, z); m.rotation.y = rotation; parent.add(m); return m;
  };
  // Floor with rectangular holes (a hatch, a stairwell). World-space UVs, so planks keep one size everywhere.
  const floor = ([x0, z0, x1, z1], holes, material, y = .02, parent = group) => {
    const shape = new THREE.Shape([[x0, -z0], [x1, -z0], [x1, -z1], [x0, -z1]].map(([a, b]) => new THREE.Vector2(a, b)));
    for (const [a, b, c, d] of holes || []) shape.holes.push(new THREE.Path([[a, -b], [a, -d], [c, -d], [c, -b]].map(([u, v]) => new THREE.Vector2(u, v))));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), material); m.rotation.x = -Math.PI / 2; m.position.y = y; parent.add(m); return m;
  };
  // Walls of a floor plan: room faces in `inside`, faces toward the outdoors in `outside`.
  function walls(P, inside, outside, parent = group) {
    for (const w of P.walls) {
      const out = w.outside || 0, faces = !out ? inside : w.axis === 'x'
        ? [inside, inside, inside, inside, out > 0 ? outside : inside, out > 0 ? inside : outside]
        : [out > 0 ? outside : inside, out > 0 ? inside : outside, inside, inside, inside, inside];
      for (const b of wallPieces({ height: P.height, ...w })) worldBox(...b, faces, parent);
    }
  }
  // Glass, frame and mullion in every window opening. Returns the panes (to tint when headlights pass).
  function windows(P, frame, glass, parent = group) {
    const panes = [];
    for (const w of P.walls) for (const [a, b, sill, head] of w.openings || []) {
      if (sill <= 0) continue;
      const t = (w.thick ?? .2) / 2;
      const put = (u0, y0, u1, y1, d0, d1, m) => w.axis === 'x' ? box(u0, y0, w.at + d0, u1, y1, w.at + d1, m, parent) : box(w.at + d0, y0, u0, w.at + d1, y1, u1, m, parent);
      panes.push(put(a, sill, b, head, -.012, .012, glass));
      put(a - .05, sill - .06, b + .05, sill, -t - .05, t + .05, frame);
      put(a - .05, head, b + .05, head + .06, -t - .01, t + .01, frame);
      put(a - .05, sill, a, head, -t - .01, t + .01, frame); put(b, sill, b + .05, head, -t - .01, t + .01, frame);
      if (b - a > .9) put((a + b) / 2 - .025, sill, (a + b) / 2 + .025, head, -.03, .03, frame);
    }
    return panes;
  }
  return { cube, mat, glow, box, worldBox, cylinder, tex, picture, floor, walls, windows };
}

// Shared soft glow (flames, lamps, headlights, smoke).
export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(.35, 'rgba(255,255,255,.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Kenney Car Kit vehicles (CC0, they face +Z), loaded once and cloned. The holder keeps a box placeholder until the
// model arrives, and keeps it if the download fails.
const vehicleLoads = new Map();
export function dressVehicle(holder, name, length, recolor) {
  if (!vehicleLoads.has(name)) vehicleLoads.set(name, new GLTFLoader().loadAsync(new URL('../assets/vehicles/' + name + '.glb', import.meta.url).href));
  return vehicleLoads.get(name).then(gltf => {
    if (!holder.parent?.parent) return null; // the scenario was rebuilt meanwhile
    const model = gltf.scene.clone(true), bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    const k = length / Math.max(size.x, size.z);
    model.scale.setScalar(k);
    model.position.set(-(bounds.min.x + bounds.max.x) / 2 * k, -bounds.min.y * k, -(bounds.min.z + bounds.max.z) / 2 * k);
    if (recolor) model.traverse(n => { if (n.isMesh) { n.material = n.material.clone(); recolor(n.material, n.name); } });
    for (const child of [...holder.children]) if (!child.userData.keep) holder.remove(child);
    holder.add(model);
    return size.y * k;
  }).catch(error => { console.warn('Vehicle model failed to load; keeping the placeholder.', name, error); return null; });
}

// --- The scenario ---------------------------------------------------------------------------------------------
// spec: { id, title, summary, plan, views, weatherLabel, fog, civilian, precip: 'snow'|'rain', roofY, floorY,
//   lines: { [guardId]: [...] }, hush, alertCall, clearCall, callsign, chatter: [...], text: {...},
//   build(kit, ctx) → { cutaway, lamps, interactions, update(clock, dt, state), act(name, guard), onAlert(on), radio } }
export function safehouse(spec) {
  return {
    id: spec.id, title: spec.title, summary: spec.summary,
    noPad: true, floorY: spec.floorY, lighting: 'night', ambientIntensity: spec.ambient ?? .8, keyIntensity: spec.key ?? .45,
    fog: spec.fog, models: spec.civilian ? ['xbot'] : [], modes: MODES,
    weatherLabel: spec.weatherLabel, defaultView: 'Inside', views: spec.views,
    create: ctx => run(spec, ctx),
  };
}

function run(spec, { group, soldier, character }) {
  const P = spec.plan, random = seeded(spec.seed || 17), kit = createBuilder(group), glowMap = glowTexture();
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  // Solid geometry: the plan's walls and furniture, plus pieces that move (door, hatch, bookcase).
  const fixed = planSolids(P), moving = {};
  let solids = fixed, rects = walkRects(fixed);
  const setSolid = (id, box = null) => { if (moving[id] === box) return; moving[id] = box; solids = [...fixed, ...Object.values(moving).filter(Boolean)]; rects = walkRects(solids); };
  let clock = 0, talk = null, audio = null, listener = { x: 0, z: 0, yaw: 0 }, firstPerson = true, disposed = false;
  const player = { x: 0, z: 0, active: false };
  const say = (speaker, text, seconds = 5.5) => { talk = { speaker, text, until: clock + seconds }; };
  const house = spec.build(kit, { random, group, setSolid, glowMap, say, get clock() { return clock; } });
  const sightClear = (a, b, y = 1.5) => {
    const from = v.set(a.x, y, a.z), dir = w.set(b.x - a.x, 0, b.z - a.z), distance = dir.length();
    return distance < .05 || firstObstruction(from, dir.normalize(), distance, solids) >= distance - .1;
  };

  // --- Guards ---------------------------------------------------------------------------------------------------
  const rifleGeometry = new THREE.BoxGeometry(.06, .09, .82), compactGeometry = new THREE.BoxGeometry(.055, .1, .46), gunMetal = kit.mat('#1c2123', .55, .5);
  const guards = P.guards.map((d, i) => {
    const c = spec.civilian
      ? character('xbot', { tint(m) { m.color.set(/Joints/i.test(m.name) ? (d.trim || '#29292b') : d.tint); m.roughness = .85; m.metalness = 0; } })
      : soldier();
    c.model.rotation.order = 'YXZ'; group.add(c.model);
    c.actions.Idle.time = random() * 2; c.actions.Walk.time = random() * 2;
    const weapon = new THREE.Mesh(spec.civilian ? compactGeometry : rifleGeometry, gunMetal); weapon.visible = false; group.add(weapon);
    const start = d.route ? d.route[0] : d, look = start.look;
    const g = { d, c, weapon, i, x: start.at[0], z: start.at[1], yaw: 0, speed: 0, crouch: 0, aim: 0, lie: d.bed ? 1 : 0,
      state: d.bed ? 'sleep' : 'duty', path: [], leg: 0, wait: (d.route ? start.wait : 0) + random() * 2, phase: random() * 6,
      reach: 0, reachFor: null, nextReach: 3 + random() * 5, listen: 0, hold: 0, line: 0, target: new THREE.Vector3() };
    if (look) g.yaw = facing(lookX(look) - g.x, lookZ(look) - g.z);
    return g;
  });
  const watcher = guards.find(g => g.d.duty === 'watch') || guards[0];
  const awake = g => g.lie < .5;
  // A sleeper's body runs from the feet (bed.x, bed.z) toward the head, along the bed's yaw.
  const bedSpot = g => { const b = g.d.bed; return { x: b.x + Math.sin(b.yaw) * .9, z: b.z + Math.cos(b.yaw) * .9 }; };
  const where = g => g.lie > .5 ? bedSpot(g) : g;
  const moveBody = (a, dx, dz) => walk(a, dx, dz, solids, P.bounds);
  const peers = g => [...guards.filter(o => o !== g && awake(o)), ...(player.active ? [player] : [])];
  function goTo(g, to, then, pace = 1.15) {
    g.path = planRoute([g.x, g.z], to, rects, .28);
    Object.assign(g, { state: 'walk', then, pace, goal: to, replan: 1 });
  }
  function rest(g) {
    const d = g.d;
    if (d.bed) goTo(g, d.at, () => { g.state = 'lying'; }, 1);
    else if (d.route) { const stop = d.route[g.leg]; goTo(g, stop.at, () => { g.state = 'duty'; g.wait = stop.wait; }, 1); }
    else goTo(g, d.at, () => { g.state = 'duty'; }, 1);
  }
  function toAlert(g) {
    const a = g.d.alert, go = () => goTo(g, a.at, () => { g.state = 'alert'; }, 2.5);
    if (g.lie > 0) { g.state = 'rise'; g.after = go; } else go();
  }

  function updateGuard(g, dt) {
    const d = g.d, c = g.c;
    let face = g.yaw, wantCrouch = 0, wantAim = 0, aimAt = null, holdReach = 0;
    g.listen = Math.max(0, g.listen - dt);
    c.actions.Idle.timeScale = g.state === 'sleep' ? .35 : 1; // asleep: slow breathing
    const spot = where(g), distance = Math.hypot(player.x - spot.x, player.z - spot.z);
    const sees = player.active && awake(g) && distance < 2.6 && sightClear(g, player);
    const watchPlayer = sees && (g.listen > 0 || distance < 1.6 || g.state === 'duty');
    if (g.state === 'walk') {
      if (g.hold > 0) { g.hold -= dt; g.speed = 0; face = facing(player.x - g.x, player.z - g.z); }
      else {
        // Two people meeting in a doorway both give way; after a while one squeezes past.
        if (g.blockedFor > 2.5) g.squeeze = 1.5;
        g.squeeze = Math.max(0, (g.squeeze || 0) - dt);
        const arrived = followRoute(g, dt, { speed: g.pace, move: moveBody, peers: g.squeeze > 0 ? [] : peers(g) });
        face = g.yaw;
        if (arrived || !g.path.length) { g.state = 'duty'; g.speed = 0; g.then?.(); }
        else if (g.blockedFor > 1.5 && (g.replan -= dt) <= 0) { g.path = planRoute([g.x, g.z], g.goal, rects, .28); g.replan = 1; }
      }
      if (pass) { wantCrouch = .15; wantAim = d.weapon === 'slung' || d.alert.unarmed ? 0 : .45; }
      else if (d.weapon === 'ready') wantAim = .22;
    } else if (g.state === 'alert') {
      const a = d.alert;
      face = facing(lookX(a.look) - g.x, lookZ(a.look) - g.z) + Math.sin(clock * .6 + g.phase) * .08;
      wantCrouch = a.crouch; wantAim = a.unarmed ? 0 : 1; aimAt = g.target.set(lookX(a.look), lookY(a.look, 1.1), lookZ(a.look));
      if (d.duty === 'radio') holdReach = .7; // hand on the set, ready to send
    } else if (g.state === 'rise' || g.state === 'lying') {
      g.lie = THREE.MathUtils.clamp(g.lie + (g.state === 'rise' ? -1.3 : 1.1) * dt, 0, 1);
      if (g.state === 'rise' && g.lie === 0) g.after();
      else if (g.state === 'lying' && g.lie === 1) g.state = 'sleep';
    } else if (g.state === 'duty') {
      // On duty: hold the post, look over it, now and then turn to someone talking.
      if (d.route) {
        const stop = d.route[g.leg];
        face = facing(lookX(stop.look) - g.x, lookZ(stop.look) - g.z) + Math.sin(clock * .5 + g.phase) * .3;
        if (g.listen <= 0 && (g.wait -= dt) <= 0) {
          g.leg = (g.leg + 1) % d.route.length;
          const next = d.route[g.leg];
          goTo(g, next.at, () => { g.state = 'duty'; g.wait = next.wait; if (next.act) { const hand = house.act?.(next.act, g); if (hand) { g.reachFor = hand; g.reach = g.reachTotal = 1.8; } } });
        }
      } else face = facing(lookX(d.look) - g.x, lookZ(d.look) - g.z) + Math.sin(clock * .33 + g.phase) * (d.scan || .15);
      if (d.duty === 'radio' && !watchPlayer && (g.nextReach -= dt) <= 0) { g.reachFor = d.hand; g.reach = g.reachTotal = 2.4; g.nextReach = 5 + random() * 6; }
      if (d.weapon === 'ready') wantAim = .28;
    }
    if (watchPlayer && g.state !== 'alert') { face = facing(player.x - g.x, player.z - g.z); wantAim = Math.min(wantAim, .15); g.reach = Math.min(g.reach, .2); }
    if (g.state !== 'walk' || g.hold > 0) g.yaw += angleDelta(g.yaw, face) * (1 - Math.exp(-dt * (g.state === 'alert' ? 6 : 3.5)));
    g.crouch = damp(g.crouch, wantCrouch, 6, dt);
    g.aim = damp(g.aim, wantAim, 7, dt);

    // Pose: standing, or lying on the bunk (and the turn between, pivoting at the feet).
    const s = g.lie * g.lie * (3 - 2 * g.lie);
    if (d.bed && s > 0) {
      const b = d.bed;
      c.model.position.set(g.x + (b.x - g.x) * s, (b.y + .13) * s, g.z + (b.z - g.z) * s);
      c.model.rotation.set(Math.PI / 2 * s, g.yaw + angleDelta(g.yaw, b.yaw) * s, 0);
    } else { c.model.position.set(g.x, 0, g.z); c.model.rotation.set(0, g.yaw, 0); }
    c.setSpeed(s > .05 ? 0 : g.speed); c.mixer.update(dt);
    if (s > .05) { g.weapon.visible = false; return; }
    crouch(c.model, g.crouch);
    if (g.aim > .02 && !aimAt) aimAt = g.target.set(g.x - Math.sin(g.yaw) * 4, .35, g.z - Math.cos(g.yaw) * 4); // low ready
    const hands = g.aim > .02 ? aimRifle(c.model, group.localToWorld(v.copy(aimAt)), g.aim) : null;
    g.weapon.visible = !!hands && g.aim > .25;
    if (hands) {
      group.worldToLocal(hands.right); group.worldToLocal(hands.left);
      g.weapon.position.copy(hands.right).lerp(hands.left, .45);
      g.weapon.lookAt(group.localToWorld(w.copy(hands.left).sub(hands.right).multiplyScalar(4).add(hands.left)));
    }
    // Reaching for something (the radio's dials, a chess piece): in, a moment there, back. Applied after the clip.
    if (holdReach) reachTo(g, d.hand, holdReach);
    else if (g.reach > 0 && g.reachFor) {
      g.reach = Math.max(0, g.reach - dt);
      reachTo(g, g.reachFor, Math.min(1, Math.sin((1 - g.reach / g.reachTotal) * Math.PI) * 1.8) * .85);
    }
  }
  // Right hand toward a point (two-bone IK after the idle clip), blended by `amount`.
  const reachTarget = new THREE.Vector3(), reachPole = new THREE.Vector3();
  function reachTo(g, [x, y, z], amount) {
    const m = g.c.model, arm = bone(m, 'RightArm'), fore = bone(m, 'RightForeArm'), hand = bone(m, 'RightHand');
    if (!arm || !fore || !hand || amount < .01) return;
    const aq = arm.quaternion.clone(), fq = fore.quaternion.clone();
    reachTarget.set(x + Math.sin(clock * 2.3 + g.phase) * .03, y + Math.sin(clock * 1.7) * .02, z);
    reachPole.set(g.x + Math.cos(g.yaw) * .5, .7, g.z - Math.sin(g.yaw) * .5);
    group.localToWorld(reachTarget); group.localToWorld(reachPole);
    solveTwoBone(arm, fore, hand, reachTarget, reachPole);
    arm.quaternion.slerpQuaternions(aq, arm.quaternion.clone(), amount); fore.quaternion.slerpQuaternions(fq, fore.quaternion.clone(), amount);
  }

  // --- Enemy patrol on the road ---------------------------------------------------------------------------------
  // Every minute or two a vehicle comes along the road, slows past the house and sweeps it with a roof light.
  // The watcher calls it, the lamps go out, everyone (the sleeper too) takes a window until it has gone.
  const road = P.road;
  const vehicle = new THREE.Group(); vehicle.visible = false; group.add(vehicle);
  {
    const body = kit.mat(spec.vehicleColor || '#353a33', .7, .2);
    kit.box(-1, .35, -road.length / 2, 1, 1.5, road.length / 2, body, vehicle); kit.box(-.9, 1.5, -1.2, .9, 2.05, 1, body, vehicle);
  }
  dressVehicle(vehicle, road.model, road.length, m => { m.color.multiply(new THREE.Color(spec.vehicleColor || '#5b6150')); m.roughness = .8; m.metalness = .1; })
    .then(height => { if (height) lamp.position.y = height + .15; });
  const headMaterial = new THREE.MeshBasicMaterial({ color: '#fff3d0' });
  for (const x of [-.62, .62]) { const h = kit.box(x - .16, .72, road.length / 2 - .02, x + .16, .86, road.length / 2 + .04, headMaterial, vehicle); h.userData.keep = true; }
  const beams = [-.62, .62].map(x => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#fff0c4', transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(1.6, 1.1, 1); s.position.set(x, .8, road.length / 2 + .3); s.userData.keep = true; vehicle.add(s); return s;
  });
  const lamp = new THREE.Group(); lamp.position.set(0, 2.15, .4); lamp.userData.keep = true; vehicle.add(lamp);
  kit.box(-.18, 0, -.18, .18, .22, .18, kit.mat('#202326', .5, .6), lamp).userData.keep = true;
  const roadLight = new THREE.PointLight('#ffe9c0', 0, 16, 1.3); roadLight.position.set(0, 1.2, road.length / 2 + 2.5); roadLight.userData.keep = true; vehicle.add(roadLight);
  // The searchlight stays in the scene at zero (no shader recompiles); no shadows, so it washes in through the walls
  // much as it would through the glass.
  const search = new THREE.SpotLight('#eef4ff', 0, 34, .2, .45, 1.1); group.add(search, search.target);
  let pass = null, nextPass = spec.firstPass ?? 40, passes = 0, lightsOut = 0;
  function startPass() {
    if (pass) return;
    const dir = passes++ % 2 ? -1 : 1;
    pass = { dir, x: dir > 0 ? road.from : road.to, speed: road.speed, phase: 'warning', t: 0, sweep: 0 };
    say(watcher.d.speaker, spec.alertCall, 4.5);
    for (const g of guards) toAlert(g);
    house.onAlert?.(true);
  }
  function endPass(quiet = false) {
    if (!pass) return;
    pass = null; nextPass = clock + 75 + random() * 35;
    if (!quiet) say(watcher.d.speaker, spec.clearCall, 4);
    for (const g of guards) rest(g);
    house.onAlert?.(false);
  }
  function updatePass(dt) {
    if (!pass) { if (clock >= nextPass) startPass(); return; }
    pass.t += dt;
    if (pass.phase === 'warning') { if (pass.t > 4.5) { pass.phase = 'road'; pass.t = 0; } }
    else if (pass.phase === 'road') {
      const near = pass.x > road.slow[0] && pass.x < road.slow[1];
      pass.speed = damp(pass.speed, near ? road.crawl : road.speed, 1.4, dt);
      pass.x += pass.dir * pass.speed * dt;
      if (near) pass.sweep += dt;
      if (pass.dir > 0 ? pass.x > road.to : pass.x < road.from) { pass.phase = 'gone'; pass.t = 0; }
    } else if (pass.t > 6) endPass();
  }
  function updateVehicle() {
    const on = !!pass && pass.phase === 'road';
    vehicle.visible = on;
    if (!on) { search.intensity = 0; roadLight.intensity = 0; return; }
    vehicle.position.set(pass.x, road.y, road.z); vehicle.rotation.y = pass.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    roadLight.intensity = 7;
    for (const b of beams) b.material.opacity = .45 + Math.sin(clock * 30 + b.position.x) * .04;
    // Sweep the facade while the vehicle is alongside: left and right across it, up and down over the windows.
    const sw = road.sweep, alongside = pass.x > sw.x[0] - 6 && pass.x < sw.x[1] + 6;
    const t = pass.sweep * 1.3, mid = (sw.x[0] + sw.x[1]) / 2, half = (sw.x[1] - sw.x[0]) / 2;
    search.intensity = damp(search.intensity, alongside ? 140 : 0, 4, 1 / 60);
    lamp.getWorldPosition(search.position); group.worldToLocal(search.position);
    search.target.position.set(mid + Math.sin(t) * half, sw.y[0] + (Math.sin(t * 1.9) * .5 + .5) * (sw.y[1] - sw.y[0]), sw.z);
    lamp.rotation.y = Math.atan2(search.target.position.x - search.position.x, search.target.position.z - search.position.z) - vehicle.rotation.y;
  }
  // Engine: a low rumble that grows as the vehicle comes closer (only with Sound on).
  let engine = null;
  function updateEngine() {
    if (!audio || disposed) { if (engine) engine.gain.gain.value = 0; return; }
    if (!engine || engine.context !== audio.context) {
      engine?.stop();
      const ctx = audio.context, osc = ctx.createOscillator(), rumble = ctx.createOscillator(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(), pan = ctx.createStereoPanner();
      osc.type = 'sawtooth'; osc.frequency.value = 46; rumble.type = 'triangle'; rumble.frequency.value = 23;
      filter.type = 'lowpass'; filter.frequency.value = 260; gain.gain.value = 0;
      osc.connect(filter); rumble.connect(filter); filter.connect(gain).connect(pan).connect(audio.output); osc.start(); rumble.start();
      engine = { context: ctx, osc, gain, pan, stop() { try { osc.stop(); rumble.stop(); } catch {} gain.disconnect(); } };
    }
    const x = pass ? (pass.phase === 'warning' ? (pass.dir > 0 ? road.from : road.to) : pass.x) : 0;
    const dx = x - listener.x, dz = road.z - listener.z, distance = Math.hypot(dx, dz) || 1;
    const loud = pass && pass.phase !== 'gone' ? Math.min(.22, 3.2 / (distance + 6)) * (pass.phase === 'warning' ? Math.min(1, pass.t / 3) : 1) : 0;
    engine.gain.gain.setTargetAtTime(loud, audio.context.currentTime, .3);
    engine.osc.frequency.setTargetAtTime(38 + (pass?.speed || 0) * 2.5, audio.context.currentTime, .4);
    engine.pan.pan.value = Math.max(-1, Math.min(1, (dx * -Math.cos(listener.yaw) + dz * Math.sin(listener.yaw)) / distance)) * .8;
  }
  // A burst of radio static under a transmission.
  function crackle() {
    if (!audio) return;
    const ctx = audio.context, n = ctx.createBufferSource(), buffer = ctx.createBuffer(1, ctx.sampleRate * .35, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .7; g.gain.value = .12;
    n.buffer = buffer; n.connect(f).connect(g).connect(audio.output); n.start();
  }

  // --- Weather ----------------------------------------------------------------------------------------------------
  // Snow drifts down as points, rain falls as streaks; none under a roof.
  const covered = (x, z, y) => y < (spec.roofY ?? 3) && P.covered.some(r => inRect(r, x, z));
  const precip = (() => {
    const rain = spec.precip === 'rain', count = rain ? 850 : 1000, span = 28, top = 11, bottom = spec.precipBottom ?? 0;
    const drops = Array.from({ length: count }, () => ({ x: (random() - .5) * span, y: bottom + random() * (top - bottom), z: (random() - .5) * span, v: rain ? 8 + random() * 3 : .7 + random() * .5, phase: random() * 6 }));
    const positions = new Float32Array(count * (rain ? 6 : 3)), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mesh = rain
      ? new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#8fa3b3', transparent: true, opacity: .3, depthWrite: false }))
      : new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#eef4f8', map: glowMap, size: .1, transparent: true, opacity: .9, depthWrite: false }));
    mesh.frustumCulled = false; group.add(mesh);
    return camera => {
      const cx = camera.position.x, cz = camera.position.z, dt = Math.min(.05, precip.dt || 0);
      drops.forEach((d, i) => {
        d.y -= d.v * dt; d.x -= (rain ? 1.1 : .35 + Math.sin(clock * .4 + d.phase) * .3) * dt;
        if (d.y < bottom) { d.y += top - bottom; d.x = (random() - .5) * span; d.z = (random() - .5) * span; }
        const x = cx + d.x, z = cz + d.z, hide = covered(x, z, d.y);
        if (rain) positions.set(hide ? [0, -50, 0, 0, -50, 0] : [x, d.y, z, x + .05, d.y + .34, z], i * 6);
        else positions.set(hide ? [0, -50, 0] : [x + Math.sin(clock + d.phase) * .15, d.y, z], i * 3);
      });
      geometry.attributes.position.needsUpdate = true;
    };
  })();

  // --- Talking, the radio ---------------------------------------------------------------------------------------
  function talkTo(g) {
    const d = g.d;
    if (pass && awake(g)) { say(d.speaker, spec.hush, 3.5); return; }
    const lines = spec.lines[d.id] || ['…'];
    say(d.speaker, lines[g.line++ % lines.length]);
    g.listen = 6; if (g.state === 'walk') g.hold = 3.5;
  }
  const list = names => names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names.at(-1) : names[0];
  // Radio check: Outpost 07 reads back the campaign as it stands on the command desk.
  function campaignReport() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('bunker-protectorate')); } catch {}
    try {
      if (!s?.settlements) throw new Error('no campaign');
      const f = military(s), named = status => s.settlements.filter(x => x.status === status).map(x => x.name);
      const attacked = named('under_attack'), occupied = named('occupied'), held = named('protected').length;
      return `${spec.callsign}, Outpost Seven. ${dateLabel(s.time)}. ${f.availableSoldiers.toLocaleString()} soldiers ready at the bunker, ${held} town${held === 1 ? '' : 's'} under our protection.`
        + (attacked.length ? ` ${list(attacked)} under attack.` : '') + (occupied.length ? ` ${list(occupied)} occupied.` : '') + ' Keep your heads down. Out.';
    } catch { return `${spec.callsign}, Outpost Seven. Command desk is dark tonight. Keep to schedule and stay off the air. Out.`; }
  }
  let chatterAt = 25, chatterLine = 0;
  function radioChatter() {
    const r = house.radio;
    if (!r || pass || clock < chatterAt || (talk && clock < talk.until)) return;
    chatterAt = clock + 38 + random() * 25;
    if (Math.hypot(player.x - r[0], player.z - r[1]) > 4.5 || !player.active) return;
    say('RADIO', spec.chatter[chatterLine++ % spec.chatter.length], 6); crackle();
  }

  return {
    setMode(next) { if (next === 'Patrol passing') startPass(); else if (next === 'Routine') endPass(true); },
    getDialogue: () => talk && clock < talk.until ? { speaker: talk.speaker, text: talk.text } : null,
    // You walk into guards as well as walls (a sleeper is on the bunk, which is solid already).
    move: (p, dx, dz) => walk(p, dx, dz, [...solids, ...guards.filter(awake).map(g => [g.x - .22, 0, g.z - .22, g.x + .22, 1.8, g.z + .22])], P.bounds),
    getStatus() {
      const up = guards.filter(awake).length;
      const detail = pass ? spec.text[pass.phase] : spec.text.routine;
      return {
        mode: pass ? 'Patrol passing' : 'Routine', title: spec.title, detail,
        stats: `${guards.length} guards · ${up} awake · ${pass ? 'lights out' : 'next road patrol in ~' + Math.max(0, Math.ceil(nextPass - clock)) + ' s'} · ${passes} patrol${passes === 1 ? '' : 's'} seen`,
      };
    },
    interaction(p) {
      if (!p) return null;
      const options = [];
      for (const g of guards) {
        // A sleeper is checked on from beside the bunk (the bunk itself blocks a line of sight to him).
        const s = where(g), distance = Math.hypot(p.x - s.x, p.z - s.z), from = g.lie > .5 ? { x: g.d.at[0], z: g.d.at[1] } : s;
        if (distance < 1.9 && sightClear(p, from)) options.push({ distance, label: g.lie > .5 ? `Check on ${g.d.name}` : `Talk to ${g.d.name}`, action: () => talkTo(g) });
      }
      for (const it of house.interactions || []) {
        const distance = Math.hypot(p.x - it.at[0], p.z - it.at[1]);
        if (distance < (it.r || 1.3)) { const label = it.label(); if (label) options.push({ distance: distance + (it.bias || 0), label, action: it.action }); }
      }
      const r = house.radio;
      if (r && Math.hypot(p.x - r[0], p.z - r[1]) < 1.6) options.push({ distance: Math.hypot(p.x - r[0], p.z - r[1]) + .3, label: 'Radio check with Outpost 07', action() { say('OUTPOST 07 · RADIO', campaignReport(), 9); crackle(); } });
      const best = options.sort((a, b) => a.distance - b.distance)[0];
      return best ? { label: best.label, action: best.action } : null;
    },
    update(dt, env = {}) {
      audio = env.audio || null;
      if (env.listener) listener = env.listener;
      player.x = listener.x; player.z = listener.z; player.active = firstPerson && !!env.listener;
      updateEngine();
      if (dt <= 0) return;
      clock += dt;
      updatePass(dt);
      lightsOut = damp(lightsOut, pass ? 1 : 0, pass ? 3 : 1, dt);
      for (const l of house.lamps || []) {
        l.light.intensity = (l.on + (l.out - l.on) * lightsOut) * (l.flicker?.(clock) ?? 1);
        if (l.bulb) l.bulb.color.copy(l.color).multiplyScalar(1 - lightsOut * (1 - l.out / l.on));
      }
      house.update?.(clock, dt, { lightsOut, pass });
      for (const g of guards) updateGuard(g, dt);
      updateVehicle();
      radioChatter();
    },
    beforeRender(camera, dt) {
      firstPerson = camera.position.y < 4;
      precip.dt = dt; precip(camera);
      for (const m of house.cutaway || []) m.visible = firstPerson;
    },
    dispose() { disposed = true; engine?.stop(); engine = null; },
  };
}
