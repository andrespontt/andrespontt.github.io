import * as THREE from 'three';
import { safehouse, dressVehicle } from '../safehouse.js';
import { HOLLOW_PINE as P, furniture } from '../safehouse-plans.js';

// Hollow Pine: Outpost 07's safe house in the pines south of Frostford, two kilometres past the North Crossing.
// A log farmhouse in a snowy clearing beside the Frostford road; four rangers in uniform, one of them asleep.
const F = id => furniture(P, id);

function build(kit, { random, group, setSolid, glowMap, say }) {
  const { mat, glow, box, worldBox, cylinder, tex, picture, floor, walls, windows } = kit;
  const cutaway = [];
  const hide = m => { cutaway.push(m); return m; };
  const snow = mat('#dfe7ec', 1), timber = mat('#4a3829'), darkTimber = mat('#33271d'), iron = mat('#2b2d2e', .5, .6), stone = mat('#7c7a73');
  const army = mat('#58624d'), canvas = mat('#6d6a52'), paperMat = c => new THREE.MeshStandardMaterial({ map: c, roughness: .95 });

  // --- Textures ---------------------------------------------------------------------------------------------
  // Logs a quarter metre high with pale chinking; a 1 m tile on world-aligned UVs.
  const logs = (base, dark, chink, knots) => tex(256, 256, g => {
    for (let i = 0; i < 4; i++) {
      const y = i * 64, grad = g.createLinearGradient(0, y, 0, y + 64);
      grad.addColorStop(0, dark); grad.addColorStop(.28, base); grad.addColorStop(.72, base); grad.addColorStop(1, dark);
      g.fillStyle = grad; g.fillRect(0, y, 256, 64);
      g.fillStyle = chink; g.fillRect(0, y + 60, 256, 4);
      for (let k = 0; k < 16; k++) { g.fillStyle = '#00000016'; g.fillRect((k * 53 + i * 29) % 256, y + 9 + (k * 7) % 44, 36 + (k % 3) * 22, 1.4); }
      g.fillStyle = knots; g.beginPath(); g.ellipse((i * 97 + 40) % 256, y + 30, 5, 3.5, 0, 0, Math.PI * 2); g.fill();
    }
  }, [1, 1]);
  const outside = new THREE.MeshStandardMaterial({ map: logs('#6a4d34', '#3b2a1c', '#a49c8a', '#2a1d13'), roughness: .95 });
  const inside = new THREE.MeshStandardMaterial({ map: logs('#9a7651', '#6c5038', '#c2b59a', '#5a3f2a'), roughness: .9 });
  const boards = tex(512, 512, g => {
    for (let r = 0; r < 10; r++) {
      g.fillStyle = ['#6e533b', '#654b35', '#76593f', '#5f4631'][r % 4]; g.fillRect(0, r * 51.2, 512, 50);
      g.fillStyle = '#2d2219'; g.fillRect(0, r * 51.2 + 50, 512, 1.5); g.fillRect((r * 137) % 512, r * 51.2, 2, 50);
      for (let k = 0; k < 8; k++) { g.fillStyle = '#ffffff08'; g.fillRect((k * 71 + r * 13) % 512, r * 51.2 + 8 + k * 5, 90, 1); }
    }
  }, [.5, .5]);
  const planks = new THREE.MeshStandardMaterial({ map: boards, roughness: .85 });
  const ceiling = new THREE.MeshStandardMaterial({ map: boards.clone(), color: '#a08670', roughness: .9 });
  // Paper: the Frostford road map on the table, and the sector map in the radio room.
  const sketch = (w, h, draw) => tex(w, h, g => { g.fillStyle = '#d6c9a3'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8f8467'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12); draw(g); });
  const tableMap = sketch(512, 320, g => {
    g.strokeStyle = '#47708a'; g.lineWidth = 9; g.beginPath(); g.moveTo(40, 0); g.bezierCurveTo(70, 120, 20, 200, 60, 320); g.stroke();
    g.strokeStyle = '#6a5233'; g.lineWidth = 5; g.setLineDash([12, 7]); g.beginPath(); g.moveTo(0, 230); g.lineTo(512, 205); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#2f2a22'; g.font = 'bold 22px monospace'; g.fillText('FROSTFORD ROAD', 190, 196); g.fillText('VEYR', 70, 60);
    g.font = '18px monospace'; g.fillText('N. CROSSING 2 KM', 70, 290); g.fillText('FROSTFORD 1 KM →', 330, 260);
    g.fillStyle = '#9b2a20'; g.font = 'bold 26px monospace'; g.fillText('✕', 250, 160); g.font = '16px monospace'; g.fillText('HOLLOW PINE', 220, 140);
    for (const [x, y] of [[120, 240], [300, 222], [430, 212]]) { g.fillStyle = '#9b2a20'; g.fillRect(x, y - 16, 4, 12); }
    g.fillStyle = '#3a3428'; g.font = '14px monospace'; g.fillText('0400 change · 2 trucks', 300, 40); g.fillText('0615 fuel bowser', 300, 62);
  });
  const sectorMap = sketch(768, 448, g => {
    g.fillStyle = '#c9bb92'; g.fillRect(40, 40, 688, 368);
    g.strokeStyle = '#3f6c87'; g.lineWidth = 14; g.beginPath(); g.moveTo(230, 40); g.bezierCurveTo(260, 160, 200, 260, 250, 408); g.stroke();
    g.strokeStyle = '#6a5233'; g.lineWidth = 4; for (const y of [110, 230, 350]) { g.beginPath(); g.moveTo(60, y); g.lineTo(700, y + 20); g.stroke(); }
    g.fillStyle = '#2f2a22'; g.font = 'bold 28px monospace'; g.fillText('VEYR · NORTH SECTOR', 300, 82);
    g.font = '20px monospace'; g.fillText('PROTECTORATE', 60, 395); g.fillText('FROSTFORD', 520, 150); g.fillText('DRAKENBURG →', 520, 380); g.fillText('N. CROSSING', 250, 104);
    for (const [x, y, c] of [[470, 175, '#2f7a4f'], [540, 128, '#a5281e'], [610, 240, '#a5281e'], [420, 300, '#a5281e'], [255, 116, '#d7a13a']]) { g.fillStyle = c; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#a5281e'; g.lineWidth = 2; g.beginPath(); g.moveTo(540, 128); g.lineTo(470, 175); g.lineTo(610, 240); g.stroke();
  });

  // --- Clearing, road and trees -------------------------------------------------------------------------------
  box(-70, -.05, -60, 70, 0, 70, mat('#c5d1d8', 1));
  box(-70, 0, 11.2, 70, .012, 13.8, mat('#98a1a6', 1));
  for (const z of [11.9, 12.75]) box(-70, .012, z, 70, .016, z + .35, mat('#7b848a', 1)); // ruts
  box(-2.75, 0, 5.8, -1.35, .01, 11.2, mat('#aab4b9', 1)); // trodden path to the road
  const mound = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(mound, snow), a = random() * Math.PI * 2, r = 9 + random() * 6, x = Math.cos(a) * r, z = Math.sin(a) * r * .7 - 2;
    if (z > 2 && Math.abs(x) < 9) continue; // keep the front yard and the path clear
    m.position.set(x, -.15, z); m.scale.set(1 + random() * 1.5, .35 + random() * .25, .8 + random()); group.add(m);
  }
  // Pines all round the clearing: five instanced meshes (trunk, three tiers, snow cap).
  const trees = [];
  for (let tries = 0; trees.length < 95 && tries < 3000; tries++) {
    const x = (random() - .5) * 84, z = -42 + random() * 84;
    if ((Math.abs(x) < 16.5 && z > -12 && z < 18.6) || (z > 9.5 && z < 16)) continue;
    trees.push({ x, z, s: .8 + random() * .75, r: random() * 6 });
  }
  const tiers = [
    [new THREE.CylinderGeometry(.16, .22, 1.3, 7), mat('#3a2a1e'), .65],
    [new THREE.ConeGeometry(1.6, 2.5, 8), mat('#1f3a2e'), 2.1],
    [new THREE.ConeGeometry(1.2, 2.1, 8), mat('#24412f'), 3.5],
    [new THREE.ConeGeometry(.82, 1.7, 8), mat('#2a4a36'), 4.7],
    [new THREE.ConeGeometry(.42, .72, 8), snow, 5.45],
  ];
  const place = new THREE.Object3D();
  for (const [geometry, material, y] of tiers) {
    const mesh = new THREE.InstancedMesh(geometry, material, trees.length);
    trees.forEach((t, i) => { place.position.set(t.x, y * t.s, t.z); place.rotation.set(0, t.r, 0); place.scale.setScalar(t.s); place.updateMatrix(); mesh.setMatrixAt(i, place.matrix); });
    mesh.computeBoundingSphere(); group.add(mesh);
  }
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#dfe9ff', transparent: true, opacity: .9, fog: false, depthWrite: false }));
  moon.scale.setScalar(9); moon.position.set(-34, 30, -48); group.add(moon);

  // Split-rail fence along the road, with the gap for the path.
  for (const [x0, x1] of [[-14, -3.1], [-.8, 14]]) {
    for (const y of [.45, .95]) { box(x0, y - .05, 10.35, x1, y + .05, 10.45, timber); box(x0, y + .05, 10.35, x1, y + .09, 10.45, snow); }
    for (let x = x0; x <= x1 + .01; x += Math.max(.5, (x1 - x0) / Math.round((x1 - x0) / 2.4))) cylinder(x, 0, 10.4, .07, 1.15, darkTimber);
  }
  // Woodpile against the east wall, a chopping stump, the outhouse and an old truck under snow.
  const logEnds = tex(512, 208, g => {
    g.fillStyle = '#2a1e15'; g.fillRect(0, 0, 512, 208);
    for (let y = 14; y < 208; y += 26) for (let x = 14 + (y / 26 % 2) * 12; x < 512; x += 26) {
      g.fillStyle = ['#b08c63', '#a07c55', '#bf9a6e'][(x + y) % 3]; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a5b3c'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.stroke();
    }
  });
  const pile = F('woodpile'), bark = mat('#4b3a2a');
  box(...pile, [new THREE.MeshStandardMaterial({ map: logEnds, roughness: 1 }), bark, snow, bark, bark, bark]);
  box(pile[0] - .05, pile[4], pile[2] - .1, pile[3] + .15, pile[4] + .4, pile[5] + .1, timber); // lean-to cover
  const stump = F('stump');
  cylinder((stump[0] + stump[3]) / 2, 0, (stump[2] + stump[5]) / 2, .27, .55, mat('#5a4430'));
  const axe = new THREE.Group(); axe.position.set(7.5, .55, 2.5); axe.rotation.set(.5, .6, 0); group.add(axe);
  box(-.025, 0, -.025, .025, .7, .025, mat('#8b6b48'), axe); box(-.03, .58, -.14, .03, .74, .06, iron, axe);
  const out = F('outhouse');
  box(...out, mat('#5b4634'));
  const roofSlab = box(out[0] - .15, out[4], out[2] - .15, out[3] + .15, out[4] + .12, out[5] + .25, snow); roofSlab.rotation.x = -.12;
  const outDoor = tex(128, 256, g => { g.fillStyle = '#4b3828'; g.fillRect(0, 0, 128, 256); g.fillStyle = '#3a2b1f'; for (let x = 0; x < 128; x += 32) g.fillRect(x, 0, 2, 256); g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(64, 52, 20, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4b3828'; g.beginPath(); g.arc(74, 46, 18, 0, Math.PI * 2); g.fill(); });
  picture(outDoor, .8, 1.9, (out[0] + out[3]) / 2, .97, out[5] + .01);
  const truck = new THREE.Group(), tb = F('truck'); truck.position.set((tb[0] + tb[3]) / 2, 0, (tb[2] + tb[5]) / 2); truck.rotation.y = .35; group.add(truck);
  box(-1, .4, -2.3, 1, 1.8, 2.3, mat('#5d5f58'), truck);
  dressVehicle(truck, 'truck', 4.9, m => { m.color.multiply(new THREE.Color('#9aa09c')); m.roughness = 1; m.metalness = 0; })
    .then(height => { if (height) box(-.85, height - .02, -2.1, .85, height + .1, .2, snow, truck); });

  // --- The house shell ----------------------------------------------------------------------------------------
  const [sx0, sz0, sx1, sz1] = P.shell;
  // Stone footing (not under the porch, where the deck meets the sill).
  for (const [x0, z0, x1, z1] of [[sx0 - .08, sz0 - .08, sx1 + .08, sz0], [sx0 - .08, sz1, -3.6, sz1 + .08], [-.4, sz1, sx1 + .08, sz1 + .08], [sx0 - .08, sz0, sx0, sz1], [sx1, sz0, sx1 + .08, sz1]]) box(x0, 0, z0, x1, .3, z1, stone);
  floor([-5.7, -4.2, 5.7, 4.2], [P.hatch], planks);
  box(-2.6, 0, 4.2, -1.5, .035, 4.5, darkTimber); // threshold
  walls(P, inside, outside);
  const trim = mat('#2f4a3a', .8), glass = new THREE.MeshStandardMaterial({ color: '#8aa3ad', transparent: true, opacity: .28, roughness: .1, metalness: .3, depthWrite: false, emissive: '#ffb25e', emissiveIntensity: .3 });
  windows(P, trim, glass);
  // Green shutters folded back beside every outside window.
  for (const w of P.walls) if (w.outside) for (const [a, b, sill, head] of w.openings) {
    if (sill <= 0) continue;
    const face = w.at + w.outside * (w.thick / 2 + .03);
    for (const [u0, u1] of [[a - .56, a - .06], [b + .06, b + .56]]) {
      if (w.axis === 'x') box(u0, sill, face - .02, u1, head, face + .02, trim); else box(face - .02, sill, u0, face + .02, head, u1, trim);
    }
  }
  // Ceiling boards and beams, and the snow-loaded gable roof (all hidden in the cutaway view).
  hide(worldBox(-5.7, 2.7, -4.2, 5.7, 2.78, 4.2, ceiling));
  for (const x of [-4, -1.5, 3.3]) hide(box(x - .1, 2.5, -4.2, x + .1, 2.7, 4.2, darkTimber));
  const pitch = Math.atan2(1.83, 4.95), slope = Math.hypot(1.83, 4.95);
  for (const side of [1, -1]) {
    const roof = new THREE.Mesh(kit.cube, [timber, timber, snow, timber, timber, timber]);
    roof.scale.set(12.9, .18, slope); roof.position.set(0, 3.535, side * 2.475); roof.rotation.x = side * pitch; group.add(hide(roof));
    const gable = new THREE.Shape([new THREE.Vector2(-4.5, 2.7), new THREE.Vector2(4.5, 2.7), new THREE.Vector2(0, 4.35)]);
    const end = new THREE.Mesh(new THREE.ShapeGeometry(gable), new THREE.MeshStandardMaterial({ map: outside.map, roughness: .95, side: THREE.DoubleSide }));
    end.rotation.y = Math.PI / 2; end.position.x = side * 5.99; group.add(hide(end));
  }
  hide(box(-6.45, 4.36, -.14, 6.45, 4.52, .14, snow));
  for (const z of [-4.96, 4.96]) { const icicles = new THREE.Group(); icicles.position.z = z; group.add(hide(icicles)); for (let x = -6.2; x < 6.3; x += .27 + random() * .3) { const c = new THREE.Mesh(new THREE.ConeGeometry(.025, .14 + random() * .22, 5), mat('#d8e8f0', .2, .1)); c.rotation.x = Math.PI; c.position.set(x, 2.52, 0); icicles.add(c); } }
  // Chimney with smoke drifting east; less of it once the fire is banked.
  const ch = F('chimney'); box(...ch, stone); box(ch[0] - .06, ch[4], ch[2] - .06, ch[3] + .06, ch[4] + .12, ch[5] + .06, darkTimber);
  const smokeMaterial = new THREE.SpriteMaterial({ map: glowMap, color: '#9aa6ad', transparent: true, opacity: .25, depthWrite: false });
  const smoke = Array.from({ length: 9 }, (_, i) => { const s = new THREE.Sprite(smokeMaterial); group.add(s); return { s, k: i / 9 }; });
  // Porch: deck, posts, a snowy roof and a step.
  box(-3.6, 0, 4.5, -.4, .14, 5.8, timber); for (let x = -3.5; x < -.4; x += .3) box(x, .14, 4.5, x + .012, .142, 5.8, darkTimber);
  box(...F('porchPostW'), darkTimber); box(...F('porchPostE'), darkTimber);
  hide(box(-3.85, 2.45, 4.5, -.15, 2.55, 6, timber)); hide(box(-3.85, 2.55, 4.5, -.15, 2.66, 6, snow));
  box(-2.6, 0, 5.8, -1.5, .07, 6.15, timber);

  // Front door: hinged at the west jamb, opens inward against the gun rack.
  const door = new THREE.Group(); door.position.set(P.door.hinge[0], 0, P.door.hinge[1]); group.add(door);
  const doorWood = mat('#5a3f2b');
  box(.02, .02, -.035, P.door.width - .02, 2.12, .035, doorWood, door);
  for (const y of [.35, 1.8]) box(.06, y, .035, P.door.width - .06, y + .12, .07, darkTimber, door);
  const brace = box(.1, .4, .035, P.door.width - .1, .5, .07, darkTimber, door); brace.position.y = 1.07; brace.rotation.z = .95; brace.scale.x = 1.55;
  box(P.door.width - .17, 1.02, .07, P.door.width - .1, 1.12, .12, iron, door); box(P.door.width - .17, 1.02, -.12, P.door.width - .1, 1.12, -.07, iron, door);
  let doorOpen = 0, doorWant = 0, doorCloseIn = 0;
  setSolid('door', P.door.closed);

  // --- Great room: hearth, table, kitchen -----------------------------------------------------------------------
  const he = F('hearth'), fieldstone = mat('#4f4b45'); // darker than the chimney outside: it sits right over the fire
  box(he[0], 0, he[2], he[3], 1.25, he[2] + .4, fieldstone); box(he[0], 0, he[5] - .4, he[3], 1.25, he[5], fieldstone); box(he[0], .95, he[2] + .4, he[3], 1.25, he[5] - .4, fieldstone);
  box(he[0], 0, he[2] + .4, he[0] + .1, .95, he[5] - .4, glow('#120c08'));
  box(he[3], 0, he[2] - .15, he[3] + .5, .08, he[5] + .15, fieldstone); // hearthstone
  box(he[0] - .08, 1.25, he[2] - .2, he[3] + .1, 1.35, he[5] + .2, timber); // mantel
  box(he[0], 1.35, he[2] + .2, he[0] + .45, 2.7, he[5] - .2, fieldstone); // chimney breast
  const kettle = cylinder(-5.0, .08, -1.55, .12, .32, iron); kettle.scale.z = .9;
  // Fire: two logs, three flames, a glow, and the light that throws the room's warmth.
  for (const [y, r] of [[.14, .35], [.22, -.4]]) { const l = cylinder(-5.4, -.07, -.75, .07, .07, bark); l.position.y = y; l.rotation.set(Math.PI / 2, 0, r); l.scale.y = 7; }
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffae55', transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [[-5.42, -.92, .55], [-5.38, -.7, .7], [-5.44, -.52, .5]].map(([x, z, h]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(.11, h, 7), flameMat); f.position.set(x, .2 + h / 2, z); group.add(f); return { f, h }; });
  const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#ff8a3c', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
  fireGlow.position.set(-5.3, .5, -.72); fireGlow.scale.setScalar(1.3); group.add(fireGlow);
  const fireLight = new THREE.PointLight('#ff9a4a', 9, 10, 1.5); fireLight.position.set(-4.95, .75, -.75); group.add(fireLight);
  let flare = 0;
  box(...F('logs'), [new THREE.MeshStandardMaterial({ map: logEnds, roughness: 1 }), bark, bark, bark, bark, bark]);
  // Snowshoes on the wall above the log basket.
  for (const z of [.62, 1.05]) { const s = new THREE.Mesh(new THREE.TorusGeometry(.17, .016, 6, 18), mat('#7b5a3a')); s.scale.set(1, 1.9, 1); s.position.set(-5.66, 1.75, z); s.rotation.y = Math.PI / 2; group.add(s); }

  const tb2 = F('table');
  box(tb2[0], .72, tb2[2], tb2[3], .8, tb2[5], timber);
  for (const [x, z] of [[tb2[0] + .1, tb2[2] + .1], [tb2[3] - .1, tb2[2] + .1], [tb2[0] + .1, tb2[5] - .1], [tb2[3] - .1, tb2[5] - .1]]) box(x - .05, 0, z - .05, x + .05, .72, z + .05, darkTimber);
  for (const id of ['benchN', 'benchS']) { const b = F(id); box(b[0], .38, b[2], b[3], .45, b[5], timber); for (const x of [b[0] + .15, b[3] - .2]) box(x, 0, b[2] + .04, x + .06, .38, b[5] - .04, darkTimber); }
  const map = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .94), paperMat(tableMap)); map.rotation.set(-Math.PI / 2, 0, .06); map.position.set(-2.7, .805, -1.3); group.add(map);
  for (const [x, z] of [[-1.85, -.85], [-3.4, -1.75], [-1.75, -1.7]]) cylinder(x, .8, z, .045, .9, mat('#7a8b84', .6));
  const binoculars = new THREE.Group(); binoculars.position.set(-3.3, .84, -.85); binoculars.rotation.y = .4; group.add(binoculars);
  for (const x of [-.045, .045]) { const b = cylinder(x, 0, 0, .03, .14, mat('#1f2426', .5, .4), binoculars); b.rotation.x = Math.PI / 2; b.position.y = 0; }
  // Lantern on the table: the room's second light.
  box(-2.12, .8, -1.12, -1.96, .84, -.96, iron);
  const lanternGlass = new THREE.MeshBasicMaterial({ color: '#ffd28a' });
  box(-2.1, .84, -1.1, -1.98, 1.04, -.98, lanternGlass); box(-2.13, 1.04, -1.13, -1.95, 1.08, -.95, iron);
  const lantern = new THREE.PointLight('#ffc477', 4.5, 8, 1.6); lantern.position.set(-2.04, 1.15, -1.04); group.add(lantern);

  const ct = F('counter');
  box(ct[0], 0, ct[2], ct[3], .86, ct[5], mat('#5b4532')); box(ct[0] - .03, .86, ct[2], ct[3] + .03, .92, ct[5] + .04, timber);
  box(-4.6, .92, -4.1, -3.9, 1.02, -3.75, mat('#6f7a7c', .4, .5)); // tin basin
  box(ct[0], 1.55, -4.2, ct[3], 1.59, -3.95, timber); // shelf
  for (let i = 0; i < 9; i++) { const x = -5.45 + i * .44; cylinder(x, 1.59, -4.07, .06, 1.59 + .12 + (i % 3) * .05, mat(['#b8a47a', '#8a5e3c', '#c9c2b0'][i % 3], .6)); }
  const pan = cylinder(-2.1, 1.25, -4.12, .16, 1.28, iron); pan.rotation.x = Math.PI / 2;
  // A calendar with the days crossed off.
  picture(tex(128, 160, g => { g.fillStyle = '#e6dfcc'; g.fillRect(0, 0, 128, 160); g.fillStyle = '#7a2a20'; g.fillRect(0, 0, 128, 30); g.fillStyle = '#efe4c9'; g.font = 'bold 16px monospace'; g.fillText('DECEMBER', 22, 21); g.strokeStyle = '#3a3a3a'; for (let i = 0; i < 28; i++) { const x = 8 + (i % 7) * 16, y = 40 + Math.floor(i / 7) * 28; g.strokeRect(x, y, 14, 24); if (i < 19) { g.strokeStyle = '#9b2a20'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y + 24); g.moveTo(x + 14, y); g.lineTo(x, y + 24); g.stroke(); g.strokeStyle = '#3a3a3a'; } } }), .45, .56, -.8, 1.65, -4.19);
  const ac = F('armchair'), cloth = mat('#5f3f35');
  box(ac[0], .1, ac[2], ac[3], .45, ac[5], cloth); box(ac[0], .45, ac[2], ac[0] + .18, .95, ac[5], cloth);
  for (const z of [ac[2], ac[5] - .15]) box(ac[0], .45, z, ac[3], .7, z + .15, cloth);
  box(-4.4, .022, .6, -1.2, .028, 3.1, mat('#6b3a2f')); // rug
  const rk = F('rack');
  box(rk[0], 0, rk[5] - .08, rk[3], rk[4], rk[5], timber); box(rk[0], .35, rk[2], rk[3], .42, rk[5], timber);
  for (let i = 0; i < 3; i++) { const r = box(rk[0] + .1 + i * .2, .42, rk[2] + .12, rk[0] + .15 + i * .2, 1.5, rk[2] + .2, iron); r.rotation.x = -.08; }

  // --- Bunk room: Lund asleep on the lower bunk -----------------------------------------------------------------
  const bk = F('bunk');
  for (const x of [bk[0], bk[3] - .08]) for (const z of [bk[2], bk[5] - .08]) box(x, 0, z, x + .08, bk[4], z + .08, darkTimber);
  for (const y of [.32, 1.32]) { box(bk[0], y - .08, bk[2], bk[3], y, bk[5], timber); box(bk[0] + .05, y, bk[2] + .05, bk[3] - .05, y + .13, bk[5] - .05, army); }
  box(5.25, .45, -4.1, 5.62, .55, -3.4, mat('#d2cfc4')); // pillow
  box(3.95, .45, -4.05, 4.95, .6, -3.45, mat('#6b4a3a')); // blanket over his legs
  const bag = cylinder(4.9, 0, -3.75, .16, .75, mat('#4e5644')); bag.rotation.z = Math.PI / 2; bag.position.y = 1.61; // rolled sleeping bag
  for (let i = 0; i < 4; i++) box(bk[0] - .02, .5 + i * .3, bk[5] - .06, bk[0] + .02, .54 + i * .3, bk[5] + .08, darkTimber); // ladder rungs
  const cot = F('cot');
  for (const x of [cot[0], cot[3] - .05]) box(x, 0, cot[2], x + .05, cot[4] - .05, cot[5], iron);
  box(cot[0], cot[4] - .08, cot[2], cot[3], cot[4], cot[5], canvas);
  const roll = cylinder(cot[0] + .5, 0, (cot[2] + cot[5]) / 2, .14, .6, mat('#3d4a3a')); roll.rotation.x = Math.PI / 2; roll.position.y = cot[4] + .13;
  box(...F('locker'), army);
  for (const x of [4.36, 4.52]) box(x, 0, -3.15, x + .12, .18, -2.92, mat('#1f1c19')); // boots
  box(5.55, 1, -1.5, 5.69, 1.75, -1.05, mat('#59614f')); // parka on a hook

  // --- Radio room ----------------------------------------------------------------------------------------------
  const rd = F('radioDesk');
  box(rd[0], .74, rd[2], rd[3], .8, rd[5], timber); for (const z of [rd[2] + .05, rd[5] - .1]) box(rd[0] + .05, 0, z, rd[0] + .12, .74, z + .05, darkTimber);
  box(5.2, .8, .45, 5.66, 1.18, 1.35, mat('#3b4a3a', .6, .3));
  const dial = new THREE.MeshBasicMaterial({ color: '#ffbf5a' });
  for (const z of [.6, .85, 1.1]) box(5.19, 1.0, z - .06, 5.2, 1.1, z + .06, dial);
  for (const z of [.55, .75, .95, 1.15, 1.25]) { const knob = cylinder(5.18, 0, z, .022, .04, iron); knob.rotation.z = Math.PI / 2; knob.position.y = .9; }
  box(5.02, .8, 1.2, 5.12, .83, 1.36, iron); // morse key
  box(5.05, .8, .5, 5.15, .82, .8, mat('#c9c0a6')); // log book
  const shade = cylinder(5.3, 1.32, .4, .1, 1.42, mat('#2f5a3a', .6)); shade.scale.y = 1;
  cylinder(5.3, .8, .4, .015, 1.32, iron);
  const lampBulb = new THREE.MeshBasicMaterial({ color: '#e8ffd0' }); box(5.27, 1.29, .37, 5.33, 1.32, .43, lampBulb);
  const deskLamp = new THREE.PointLight('#d8ffc0', 2.6, 6, 1.7); deskLamp.position.set(5.2, 1.2, .5); group.add(deskLamp);
  picture(sectorMap, 2.6, 1.5, 2.9, 1.6, .085);
  const cr = F('crates');
  box(cr[0], 0, cr[2], cr[3], .5, cr[5], army); box(cr[0] + .05, .5, cr[2] + .1, cr[3] - .05, cr[4], cr[5] - .1, mat('#6b5f45'));
  // The cellar under the hatch: spare radio, batteries, the codebook tin.
  const [hx0, hz0, hx1, hz1] = P.hatch, earth = mat('#3a3128');
  box(hx0 - .05, -2.3, hz0 - .05, hx1 + .05, 0, hz0, earth); box(hx0 - .05, -2.3, hz1, hx1 + .05, 0, hz1 + .05, earth);
  box(hx0 - .05, -2.3, hz0, hx0, 0, hz1, earth); box(hx1, -2.3, hz0, hx1 + .05, 0, hz1, earth); box(hx0, -2.35, hz0, hx1, -2.3, hz1, earth);
  for (const x of [hx0 + .25, hx1 - .25]) box(x - .025, -2.3, hz0 + .02, x + .025, 0, hz0 + .07, timber);
  for (let y = -2.1; y < 0; y += .32) box(hx0 + .25, y, hz0 + .03, hx1 - .25, y + .04, hz0 + .07, timber);
  box(hx0 + .1, -2.3, hz1 - .5, hx0 + .55, -1.9, hz1 - .05, army); box(hx1 - .4, -2.3, hz1 - .4, hx1 - .05, -2.05, hz1 - .05, mat('#6f6a5a'));
  box(hx1 - .3, -2.05, hz1 - .32, hx1 - .12, -2.0, hz1 - .14, glow('#ffcf7a'));
  const hatch = new THREE.Group(); hatch.position.set(hx0, .02, (hz0 + hz1) / 2); group.add(hatch);
  box(0, -.03, -(hz1 - hz0) / 2, hx1 - hx0, .025, (hz1 - hz0) / 2, mat('#6a5038'), hatch);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.05, .01, 6, 12), iron); ring.rotation.x = Math.PI / 2; ring.position.set(hx1 - hx0 - .12, .03, 0); hatch.add(ring);
  let hatchOpen = 0, hatchWant = 0;
  const hatchBox = [hx0, 0, hz0, hx1, .9, hz1]; // open: keeps you out of the hole

  const fireBase = 9;
  return {
    cutaway,
    radio: [4.8, 1.8], // the end of the desk, beside Dahl rather than where she stands
    lamps: [
      { light: fireLight, on: fireBase, out: 3.2, flicker: t => (1 + Math.sin(t * 13) * .08 + Math.sin(t * 7.3) * .06) * (1 + flare * .9) },
      { light: lantern, on: 4.5, out: 0, bulb: lanternGlass, color: new THREE.Color('#ffd28a') },
      { light: deskLamp, on: 2.6, out: .2, bulb: lampBulb, color: new THREE.Color('#e8ffd0') },
    ],
    interactions: [
      { at: [-2.05, 4.35], r: 1.5, label: () => doorWant ? 'Close the front door' : 'Open the front door', action() { doorWant = doorWant ? 0 : 1; } },
      { at: [-4.6, -.75], r: 1.25, label: () => 'Put a log on the fire', action() { flare = 1; say('PVT MOSS', 'Small fire, remember. Dry birch, and not much of it.', 4); } },
      { at: [(hx0 + hx1) / 2, (hz0 + hz1) / 2], r: 1.25, label: () => hatchWant ? 'Close the cellar hatch' : 'Open the cellar hatch', action() { hatchWant = hatchWant ? 0 : 1; if (hatchWant) say('CELLAR', 'Spare radio set, two days of batteries and the codebook in a biscuit tin.', 4.5); } },
    ],
    // Moss pulls the front door shut when the patrol comes.
    onAlert(on) { if (on && doorWant) doorCloseIn = 1.4; },
    update(t, dt, { lightsOut }) {
      flare = Math.max(0, flare - dt * .3);
      const fire = (1 - lightsOut * .55) * (1 + flare * .5);
      for (const [i, { f, h }] of flames.entries()) { f.scale.set(1, fire * (1 + Math.sin(t * 11 + i * 2) * .18), 1); f.position.y = .2 + h * f.scale.y / 2; }
      fireGlow.material.opacity = .5 * fire + Math.sin(t * 9) * .05;
      glass.emissiveIntensity = .3 * (1 - lightsOut);
      smokeMaterial.opacity = .22 * fire;
      for (const p of smoke) { const k = (p.k + t * .07) % 1; p.s.position.set(-6.3 + k * 2.6 + Math.sin(t * .5 + p.k * 9) * .25, 5.2 + k * 3.6, -.6 + Math.sin(p.k * 13) * .3); p.s.scale.setScalar(.5 + k * 1.8); }
      if (doorCloseIn > 0 && (doorCloseIn -= dt) <= 0) doorWant = 0;
      doorOpen = THREE.MathUtils.damp(doorOpen, doorWant, 5, dt); door.rotation.y = doorOpen * Math.PI / 2;
      setSolid('door', doorOpen > .5 ? P.door.open : P.door.closed);
      hatchOpen = THREE.MathUtils.damp(hatchOpen, hatchWant, 5, dt); hatch.rotation.z = hatchOpen * 1.78;
      setSolid('hatch', hatchOpen > .2 ? hatchBox : null);
    },
  };
}

