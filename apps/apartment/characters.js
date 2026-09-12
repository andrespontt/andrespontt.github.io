import * as THREE from 'three';

// Original character assets, authored in metres, facing +Z. Geometry is merged
// by articulated body part with vertex colours: eight draw calls per character.
const surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72 });
const rigs = new WeakMap();
const palette = {
  suit: '#27343e', seam: '#43515a', shirt: '#d4d8cb', tie: '#647c76',
  leather: '#151c22', metal: '#abb6b5', gold: '#c7ab70', lens: '#182d38',
  red: '#973e38', wine: '#582b33', cream: '#d7c9a5', ink: '#253b43',
  paint: '#ded7c5', hair: '#a34b32', shadow: '#433c43',
};

function part(name, parent, position = [0, 0, 0]) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(...position);
  parent.add(group);
  const pieces = [];
  function shape(geometry, xyz, scale, color, rotation = [0, 0, 0]) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...xyz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    const flat = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    flat.applyMatrix4(matrix);
    const tint = new THREE.Color(color);
    const colors = new Float32Array(flat.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b;
    }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    pieces.push(flat);
  }
  const box = (p, s, c, r) => shape(new THREE.BoxGeometry(1, 1, 1), p, s, c, r);
  const oval = (p, s, c, r) => shape(new THREE.SphereGeometry(1, 12, 8), p, s, c, r);
  const cone = (p, s, c, top = 0, r) => shape(new THREE.CylinderGeometry(top, 1, 1, 12), p, s, c, r);
  function tube(points, radius, color) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    shape(new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 5, false), [0,0,0], [1,1,1], color);
  }
  function finish() {
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const count = pieces.reduce((sum, p) => sum + p.attributes[name].array.length, 0);
      const array = new Float32Array(count);
      let offset = 0;
      for (const piece of pieces) { array.set(piece.attributes[name].array, offset); offset += piece.attributes[name].array.length; }
      merged.setAttribute(name, new THREE.BufferAttribute(array, 3));
    }
    pieces.forEach(p => p.dispose());
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, surface);
    mesh.name = name + '-surface';
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return group;
  }
  return {group, box, oval, cone, tube, finish};
}

