import * as THREE from 'three';
import { safehouse, dressVehicle } from '../safehouse.js';
import { TINKERS_LOFT as P, furniture } from '../safehouse-plans.js';

// Tinker's Loft: Outpost 07's cell in Drakenburg, the enemy capital. A flat above a shuttered clock shop in the
// Riverside district, across the street from a militia bar; a hidden radio room behind a sliding bookcase and a
// flat roof out the back with the pigeons. Four operatives in plain clothes, weapons out of sight.
const F = id => furniture(P, id);
const STREET = P.street;

function build(kit, { random, group, setSolid, glowMap, say }) {
  const { mat, glow, box, worldBox, cylinder, tex, picture, floor, walls, windows } = kit;
  const cutaway = [], hide = m => { cutaway.push(m); return m; };
  const walnut = mat('#3f2a1e', .7), dark = mat('#1f2224', .6, .3), brass = mat('#b08a4a', .4, .6), iron = mat('#2a2c2e', .5, .6);

  // --- Textures ---------------------------------------------------------------------------------------------
  const brickTexture = (base, mortar) => tex(256, 256, g => {
    g.fillStyle = mortar; g.fillRect(0, 0, 256, 256);
    const rows = 13, h = 256 / rows;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) {
      g.fillStyle = base[(r * 3 + c * 7 + 99) % base.length];
      g.fillRect(c * 64 + (r % 2) * 32 + 2, r * h + 1.5, 60, h - 3);
    }
    for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? '#ffffff0a' : '#0000001a'; g.fillRect((i * 67) % 256, (i * 41) % 256, 3 + i % 5, 2); }
  }, [1, 1]);
  const brick = new THREE.MeshStandardMaterial({ map: brickTexture(['#6b3a2c', '#7a4434', '#5e3326', '#70402f'], '#8e857a'), roughness: .75 });
  const wallpaper = new THREE.MeshStandardMaterial({ map: tex(128, 128, g => {
    g.fillStyle = '#6d7a62'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#7d8a70'; g.fillRect(0, 0, 18, 128); g.fillRect(64, 0, 18, 128);
    g.fillStyle = '#5b674f'; for (const [x, y] of [[41, 20], [105, 84], [41, 84], [105, 20]]) { g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 8, y); g.lineTo(x, y + 12); g.lineTo(x - 8, y); g.fill(); }
    g.fillStyle = '#00000012'; g.fillRect(0, 100, 128, 28); // water stain low on the wall
  }, [2, 2]), roughness: .95 });
  const boards = tex(512, 512, g => {
    for (let r = 0; r < 12; r++) {
      g.fillStyle = ['#4a3426', '#43301f', '#523a29', '#3d2b1e'][r % 4]; g.fillRect(0, r * 42.7, 512, 41);
      g.fillStyle = '#1e150e'; g.fillRect(0, r * 42.7 + 41, 512, 1.7); g.fillRect((r * 173) % 512, r * 42.7, 2, 41);
      for (let k = 0; k < 7; k++) { g.fillStyle = '#ffffff07'; g.fillRect((k * 89 + r * 17) % 512, r * 42.7 + 6 + k * 4, 110, 1); }
    }
  }, [.5, .5]);
  // Windows across the street: a few lit, most dark at this hour.
  const facade = (cols, rows, base, lit) => tex(256, 256, g => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    const w = 256 / cols, h = 256 / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.fillStyle = random() < lit ? (random() < .6 ? '#e8c27a' : '#b9c9d6') : '#12171b';
      g.fillRect(x * w + w * .22, y * h + h * .2, w * .56, h * .58);
      g.fillStyle = '#00000045'; g.fillRect(x * w + w * .16, y * h + h * .78, w * .68, h * .06);
    }
  });
  const sign = (text, w, h, { bg = '#1d2a2b', fg = '#e7d2a0', font = 'bold 64px Georgia' } = {}) => tex(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4, w - 40);
  });

  // --- The street below --------------------------------------------------------------------------------------
  const S = STREET;
  box(-60, S - .2, 4.5, 60, S, 14, new THREE.MeshStandardMaterial({ color: '#1c2023', roughness: .32, metalness: .25 })); // wet asphalt
  for (const [z0, z1] of [[4.5, 6.5], [12.5, 14]]) { box(-60, S, z0, 60, S + .15, z1, mat('#3c4144', .6)); box(-60, S + .15, z0 === 4.5 ? z1 - .12 : z0, 60, S + .16, z0 === 4.5 ? z1 : z0 + .12, mat('#5a5f60', .7)); }
  for (let x = -58; x < 60; x += 5) box(x, S, 9.42, x + 2.4, S + .005, 9.58, glow('#9c9886'));
  for (const [x, z, s] of [[-5, 8.2, 1.4], [7, 10.7, 1], [16, 7.8, 1.8]]) { const p = new THREE.Mesh(new THREE.CircleGeometry(s, 16), new THREE.MeshStandardMaterial({ color: '#0d1114', roughness: .02, metalness: .6 })); p.rotation.x = -Math.PI / 2; p.position.set(x, S + .007, z); p.scale.y = .6; group.add(p); }
  // Our building below the loft: brick, the shuttered shop, its sign and the bracket clock over the pavement.
  for (const b of [[-6.5, S, 4.2, 6.5, 0, 4.5], [-6.5, S, -4.5, 6.5, 0, -4.2], [-6.5, S, -4.2, -6.2, 0, 4.2], [6.2, S, -4.2, 6.5, 0, 4.2]]) worldBox(...b, brick);
  const shutter = tex(256, 256, g => { g.fillStyle = '#5c6264'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 8) { g.fillStyle = '#474c4e'; g.fillRect(0, y, 256, 3); } g.fillStyle = '#b8b2a020'; g.font = 'bold 40px monospace'; g.fillText('CLOSED', 50, 140); });
  picture(shutter, 6, 2.8, 0, S + 1.4, 4.52);
  picture(sign('J. VOSS · CLOCKS & REPAIRS', 1024, 128), 6.4, .8, 0, S + 3.25, 4.52);
  picture(sign('', 128, 256, { bg: '#2a1f18' }), .9, 2.1, -5.6, S + 1.05, 4.52); // street door to the stairs
  const bracket = new THREE.Group(); bracket.position.set(4.6, S + 3.4, 4.5); group.add(bracket);
  box(-.03, -.03, 0, .03, .03, .9, iron, bracket); box(-.03, -.5, .85, .03, 0, .9, iron, bracket);
  const streetClock = cylinder(0, 0, 0, .32, .1, mat('#e6dcc2', .5), bracket, 24); streetClock.rotation.z = Math.PI / 2; streetClock.position.set(0, -.75, .88);
  // Across the street: three buildings, the militia bar with its neon, a TV flickering upstairs.
  for (const [x0, x1, top, base] of [[-40, -8, 8, '#4d4740'], [-8, 9, 6.2, '#3f4448'], [9, 40, 9.5, '#504338']]) {
    const front = new THREE.MeshStandardMaterial({ map: facade(Math.round((x1 - x0) / 2.6), Math.round((top - S) / 3), base, .22), roughness: .9 });
    const side = mat('#25292c'); const b = new THREE.Mesh(kit.cube, [side, side, side, side, side, front]);
    b.scale.set(x1 - x0, top - S, 10); b.position.set((x0 + x1) / 2, (top + S) / 2, 19); group.add(b);
  }
  const neonTexture = tex(512, 160, g => { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 160); g.shadowColor = '#ff4fa3'; g.shadowBlur = 24; g.strokeStyle = '#ff79c0'; g.lineWidth = 9; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.strokeText('NOX', 256, 118); g.strokeText('NOX', 256, 118); });
  const neonMaterial = new THREE.MeshBasicMaterial({ map: neonTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(3, .94), neonMaterial); neon.position.set(-3, S + 3.1, 13.95); neon.rotation.y = Math.PI; group.add(neon);
  const neonLight = new THREE.PointLight('#ff4fa3', 6, 16, 1.5); neonLight.position.set(-3, S + 2.8, 12.8); group.add(neonLight);
  box(-5.5, S, 13.92, -.5, S + 2.4, 13.96, glow('#3a2a20')); // the bar's lit window, curtained
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(1, .7), new THREE.MeshBasicMaterial({ color: '#6c8fb8' })); tv.position.set(14.3, 1.8, 13.98); tv.rotation.y = Math.PI; group.add(tv);
  // Street lamps; one lights the pavement under our windows.
  for (const [x, z] of [[-9, 6.1], [10, 12.9]]) { cylinder(x, S, z, .07, S + 4.6, iron); box(x - .3, S + 4.5, z - .2, x + .3, S + 4.65, z + .2, glow('#ffd9a0')); }
  const streetLamp = new THREE.PointLight('#ffcf8a', 12, 15, 1.4); streetLamp.position.set(-9, S + 4.2, 6.6); group.add(streetLamp);
  // Neighbouring buildings either side (taller than ours) and lower rooftops behind, then the rail yard.
  for (const [x0, x1, top] of [[-24, -6.5, 3.7], [6.5, 24, 5.4]]) {
    const front = new THREE.MeshStandardMaterial({ map: facade(Math.round((x1 - x0) / 2.6), Math.round((top - S) / 3), '#4a4038', .15), roughness: .9 });
    const side = mat('#2b2f31'); const b = new THREE.Mesh(kit.cube, [side, side, mat('#2e3134'), side, front, side]);
    b.scale.set(x1 - x0, top - S, 16.5); b.position.set((x0 + x1) / 2, (top + S) / 2, -3.75); group.add(b);
  }
  box(-24, S, -32, 24, -1.3, -12, mat('#2a2d30'));
  box(-6.5, S, -12, 6.5, -1.3, -4.5, mat('#2a2d30')); // lower roofs round the terrace
  worldBox(-3.4, -1.3, -9.6, 3.8, -.1, -4.5, brick); // the back extension the terrace sits on
  for (const [x, z] of [[-14, -16], [-4, -22], [9, -18], [17, -26]]) box(x - .4, -1.3, z - .4, x + .4, .2, z + .4, mat('#3a3330'));
  for (let i = 0; i < 6; i++) box(-22 + i * 7.5, S, -36, -16 + i * 7.5, S + 2.4, -34.4, mat(['#4b3b30', '#3b4446', '#55463a'][i % 3]));
  const flood = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, color: '#ffe8b8', transparent: true, opacity: .85, depthWrite: false })); flood.scale.setScalar(3.2); flood.position.set(4, 5, -38); group.add(flood);
  cylinder(4, S, -38.4, .1, 4.6, iron);
  // Cold glow off the low cloud over the rail yard: the only light on the roof at night.
  const skyGlow = new THREE.PointLight('#9fb4d0', 10, 40, 1); skyGlow.position.set(0, 9, -17); group.add(skyGlow);

  // --- The loft shell -----------------------------------------------------------------------------------------
  floor([-6.2, -4.2, 6.2, 4.2], [P.stairwell], new THREE.MeshStandardMaterial({ map: boards, roughness: .55 }));
  walls(P, wallpaper, brick);
  const frame = mat('#2c2b29', .6), glassMat = new THREE.MeshStandardMaterial({ color: '#7d93a0', transparent: true, opacity: .22, roughness: .05, metalness: .5, depthWrite: false });
  windows(P, frame, glassMat);
  for (const w of P.walls) for (const [a, b, sill] of w.openings || []) if (!sill && w.axis === 'x') box(a, 0, w.at - (w.thick || .2) / 2, b, .02, w.at + (w.thick || .2) / 2, walnut); // thresholds
  hide(box(-6.2, 2.8, -4.2, 6.2, 2.88, 4.2, mat('#b9b2a2')));
  hide(box(-6.5, 2.88, -4.5, 6.5, 3.1, 4.5, mat('#2a2c2e', .8)));
  hide(worldBox(-6.5, 3.1, 4.2, 6.5, 3.55, 4.5, brick)); // front parapet
  for (const x of [-4.5, -1.5, 1.5, 4.5]) hide(box(x - .05, 2.74, -4.2, x + .05, 2.8, 4.2, mat('#a49c8a'))); // cornice battens
  // Blinds over the three street windows: half drawn, or right down.
  const slat = mat('#cfc6b0', .8), slats = [];
  for (const [a, b] of P.walls[0].openings) for (let i = 0; i < 20; i++) { const y = 2.3 - i * .078; slats.push({ m: box(a, y, 4.11, b, y + .012, 4.17, slat), i }); }
  box(-5.15, 2.33, 4.1, -3.85, 2.4, 4.19, frame); box(-.65, 2.33, 4.1, .65, 2.4, 4.19, frame); box(3.85, 2.33, 4.1, 5.15, 2.4, 4.19, frame);
  let blinds = 9, blindsWant = 9;

  // Stairwell down to the shop: the shaft, steep steps, a line of light under the street door.
  const [wx0, wz0, wx1, wz1] = P.stairwell;
  box(wx1, S, wz0, wx1 + .05, 0, wz1, mat('#5b5a50')); box(wx0, S, wz1, wx1, 0, wz1 + .05, mat('#5b5a50'));
  for (let i = 0; i < 12; i++) { const z1 = wz1 - i * (wz1 - wz0) / 12, z0 = z1 - (wz1 - wz0) / 12; box(wx0, S, z0, wx1, -(i + 1) * (-S / 12), z1, walnut); }
  box(wx0 + .1, S, wz0 + .02, wx1 - .1, S + .03, wz0 + .08, glow('#ffd28a'));
  for (let z = wz0 + .1; z < wz1; z += .28) box(wx1 - .02, 0, z - .015, wx1 + .02, .92, z + .015, walnut); // balusters
  box(wx1 - .04, .92, wz0, wx1 + .04, .98, wz1 + .05, walnut); box(wx1 - .05, 0, wz1 - .05, wx1 + .05, 1.1, wz1 + .05, walnut); // rail, newel
  const coats = F('coats'); cylinder((coats[0] + coats[3]) / 2, 0, (coats[2] + coats[5]) / 2, .03, 1.8, walnut);
  for (const [c, y] of [['#3a3f4a', 1.15], ['#5a4632', 1.25]]) box(coats[0] + .02, y, coats[2] + .05, coats[3] - .02, y + .55, coats[5] - .05, mat(c));

  // --- Front room: Voss's clocks, the workbench, the sofa --------------------------------------------------------
  const bench = F('bench');
  box(bench[0], .88, bench[2], bench[3], .95, bench[5], walnut);
  for (const z of [bench[2] + .05, bench[5] - .1]) box(bench[3] - .1, 0, z, bench[3] - .04, .88, z + .05, walnut);
  for (let i = 0; i < 9; i++) { const g = cylinder(bench[0] + .2 + (i % 3) * .18, .95, bench[2] + .35 + Math.floor(i / 3) * .5, .03 + (i % 4) * .015, .962, brass, group, 16); g.rotation.y = i; }
  box(bench[0] + .15, .95, 2.4, bench[0] + .45, 1.12, 2.7, mat('#c9b48a', .5, .3)); // a movement in pieces
  cylinder(bench[3] - .15, .95, 2.9, .015, 1.45, iron); const loupe = new THREE.Mesh(new THREE.TorusGeometry(.09, .012, 6, 18), iron); loupe.position.set(bench[3] - .22, 1.42, 2.2); loupe.rotation.x = -1.1; group.add(loupe);
  const benchBulb = new THREE.MeshBasicMaterial({ color: '#ffe2b0' }); box(bench[3] - .28, 1.4, 2.1, bench[3] - .16, 1.46, 2.3, benchBulb);
  const benchLamp = new THREE.PointLight('#ffdcaa', 3.2, 6, 1.6); benchLamp.position.set(bench[3] - .1, 1.3, 2.2); group.add(benchLamp);
  const sofa = F('sofa'), velvet = mat('#4a3b46');
  box(sofa[0], .12, sofa[2], sofa[3], .45, sofa[5], velvet); box(sofa[0], .45, sofa[2], sofa[3], .85, sofa[2] + .22, velvet);
  for (const x of [sofa[0], sofa[3] - .18]) box(x, .45, sofa[2], x + .18, .65, sofa[5], velvet);
  for (const x of [sofa[0] + .25, sofa[0] + 1.05]) box(x, .45, sofa[2] + .25, x + .7, .55, sofa[5] - .05, mat('#56465a'));
  const coffee = F('coffee');
  box(coffee[0], .38, coffee[2], coffee[3], .42, coffee[5], walnut); for (const [x, z] of [[coffee[0] + .05, coffee[2] + .05], [coffee[3] - .1, coffee[5] - .1]]) box(x, 0, z, x + .05, .38, z + .05, walnut);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(.5, .34), new THREE.MeshStandardMaterial({ map: tex(256, 170, g => { g.fillStyle = '#d9d3c2'; g.fillRect(0, 0, 256, 170); g.fillStyle = '#222'; g.font = 'bold 22px Georgia'; g.fillText('DRAKENBURG HERALD', 14, 30); g.font = 'bold 15px Georgia'; g.fillText('CURFEW EXTENDED IN RIVERSIDE', 14, 58); g.fillStyle = '#555'; for (let y = 72; y < 160; y += 9) g.fillRect(14, y, 104 + (y % 3) * 30, 3); g.fillRect(136, 72, 106, 80); }) }));
  paper.rotation.set(-Math.PI / 2, 0, .3); paper.position.set(-1.75, .425, 2.9); group.add(paper);
  cylinder(-2.3, .42, 2.75, .05, .58, mat('#7d4a33', .5)); // thermos
  box(-4.6, .021, 1.2, -1.2, .026, 3.6, mat('#5a2f2b')); box(-4.5, .026, 1.3, -1.3, .029, 3.5, mat('#6f3b33'));
  const lampBox = F('lamp');
  cylinder((lampBox[0] + lampBox[3]) / 2, 0, (lampBox[2] + lampBox[5]) / 2, .02, 1.45, iron);
  const lampShade = cylinder((lampBox[0] + lampBox[3]) / 2, 1.3, (lampBox[2] + lampBox[5]) / 2, .17, 1.55, mat('#d8c39a', .9)); lampShade.material = new THREE.MeshStandardMaterial({ color: '#d8c39a', emissive: '#ffcf8a', emissiveIntensity: .6 });
  const floorLamp = new THREE.PointLight('#ffd49a', 2.4, 6, 1.7); floorLamp.position.set((lampBox[0] + lampBox[3]) / 2, 1.35, (lampBox[2] + lampBox[5]) / 2); group.add(floorLamp);

  // Clocks: each a few minutes apart, all ticking, except the tall one Voss stopped at 3:17.
  const faceTexture = tex(256, 256, g => {
    g.fillStyle = '#e9e1cc'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2f22'; g.lineWidth = 6; g.stroke(); g.fillStyle = '#2a241c'; g.font = 'bold 26px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => { const a = i / 12 * Math.PI * 2; g.fillText(n, 128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96); });
  });
  const faceMaterial = new THREE.MeshStandardMaterial({ map: faceTexture, roughness: .6 });
  const clocks = [];
  function wallClock(x, y, z, rotation, radius, { offset = 0, stopped = null, rim = walnut } = {}) {
    const c = new THREE.Group(); c.position.set(x, y, z); c.rotation.y = rotation; group.add(c);
    const body = cylinder(0, -.02, 0, radius * 1.1, .02, rim, c, 24); body.rotation.x = Math.PI / 2;
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), faceMaterial); face.position.z = .022; c.add(face);
    const hand = (length, width, color) => { const pivot = new THREE.Group(); pivot.position.z = .03; c.add(pivot); box(-width / 2, -length * .15, 0, width / 2, length, .006, color, pivot); return pivot; };
    const hours = hand(radius * .5, .025, dark), minutes = hand(radius * .78, .016, dark), seconds = stopped ? null : hand(radius * .85, .006, mat('#9b2a20'));
    clocks.push({ hours, minutes, seconds, offset, stopped });
  }
  wallClock(-2.0, 1.9, .68, 0, .22, { offset: -4 });
  wallClock(.75, 1.85, .68, 0, .15, { offset: 7, rim: brass });
  wallClock(2.6, 1.8, .68, 0, .19, { offset: 2 });
  wallClock(-6.17, 1.95, 2.2, Math.PI / 2, .26, { offset: -11, rim: brass });
  const gf = F('grandfather');
  box(gf[0], 0, gf[2], gf[3], gf[4], gf[5], walnut); box(gf[0] - .03, gf[4], gf[2] - .03, gf[3] + .03, gf[4] + .12, gf[5] + .03, walnut);
  box(gf[0] + .1, .5, gf[5], gf[3] - .1, 1.35, gf[5] + .01, glassMat);
  box((gf[0] + gf[3]) / 2 - .008, .75, gf[5] - .05, (gf[0] + gf[3]) / 2 + .008, 1.4, gf[5] - .04, brass); cylinder((gf[0] + gf[3]) / 2, .7, gf[5] - .045, .06, .72, brass).rotation.x = Math.PI / 2;
  wallClock((gf[0] + gf[3]) / 2, 1.72, gf[5] + .005, 0, .2, { stopped: [3, 17], rim: brass });

  // The bookcase that hides the radio room. It slides east along the partition.
  const bc = P.bookcase, shelf = new THREE.Group(); group.add(shelf);
  box(bc.x0, 0, bc.z0, bc.x1, bc.height, bc.z0 + .04, walnut, shelf);
  for (const x of [bc.x0, bc.x1 - .04]) box(x, 0, bc.z0, x + .04, bc.height, bc.z1, walnut, shelf);
  for (let s = 0; s < 5; s++) {
    const y = .08 + s * .5; box(bc.x0, y - .03, bc.z0, bc.x1, y, bc.z1, walnut, shelf);
    for (let x = bc.x0 + .06; x < bc.x1 - .1;) { const w = .04 + random() * .05, h = .26 + random() * .14; box(x, y, bc.z0 + .06, x + w, y + h, bc.z1 - .04, mat(['#6a2a24', '#2f4652', '#5a5233', '#3d2f40', '#7a6a4a', '#283a2c'][Math.floor(random() * 6)], .8), shelf); x += w + .006; }
  }
  let shelfOpen = 0, shelfWant = 0;
  const shelfClosed = [bc.x0, 0, bc.z0, bc.x1, bc.height, bc.z1], shelfMoved = [bc.x0 + bc.slide, 0, bc.z0, bc.x1 + bc.slide, bc.height, bc.z1];
  setSolid('bookcase', shelfClosed);

  // --- Kitchen and the chess game ------------------------------------------------------------------------------
  const ct = F('counter');
  box(ct[0], 0, ct[2], ct[3], .86, ct[5], mat('#59625a')); box(ct[0] - .02, .86, ct[2], ct[3] + .02, .92, ct[5] + .03, mat('#8a857a', .5));
  box(-1.6, .92, -4.05, -1.0, .97, -3.7, mat('#9aa0a2', .3, .6)); // sink
  box(-.5, .92, -4.0, -.1, .96, -3.7, iron); const kettle = cylinder(-.3, .96, -3.85, .1, 1.18, mat('#a83c2c', .4, .3)); kettle.scale.z = .85;
  for (let i = 0; i < 4; i++) cylinder(-2.2 + i * .16, .92, -3.8, .04, 1.0, mat('#d8d2c0', .5));
  box(ct[0], 1.55, -4.2, ct[3], 1.58, -3.95, walnut);
  const fr = F('fridge'); box(...fr, mat('#cfcac0', .4, .1)); box(fr[0] + .05, .9, fr[5], fr[0] + .08, 1.3, fr[5] + .04, iron);
  // Back door, standing open onto the roof.
  const backDoor = new THREE.Group(); backDoor.position.set(1.5, 0, -4.5); backDoor.rotation.y = -Math.PI / 2 - .35; group.add(backDoor);
  box(-1.08, .02, -.03, 0, 2.12, .03, mat('#4a5a52'), backDoor); box(-.9, 1.2, -.035, -.2, 1.9, .035, glassMat, backDoor);
  const chess = F('chess'), board = { x: (chess[0] + chess[3]) / 2, z: (chess[2] + chess[5]) / 2, y: .745 };
  box(chess[0], .7, chess[2], chess[3], .74, chess[5], walnut); cylinder(board.x, 0, board.z, .06, .7, walnut);
  const checker = tex(256, 256, g => { for (let i = 0; i < 64; i++) { g.fillStyle = (i + Math.floor(i / 8)) % 2 ? '#3c2a1c' : '#d8c8a4'; g.fillRect((i % 8) * 32, Math.floor(i / 8) * 32, 32, 32); } });
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(.48, .48), new THREE.MeshStandardMaterial({ map: checker, roughness: .5 })); boardMesh.rotation.x = -Math.PI / 2; boardMesh.position.set(board.x, board.y, board.z); group.add(boardMesh);
  const square = (f, r) => [board.x - .21 + f * .06, board.z - .21 + r * .06];
  const ivory = mat('#e9e0c8', .4), ebony = mat('#1d1a18', .4);
  const pieces = [[0, 0, 0], [4, 0, 0], [5, 1, 0], [2, 2, 0], [6, 3, 0], [3, 3, 0], [7, 0, 0], [1, 6, 1], [4, 7, 1], [5, 5, 1], [2, 6, 1], [6, 6, 1], [3, 4, 1], [0, 7, 1]].map(([f, r, black], i) => {
    const [x, z] = square(f, r), h = i % 5 === 1 ? .07 : .045, m = cylinder(x, board.y, z, .018, board.y + h, black ? ebony : ivory, group, 10); return { m, h };
  });
  const moves = [[5, 4, 2], [12, 3, 3], [3, 4, 4], [9, 6, 4], [4, 7, 5], [11, 5, 6]];
  let move = 0, pendingMove = null;
  function playMove() { const [p, f, r] = moves[move++ % moves.length], [x, z] = square(f, r); pieces[p].m.position.set(x, board.y + pieces[p].h / 2, z); }
  for (const id of ['chairW', 'chairE']) { const c = F(id); box(c[0], .42, c[2], c[3], .47, c[5], walnut); box(id === 'chairW' ? c[0] : c[3] - .05, .47, c[2], id === 'chairW' ? c[0] + .05 : c[3], .9, c[5], walnut); for (const [x, z] of [[c[0], c[2]], [c[3] - .04, c[5] - .04]]) box(x, 0, z, x + .04, .42, z + .04, walnut); }
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: '#ffe0b0' });
  cylinder(board.x, 2.35, board.z, .006, 2.8, dark); const bulb = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), bulbMaterial); bulb.position.set(board.x, 2.33, board.z); group.add(bulb);
  const kitchenLight = new THREE.PointLight('#ffd9a8', 3, 6.5, 1.6); kitchenLight.position.set(board.x, 2.25, board.z); group.add(kitchenLight);

  // --- The hidden radio room -----------------------------------------------------------------------------------
  const rd = F('radioDesk');
  box(rd[0], .74, rd[2], rd[3], .8, rd[5], walnut); for (const z of [rd[2] + .05, rd[5] - .1]) box(rd[0] + .05, 0, z, rd[0] + .12, .74, z + .05, walnut);
  box(5.78, .8, -2.75, 6.18, 1.2, -1.45, mat('#2f3a3a', .5, .4));
  const dials = new THREE.MeshBasicMaterial({ color: '#9fe8a8' });
  for (const z of [-2.5, -2.1, -1.7]) box(5.77, 1.0, z - .08, 5.78, 1.12, z + .08, dials);
  const phones = new THREE.Mesh(new THREE.TorusGeometry(.1, .018, 6, 14, Math.PI), dark); phones.position.set(5.65, .86, -1.3); phones.rotation.set(-Math.PI / 2, 0, .4); group.add(phones);
  picture(tex(512, 320, g => { g.fillStyle = '#d7cdb2'; g.fillRect(0, 0, 512, 320); g.strokeStyle = '#3a3a3a'; g.lineWidth = 3; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(20, 60 + i * 34); g.lineTo(492, 40 + i * 36); g.stroke(); } g.fillStyle = '#2a2a2a'; g.font = 'bold 26px monospace'; g.fillText('DRAKENBURG RAIL YARD', 70, 34); g.fillStyle = '#9b2a20'; for (const [x, y] of [[140, 120], [300, 170], [410, 230]]) g.fillRect(x, y, 30, 12); }), 1.6, 1, 6.19, 1.75, -2.1, -Math.PI / 2);
  // The board: photographs of Drakenburg officers joined with red string.
  const boardTexture = tex(768, 448, g => {
    g.fillStyle = '#9a7a52'; g.fillRect(0, 0, 768, 448);
    for (let i = 0; i < 400; i++) { g.fillStyle = i % 2 ? '#8a6a44' : '#a8885e'; g.fillRect((i * 37) % 768, (i * 53) % 448, 3, 3); }
    const spots = [[90, 80], [260, 60], [450, 90], [640, 70], [160, 250], [370, 240], [560, 260], [680, 330], [250, 370]];
    g.strokeStyle = '#c2271d'; g.lineWidth = 3; for (const [a, b] of [[0, 1], [1, 2], [2, 3], [1, 5], [4, 5], [5, 6], [6, 7], [2, 6], [4, 8], [5, 8]]) { g.beginPath(); g.moveTo(...spots[a]); g.lineTo(...spots[b]); g.stroke(); }
    spots.forEach(([x, y], i) => { g.fillStyle = '#e8e4d8'; g.fillRect(x - 38, y - 46, 76, 92); g.fillStyle = ['#4f5358', '#5d5850', '#45484e'][i % 3]; g.fillRect(x - 32, y - 40, 64, 64); g.fillStyle = '#8c8a84'; g.beginPath(); g.arc(x, y - 16, 15, 0, Math.PI * 2); g.fill(); g.fillRect(x - 22, y + 2, 44, 22); g.fillStyle = '#222'; g.font = '11px monospace'; g.textAlign = 'center'; g.fillText(['COL. ARDAN', 'MAJ. RUSK', 'CAPT. VEIL', '?', 'LT. KOSS', 'GEN. HALE', 'MAJ. ORLO', '?', 'SGT. PIKE'][i], x, y + 38); g.fillStyle = '#c2271d'; g.beginPath(); g.arc(x, y - 44, 5, 0, Math.PI * 2); g.fill(); });
  });
  picture(boardTexture, 2.1, 1.25, 3.65, 1.55, -4.18);
  for (let i = 0; i < 6; i++) { // prints drying on a line
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.18, .13), new THREE.MeshStandardMaterial({ color: ['#d9d4c8', '#bdb8ad', '#e2ddd0'][i % 3], side: THREE.DoubleSide, roughness: .8 }));
    p.position.set(2.75 + i * .32, 2.05, -.6); group.add(p);
  }
  box(2.55, 2.14, -.61, 4.7, 2.145, -.59, dark);
  const tp = F('tripod'); for (const a of [0, 2.1, 4.2]) { const leg = box(-.012, 0, -.012, .012, 1.35, .012, iron); leg.position.set((tp[0] + tp[3]) / 2 + Math.sin(a) * .18, .66, (tp[2] + tp[5]) / 2 + Math.cos(a) * .18); leg.rotation.set(Math.cos(a) * .25, 0, -Math.sin(a) * .25); }
  box((tp[0] + tp[3]) / 2 - .1, 1.32, (tp[2] + tp[5]) / 2 - .12, (tp[0] + tp[3]) / 2 + .1, 1.47, (tp[2] + tp[5]) / 2 + .06, dark);
  const lens = cylinder((tp[0] + tp[3]) / 2, 0, (tp[2] + tp[5]) / 2 - .2, .05, .14, dark); lens.rotation.x = Math.PI / 2; lens.position.y = 1.4;
  box(...F('files'), mat('#5d6460', .5, .4));
  const redBulb = new THREE.MeshBasicMaterial({ color: '#ff5040' }); const rb = new THREE.Mesh(new THREE.SphereGeometry(.045, 10, 8), redBulb); rb.position.set(3.7, 2.45, -2.0); group.add(rb);
  const darkroom = new THREE.PointLight('#ff3b2e', 1.8, 5.5, 1.7); darkroom.position.set(3.7, 2.35, -2.0); group.add(darkroom);

  // --- Roof terrace ---------------------------------------------------------------------------------------------
  const [tx0, tz0, tx1, tz1] = P.terrace;
  box(tx0, -.1, tz0, tx1, .01, tz1, mat('#2b2d2f', .45, .2));
  for (const id of ['parapetW', 'parapetE', 'parapetN']) { const p = F(id); worldBox(...p, brick); box(p[0] - .03, p[4], p[2] - .03, p[3] + .03, p[4] + .05, p[5] + .03, mat('#6f6a62')); }
  const tk = F('tank'), tankMat = mat('#55524c', .6, .4);
  for (const [x, z] of [[tk[0] + .1, tk[2] + .1], [tk[3] - .1, tk[2] + .1], [tk[0] + .1, tk[5] - .1], [tk[3] - .1, tk[5] - .1]]) box(x - .05, 0, z - .05, x + .05, 1.1, z + .05, iron);
  cylinder((tk[0] + tk[3]) / 2, 1.1, (tk[2] + tk[5]) / 2, .72, tk[4], tankMat, group, 18);
  const mast = F('mast'), mx = (mast[0] + mast[3]) / 2, mz = (mast[2] + mast[5]) / 2;
  cylinder(mx, 0, mz, .04, mast[4], iron); for (const [y, w] of [[3.6, 1.1], [4.1, .8], [4.6, .5]]) box(mx - w / 2, y, mz - .02, mx + w / 2, y + .03, mz + .02, iron);
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(mx, 4.3, mz), new THREE.Vector3(1.0, 2.3, -4.55), new THREE.Vector3(5.4, 2.1, -4.55)]), new THREE.LineBasicMaterial({ color: '#111' })); group.add(wire);
  const coop = F('coop'), coopWood = mat('#5a4a38');
  box(coop[0], 0, coop[2], coop[3], .35, coop[5], coopWood); box(coop[0], coop[4] - .1, coop[2] - .05, coop[3], coop[4], coop[5] + .05, coopWood);
  box(coop[0], .35, coop[2], coop[0] + .05, coop[4] - .1, coop[5], coopWood); box(coop[0], .35, coop[2], coop[3], coop[4] - .1, coop[2] + .05, coopWood);
  box(coop[3] - .01, .35, coop[2], coop[3], coop[4] - .1, coop[5], new THREE.MeshStandardMaterial({ color: '#8c918e', transparent: true, opacity: .35, depthWrite: false }));
  const pigeons = [[-2.6, .62, -7.2], [-2.35, .62, -6.8], [-2.75, .62, -6.7]].map(([x, y, z], i) => {
    const p = new THREE.Group(); p.position.set(x, y, z); p.rotation.y = 1.3 + i; group.add(p);
    const bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 8), mat('#8a8f98')); bodyMesh.scale.set(1, .8, 1.4); p.add(bodyMesh);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), mat('#5d6a74')); head.position.set(0, .09, .1); p.add(head); return { p, head, phase: i * 2.1 };
  });
  // Washing line along the east parapet, out of everyone's way.
  for (const z of [-4.9, -7.5]) cylinder(3.25, 0, z, .03, 2.1, iron);
  box(3.24, 2.05, -7.5, 3.26, 2.06, -4.9, dark);
  const sheets = [[-5.6, '#c8c4ba'], [-6.85, '#9fb0b8']].map(([z, c]) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.2), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: .9 })); s.geometry.translate(0, -.6, 0); s.rotation.order = 'YXZ'; s.rotation.y = Math.PI / 2; s.position.set(3.25, 2.05, z); group.add(s); return s; });

  return {
    cutaway,
    radio: [5, -.75], // the end of the desk nearest the bookcase
    lamps: [
      { light: benchLamp, on: 3.2, out: 0, bulb: benchBulb, color: new THREE.Color('#ffe2b0') },
      { light: floorLamp, on: 2.4, out: 0 },
      { light: kitchenLight, on: 3, out: 0, bulb: bulbMaterial, color: new THREE.Color('#ffe0b0') },
      { light: darkroom, on: 1.8, out: .5, bulb: redBulb, color: new THREE.Color('#ff5040') },
    ],
    interactions: [
      { at: [4.15, 1.55], r: 1.25, label: () => shelfWant ? 'Slide the bookcase back' : 'Slide the bookcase aside', action() { shelfWant = shelfWant ? 0 : 1; } },
      { at: [4.15, -.2], r: 1.1, label: () => shelfWant ? 'Close the bookcase behind you' : 'Open the bookcase', action() { shelfWant = shelfWant ? 0 : 1; } },
      { at: [0, 3.55], r: 1.2, bias: .3, label: () => blindsWant > 9 ? 'Raise the blinds halfway' : 'Lower the blinds', action() { blindsWant = blindsWant > 9 ? 9 : 20; } },
      { at: [board.x, board.z + .85], r: 1.05, label: () => 'Make a move on the chessboard', action() { playMove(); say('TEO', 'Bold. Wrong, but bold. My move next round.', 4); } },
      { at: [-4.75, -.75], r: 1.1, bias: .4, label: () => 'Stairs down to the shop', action() { say('MAREK', 'Nobody goes down without the knock. Not even you.', 4); } },
    ],
    act(name) {
      if (name !== 'chess') return null;
      pendingMove = 1.1; // the piece lands as his hand gets there
      return [board.x + .05, .82, board.z - .02];
    },
    update(t, dt, { lightsOut }) {
      if (pendingMove != null && (pendingMove -= dt) <= 0) { pendingMove = null; playMove(); }
      // Real time on the clocks, each set a few minutes off; the seconds hand ticks.
      const now = new Date(), base = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      for (const c of clocks) {
        const s = c.stopped ? c.stopped[0] * 3600 + c.stopped[1] * 60 : base + c.offset * 60;
        c.hours.rotation.z = -(s / 43200) * Math.PI * 2; c.minutes.rotation.z = -((s % 3600) / 3600) * Math.PI * 2;
        if (c.seconds) c.seconds.rotation.z = -((s % 60) / 60) * Math.PI * 2;
      }
      shelfOpen = THREE.MathUtils.damp(shelfOpen, shelfWant, 3.2, dt); shelf.position.x = shelfOpen * bc.slide;
      setSolid('bookcase', shelfOpen > .5 ? shelfMoved : shelfClosed);
      blinds = THREE.MathUtils.damp(blinds, blindsWant, 4, dt);
      for (const s of slats) s.m.visible = s.i < Math.round(blinds);
      lampShade.material.emissiveIntensity = .6 * (1 - lightsOut);
      // The neon buzzes; now and then a letter drops out for a moment.
      const buzz = Math.sin(t * 37) > .97 || (t % 9 > 8.6 && t % 9 < 8.75);
      neonMaterial.opacity = buzz ? .35 : 1; neonLight.intensity = buzz ? 2 : 6;
      tv.material.color.setHSL(.58 + Math.sin(t * 1.3) * .05, .35, .35 + Math.abs(Math.sin(t * 7.1 + Math.sin(t * 2.9))) * .25);
      for (const p of pigeons) { p.head.position.z = .1 + Math.max(0, Math.sin(t * 3 + p.phase)) * .03; p.p.rotation.y += Math.sin(t * .5 + p.phase) * dt * .4; }
      for (const [i, s] of sheets.entries()) s.rotation.x = Math.sin(t * 1.4 + i) * .16 + .12;
    },
  };
}