export default safehouse({
  id: 'safehouse-pine',
  title: 'Hollow Pine safe house',
  summary: 'Outpost 07 rangers in a log farmhouse behind enemy lines near Frostford. Talk to the guards, check the radio, and go dark when a patrol drives by.',
  plan: P, build, seed: 23,
  weatherLabel: 'Snow · −18 °C',
  fog: ['#1a2731', 16, 58],
  ambient: .95, key: .55,
  precip: 'snow', roofY: 4.6,
  vehicleColor: '#9aa58e',
  firstPass: 45,
  views: [
    { label: 'Inside', x: -.4, z: 1.6, yaw: -2.2, pitch: -.12, eye: 1.7 },
    { label: 'Yard', x: 5.5, z: 8.6, yaw: -2.57, pitch: -.04, eye: 1.7 },
    // On the far verge of the road: where a patrol passes between you and the house.
    { label: 'Across the road', x: -3, z: 16.8, yaw: 2.96, pitch: .02, eye: 1.7 },
    { label: 'Cutaway', x: 0, z: 12.5, yaw: Math.PI, pitch: -.98, eye: 16 },
  ],
  callsign: 'Hollow Pine',
  alertCall: 'Headlights on the Frostford road. Lights out, take your windows.',
  clearCall: 'They\'re past. Lights back on, low. Back to it.',
  hush: 'Not now. Down, and not a sound.',
  text: {
    routine: 'Four rangers behind the Veyr. Halvorsen logs the Frostford road, Dahl keeps the radio schedule, Moss walks the rounds, Lund is off watch.',
    warning: 'Engine on the Frostford road. Lights out, everyone to a window.',
    road: 'Enemy patrol on the road, searchlight on the house. Nobody moves.',
    gone: 'The patrol has passed. Waiting for the road to go quiet.',
  },
  lines: {
    halvorsen: [
      'Road\'s been quiet since the snow started. Quiet makes me nervous.',
      'Frostford changes its guard at four. Their trucks come past here first, so we count them.',
      'Stay back from the glass. They look for faces, not for lights.',
      'Two kilometres to the North Crossing. With the river frozen, I\'d rather walk it than drive it.',
    ],
    dahl: [
      'Outpost Seven hears us five by five. I keep every transmission under twenty seconds. Longer, and they find us.',
      'Every truck into Frostford goes in my log. Command uses it to time the raids.',
      'The cellar has the spare set, two days of batteries and the codebook. If anyone comes up the drive, the codebook burns first.',
    ],
    moss: [
      'Dry birch only, and a small fire. Smoke shows against the snow.',
      'Twenty-two steps from the front door to the hatch. I count them every round.',
      'Lund sleeps through anything except the word "coffee".',
    ],
    lund: ['Mm… wake me if they come up the drive.', '…two more hours…', 'Is it my watch? It\'s not my watch.'],
  },
  chatter: [
    '…Kestrel Falls cordon reports quiet. Next schedule on the hour…',
    '…Relay Zero Three, battery low, going dark until morning…',
    '…North Crossing patrol: the ice is holding. Out.',
    '…Tinker\'s Loft reports the rail yard empty tonight…',
  ],
});