export function createCharacter(kind = 'guard', variant = 0) {
  const clown = kind === 'clown';
  const root = new THREE.Group();
  root.name = clown ? 'The uninvited guest' : variant ? 'Guard — Rivera' : 'Guard — Hayes';
  const body = part('body', root);
  const skin = variant ? '#997256' : '#c39977';
  const suit = variant ? '#33403f' : palette.suit;
  const coat = clown ? palette.cream : suit;
  // Shaped torso, hips and neck give a human silhouette instead of stacked cubes.
  body.oval([0,1.15,0], [.30,.39,.185], coat);
  body.cone([0,1.19,0], [.29,.57,.18], coat, 1.14);
  body.oval([0,.83,0], [.255,.16,.17], clown ? palette.wine : suit);
  body.cone([0,1.55,0], [.085,.14,.08], clown ? palette.paint : skin, .9);
  if (!clown) {
    body.box([0,1.25,.181], [.20,.42,.025], palette.shirt);
    body.box([0,1.40,.205], [.071,.075,.025], palette.tie, [0,0,Math.PI/4]);
    body.cone([0,1.23,.205], [.043,.29,.018], palette.tie, .5);
    for (const side of [-1,1]) {
      body.box([side*.14,1.29,.184], [.095,.37,.033], palette.seam, [0,0,-side*.27]);
      body.box([side*.19,1.03,.168], [.13,.027,.025], palette.seam);
    }
    body.box([0,.91,.015], [.49,.056,.35], palette.leather);
    body.box([0,.91,.2], [.078,.05,.026], palette.metal);
    body.box([-.27,.89,.025], [.09,.16,.11], palette.leather);
    body.box([.16,1.38,.206], [.078,.098,.02], palette.gold);
    body.oval([.16,1.39,.222], [.022,.024,.008], palette.metal);
    body.box([-.20,1.30,.22], [.087,.15,.06], palette.leather);
    body.box([-.20,1.43,.22], [.012,.14,.012], palette.leather);
    body.box([-.20,1.32,.255], [.048,.025,.008], '#708d82');
    for(let i=0;i<3;i++) body.box([-.20,1.28-i*.015,.256], [.05,.004,.005], palette.seam);
    body.tube([[-.19,1.42,.15],[-.27,1.49,.10],[-.20,1.56,.05]], .008, palette.leather);
    for (const y of [1.14,1.04]) body.oval([.045,y,.204], [.014,.014,.008], palette.metal);
  } else {
    // Alternating harlequin diamonds, piping, large buttons and a pleated collar.
    for (const side of [-1,1]) {
      body.tube([[side*.14,.88,.14],[side*.22,1.13,.17],[side*.19,1.42,.13]], .012, palette.red);
      for(let i=0;i<3;i++) body.box([side*.18,1.01+i*.145,.18], [.095,.095,.018], i%2 ? palette.ink : palette.red, [0,0,Math.PI/4]);
    }
    for (const y of [.96,1.17,1.38]) body.oval([0,y,.205], [.064,.061,.045], palette.red);
    for(let i=0;i<16;i++) {
      const angle=i*Math.PI/8;
      body.oval([Math.cos(angle)*.23,1.51,Math.sin(angle)*.18], [.092,.065,.073], i%2 ? '#b6ad96' : palette.cream, [0,angle,0]);
    }
    body.cone([0,.88,0], [.28,.08,.18], palette.wine, 1);
  }
  body.finish();

  const head = part('head', body.group, [0,1.68,0]);
  head.oval([0,.075,0], [.177,.235,.16], clown ? palette.paint : skin);
  head.oval([0,-.04,.039], [.139,.13,.126], clown ? palette.paint : skin);
  for (const side of [-1,1]) head.oval([side*.174,.045,0], [.037,.064,.04], clown ? palette.paint : skin);
  if (!clown) {
    head.oval([0,.228,-.025], [.172,.079,.147], variant ? '#252526' : '#453b32');
    head.box([0,.095,.152], [.30,.031,.033], palette.leather);
    for(const side of [-1,1]) {
      head.box([side*.08,.075,.167], [.134,.07,.03], palette.lens, [0,0,side*.035]);
      head.box([side*.159,.087,.067], [.021,.022,.18], palette.leather);
      head.box([side*.078,.092,.185], [.073,.009,.006], '#66838d');
    }
    head.oval([0,.012,.168], [.034,.053,.036], skin);
    head.tube([[-.055,-.064,.151],[0,-.069,.159],[.055,-.064,.151]], .006, '#694e40');
    head.oval([.186,.05,.022], [.025,.035,.029], palette.leather);
    head.tube([[.19,.02,.01],[.207,-.07,0],[.14,-.15,.01]], .007, palette.leather);
    if(variant) head.oval([0,-.104,.076], [.105,.048,.065], '#423831');
  } else {
    // Painted sockets and raised brows remain readable in the rainy street.
    for (const side of [-1,1]) {
      head.oval([side*.072,.095,.148], [.058,.069,.022], palette.shadow);
      head.oval([side*.072,.095,.169], [.032,.025,.016], '#d6b975');
      head.oval([side*.069,.095,.184], [.012,.017,.008], '#121b21');
      head.oval([side*.065,.102,.190], [.005,.005,.003], '#f2e4bc');
      head.box([side*.078,.176,.141], [.10,.022,.022], palette.wine, [0,0,-side*.30]);
      head.cone([side*.076,-.015,.157], [.024,.105,.012], palette.red, 0, [0,0,Math.PI]);
      head.oval([side*.12,-.035,.124], [.04,.026,.015], palette.red);
      for(let i=0;i<5;i++) head.oval([side*(.17+(i%2)*.025),.08+i*.034,-.065], [.072,.065,.08], i%2 ? '#743727' : palette.hair);
    }
    head.oval([0,.016,.20], [.054,.049,.052], palette.red);
    head.tube([[-.108,-.053,.129],[-.070,-.101,.155],[0,-.117,.162],[.070,-.101,.155],[.108,-.053,.129]], .018, palette.wine);
    for(let i=-3;i<=3;i++) head.box([i*.021,-.10+Math.abs(i)*.004,.169], [.017,.022,.012], '#c6bda3');
    head.cone([.035,.39,-.02], [.143,.38,.13], palette.red, 0, [0,0,-.15]);
    head.cone([.009,.223,-.02], [.148,.039,.14], palette.ink, 1);
    head.oval([.063,.579,-.02], [.041,.041,.041], palette.cream);
    for(let i=0;i<3;i++) head.oval([.024+i*.01,.29+i*.078,.082-i*.028], [.022,.022,.009], palette.gold);
  }
  head.finish();

  const arms=[],forearms=[],legs=[];
  for (const side of [-1,1]) {
    const arm=part(side<0?'left-arm':'right-arm',body.group,[side*.32,1.40,0]);
    arm.oval([0,-.08,0], [.12,.16,.135], coat);
    arm.cone([0,-.20,0], [.089,.31,.09], coat, 1.25);
    if(clown) for(let i=0;i<3;i++) arm.box([0,-.12-i*.09,.098], [.065,.065,.015], side<0?palette.red:palette.ink,[0,0,Math.PI/4]);
    arm.finish();arms.push(arm.group);
    const forearm=part('forearm',arm.group,[0,-.35,0]);
    forearm.cone([0,-.12,.008], [.07,.25,.078], coat, 1.18);
    forearm.cone([0,-.244,.008], [.076,.045,.079], clown?palette.red:palette.shirt, 1);
    forearm.oval([0,-.305,.016], [.065,.088,.05], clown?palette.cream:skin);
    forearm.oval([-side*.055,-.284,.04], [.025,.047,.028], clown?palette.cream:skin,[0,0,-side*.35]);
    if(!clown && side<0) {forearm.box([0,-.213,.081],[.082,.048,.02],palette.leather);forearm.box([0,-.213,.096],[.04,.033,.008],palette.metal);}
    forearm.finish();forearms.push(forearm.group);
    const leg=part(side<0?'left-leg':'right-leg',root,[side*.145,.84,0]);
    const trousers=clown?(side<0?palette.ink:palette.red):suit;
    leg.cone([0,-.20,0], [.106,.40,.11], trousers, 1.13);
    leg.cone([0,-.54,0], [.081,.32,.09], trousers, 1.2);
    leg.box([0,-.41,.089],[.09,.033,.017],clown?palette.cream:palette.seam);
    if(clown) {
      for(let i=0;i<3;i++) leg.box([0,-.11-i*.14,.118], [.087,.087,.015],palette.cream,[0,0,Math.PI/4]);
      leg.cone([0,-.69,0],[.087,.06,.09],palette.cream,1);
    } else leg.box([0,-.48,.092],[.012,.37,.008],palette.seam);
    leg.oval([0,-.745,clown?.09:.047], [clown?.125:.10,.085,clown?.26:.16], clown?palette.wine:palette.leather);
    leg.box([0,-.812,clown?.09:.047],[clown?.23:.18,.033,clown?.43:.28],palette.leather);
    for(let i=0;i<3;i++) leg.box([0,-.69,.09+i*.028],[.084,.011,.008],clown?palette.gold:palette.seam);
    leg.finish();legs.push(leg.group);
  }
  rigs.set(root,{body:body.group,head:head.group,arms,forearms,legs,clown,phase:variant*1.7,previous:null,stride:0});
  return root;
}