export default safehouse({
  id: 'safehouse-loft',
  title: 'Tinker\'s Loft safe house',
  summary: 'Undercover Outpost 07 cell above a clock shop in Drakenburg, the enemy capital. A hidden radio room, a chess game, a militia bar across the street.',
  plan: P, build, seed: 41, civilian: true,
  weatherLabel: 'Freezing rain · 1 °C',
  fog: ['#14181c', 15, 44],
  ambient: .85, key: .4,
  floorY: STREET - .4,
  precip: 'rain', roofY: 3.1, precipBottom: STREET,
  vehicleColor: '#8a929c',
  firstPass: 40,
  views: [
    { label: 'Inside', x: 2.4, z: 2.6, yaw: -1.75, pitch: -.1, eye: 1.7 },
    // Out the back door, looking over the pigeons and the aerial toward the rail yard.
    { label: 'Roof terrace', x: .2, z: -5.3, yaw: Math.PI + .35, pitch: -.06, eye: 1.7 },
    // A stake-out on the far pavement, looking up at the windows (you can look around, not walk: the street is
    // outside the flat's walkable area).
    { label: 'Across the street', x: 2, z: 13.1, yaw: -3, pitch: .28, eye: STREET + .15 + 1.7 },
    { label: 'Cutaway', x: 0, z: 11, yaw: Math.PI, pitch: -1, eye: 15 },
  ],
  callsign: 'Tinker\'s Loft',
  alertCall: 'Militia van. Lights out, get below the sills.',
  clearCall: 'Gone. Lights back on, slowly.',
  hush: 'Not now. Get down and keep away from the glass.',
  text: {
    routine: 'Four operatives above a shuttered clock shop in Drakenburg. Okafor watches the militia bar, Marek holds the stairs, Teo walks the flat, Ilić works the radio behind the bookcase.',
    warning: 'Engine in the street below. Lights out, below the sills.',
    road: 'Militia van in the street, searchlight on the windows. Nobody moves.',
    gone: 'The van has turned the corner. A moment longer before the lights come back.',
  },
  lines: {
    okafor: [
      'The bar across the street is militia. They drink till two and patrol drunk after. Quarter past two is the dangerous part of the night.',
      'Count the lit windows over there. When one goes dark early, someone is watching back.',
      'The van comes down this street every hour or so. Same driver, same searchlight, same bored sweep.',
    ],
    marek: [
      'Nobody comes up those stairs without the knock. Two, a pause, then three.',
      'Voss still opens the shop on Thursdays, so the street sees nothing has changed.',
      'The third step from the top creaks. That\'s not an accident.',
    ],
    teo: [
      'I\'m three moves from mate. Vesna says I\'ve been three moves from mate since October.',
      'The pigeons on the roof are for when the radio is jammed. Don\'t laugh. Nobody has ever jammed a pigeon.',
      'That tall clock is stopped at 3:17. Voss stopped it himself. We don\'t wind it.',
    ],
    vesna: [
      'Every face on that board is a Drakenburg officer. The red string shows who drinks with whom.',
      'We photograph the rail yard every time a train comes in. Command counts the flatcars to guess the next push.',
      'The bookcase stays shut while I transmit. If you came in through it, close it behind you.',
    ],
  },
  chatter: [
    '…Tinker\'s Loft, Outpost Seven… confirm the rail yard count… over…',
    '…Hollow Pine reports one patrol on the Frostford road, nothing new…',
    '…all stations: Drakenburg curfew moves to twenty-two hundred…',
    '…Kestrel Falls cordon holding. Out.',
  ],
});