export function animateCharacter(root, time, dt, mood='watch') {
  const rig=rigs.get(root);
  if(!rig)return;
  const position=root.position;
  const speed=rig.previous && dt>0 ? Math.min(4,Math.hypot(position.x-rig.previous.x,position.z-rig.previous.z)/dt) : 0;
  if(!rig.previous)rig.previous=new THREE.Vector3();
  rig.previous.copy(position);
  rig.stride=THREE.MathUtils.lerp(rig.stride,speed,1-Math.exp(-10*dt));
  const walking=Math.min(1,rig.stride/1.4), phase=time*(mood==='flee'?11:7)+rig.phase;
  const breathe=Math.sin(time*1.8+rig.phase);
  rig.body.position.y=breathe*.006+Math.abs(Math.sin(phase))*walking*.014;
  rig.body.rotation.x=mood==='flee'?.10:0;
  rig.head.rotation.z=rig.clown?Math.sin(time*.8)*.10:0;
  rig.head.rotation.y=rig.clown?Math.sin(time*.55)*.08:Math.sin(time*.4+rig.phase)*.15;
  rig.arms.forEach((arm,i)=>{
    const side=i===0?-1:1;
    arm.rotation.x=Math.sin(phase+i*Math.PI)*walking*.47;
    arm.rotation.z=side*(.075+breathe*.008);
    rig.forearms[i].rotation.x=-.13-walking*.14;
    rig.legs[i].rotation.x=-Math.sin(phase+i*Math.PI)*walking*.43;
  });
  // At rest, one guard periodically checks his shoulder radio.
  if(!rig.clown && walking<.1){
    const radio=Math.pow(Math.max(0,Math.sin(time*.35+rig.phase)),12);
    rig.arms[0].rotation.x=-radio*.48;
    rig.forearms[0].rotation.x=-.13-radio*1.75;
  }
}
