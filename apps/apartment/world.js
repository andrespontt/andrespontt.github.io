import * as THREE from 'three';
import {createCharacter} from './characters.js';

// Procedural, low-poly set: every measurement is in metres. Static geometry is
// separate from gameplay state; interactive IDs connect the two layers.
export function buildWorld(scene) {
  const colliders = [], targets = [], views = new Map();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const sphereGeo = new THREE.IcosahedronGeometry(1, 1);
  const materials = new Map();
  function material(color, glow = false) {
    const key = color + ':' + glow;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness:.83, ...(glow ? {emissive:color,emissiveIntensity:.8} : {})}));
    return materials.get(key);
  }
  function box(x,y,z,w,h,d,color,parent=scene) {
    const mesh = new THREE.Mesh(boxGeo,material(color));
    mesh.position.set(x,y,z); mesh.scale.set(w,h,d); mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function orb(x,y,z,r,color,parent=scene) {
    const mesh=new THREE.Mesh(sphereGeo,material(color));mesh.position.set(x,y,z);mesh.scale.setScalar(r);parent.add(mesh);return mesh;
  }
  function solid(x,y,z,w,h,d,color) {
    const mesh=box(x,y,z,w,h,d,color);
    colliders.push({x:x-w/2,z:z-d/2,w,d,bottom:y-h/2,top:y+h/2});return mesh;
  }
  function target(id,label,x,y,z,mesh,action) {
    targets.push({id,label,position:new THREE.Vector3(x,y,z),action});views.set(id,mesh);
  }
  const wall='#718078', trim='#c3c3a9', wood='#72513b', dark='#202c29', brass='#b99b58';
  box(0,-.14,0,16,.28,12,'#574635');
  for(let i=0;i<32;i++) box(-7.75+i*.5,.007,0,.475,.015,11.9,i%3===0?'#755d45':'#68513c');
  box(0,3.25,0,16,.15,12,'#a4a18b');
  solid(-8,1.6,0,.2,3.2,12,wall);solid(8,1.6,0,.2,3.2,12,wall);solid(0,1.6,-6,16,3.2,.2,wall);
  // Front glazing, entrance and solid piers.
  solid(-7.6,1.6,6,.8,3.2,.2,wall);solid(-.75,1.6,6,1.5,3.2,.2,wall);solid(5.05,1.6,6,5.9,3.2,.2,wall);
  solid(-4.35,.42,6,5.7,.84,.18,wall);solid(-4.35,3,6,5.7,.4,.18,wall);
  const glass = new THREE.MeshPhysicalMaterial({color:'#669198',transparent:true,opacity:.13,roughness:.25,depthWrite:false});
  const pane=new THREE.Mesh(boxGeo,glass);pane.position.set(-4.35,1.83,6);pane.scale.set(5.65,1.96,.035);scene.add(pane);
  colliders.push({x:-7.2,z:5.9,w:5.7,d:.2,bottom:0,top:3.2});
  for (const x of [-7.2,-5.3,-3.4,-1.5]) box(x,1.8,5.95,.055,2.1,.11,dark);
  for(const y of [.8,2.8]) box(-4.35,y,5.95,5.8,.07,.12,dark);
  box(-4.35,.84,5.85,6,.08,.38,trim);
  for (const x of [-7.15,-1.6]) {box(x,1.75,5.6,.35,2.5,.2,'#ad9d7b');for(let i=0;i<4;i++)box(x-.13+i*.08,1.75,5.45,.025,2.5,.07,'#867e65');}
  // Room partitions leave generous, unambiguous doorways.
  solid(-6,1.6,-1,4,3.2,.16,wall);solid(-1.5,1.6,-1,1,3.2,.16,wall);box(-3,2.95,-1,2,.5,.2,wall);
  solid(-1,1.6,-3.5,.16,3.2,5,wall);
  for(const x of [-8,8])box(x*.985,.12,0,.09,.24,12,trim);
  box(0,.12,-5.85,16,.24,.08,trim);box(-6,.12,-.86,4,.24,.08,trim);
  for(const x of [-4,-2])box(x,1.4,-.97,.09,2.8,.24,trim);
  box(-3,2.8,-.97,2.1,.09,.24,trim);
  // Door swings outward, so it never sweeps through the player inside.
  const door=new THREE.Group();door.position.set(0,0,6);scene.add(door);
  box(1,1.4,0,2,2.8,.12,'#364943',door);
  for(const y of [.7,1.9])box(1,y,-.075,1.62,.8,.035,'#293c37',door);
  box(1.7,1.3,-.14,.26,.05,.08,brass,door);box(1,2.35,-.1,.18,.1,.02,brass,door);
  target('door','Open front door',1,1.35,5.85,door,'door');
  box(1,2.99,6,2,.38,.2,wall);
  const doorCollider={x:0,z:5.85,w:2,d:.3,bottom:0,top:3.2,id:'door'};colliders.push(doorCollider);
  // Living room: rug, sofa, table, records and warm practical lights.
  box(-4.6,.03,2.8,5.3,.035,4,'#3c5955');
  for(const x of [-7,-2.2])box(x,.053,2.8,.04,.01,3.8,'#b2a581');
  const sofa=solid(-5.4,.45,1.05,3.8,.7,1.15,'#b88851');
  box(-5.4,.96,.59,3.8,.83,.25,'#b88851');
  for(const x of [-7.15,-3.65])box(x,.73,1.08,.25,.8,1.2,'#ad7d49');
  for(const x of [-6.5,-5.4,-4.3])box(x,.83,1.15,1.02,.17,.91,'#c99b61');
  const cushion=box(-6.7,1.08,.98,.55,.5,.17,'#536c5c');cushion.rotation.z=.18;
  target('sofa','Sit on the sofa',-5.4,1,1.5,sofa,'sit');
  solid(-4.8,.43,3.25,2.4,.15,1.25,wood);
  for(const x of [-5.7,-3.9])for(const z of [2.85,3.65])box(x,.2,z,.07,.4,.07,dark);
  box(-5.3,.54,3.1,.6,.08,.4,'#ddd0ac');box(-5.26,.59,3.12,.57,.04,.38,'#ab5543');
  const cup=box(-4.4,.65,3.3,.17,.24,.17,'#e5d9b7');
  target('cup','Inspect the cold coffee',-4.4,.65,3.3,cup,'coffee');
  function lamp(x,z){box(x,.04,z,.4,.08,.4,dark);box(x,1.15,z,.035,2.2,.035,brass);const shade=new THREE.Mesh(new THREE.CylinderGeometry(.3,.47,.48,12),material('#edcd8c',true));shade.position.set(x,2.13,z);scene.add(shade);const l=new THREE.PointLight('#ffd395',16,7,2);l.position.set(x,1.9,z);scene.add(l);}
  lamp(-7.2,2.4);
  // TV / low console on the side wall, with visible switchable screen.
  solid(-7.45,.42,3.95,.7,.8,2.1,wood);
  box(-7.35,1.45,3.95,.13,1.12,1.9,dark);
  const screen=box(-7.27,1.45,3.95,.02,.96,1.72,'#203d40');
  screen.material=new THREE.MeshStandardMaterial({color:'#80a29e',emissive:'#537d7b',emissiveIntensity:.65});
  target('tv','Switch off the television',-7.1,1.4,3.95,screen,'tv');
  function plant(x,z){box(x,.23,z,.4,.46,.4,'#ab7857');for(let i=0;i<7;i++){const a=i*2.4;const leaf=orb(x+Math.sin(a)*.24,.7+i*.095,z+Math.cos(a)*.22,.32,i%2?'#42644a':'#69805a');leaf.scale.y=.5;}}
  plant(-2,5.4);plant(7.3,.6);
  function art(x,y,z,w,h){box(x,y,z,w,h,.06,dark);box(x,y,z+.04,w-.12,h-.12,.02,'#c3b594');orb(x+.1,y+.1,z+.065,Math.min(w,h)*.24,'#b0744e').scale.z=.06;box(x-.15,y-.3,z+.08,w*.55,.07,.02,'#344b47');}
  art(-6,1.95,-.87,1.5,1.3);art(4.3,1.95,-5.85,1.4,1.8);
  // Bedroom and child's birthday corner.
  const bed=solid(-5.8,.38,-4,2.6,.6,3.2,wood);box(-5.8,.73,-4,2.55,.28,3.1,'#ddd3b4');box(-5.8,.93,-3.5,2.57,.15,2.1,'#687d74');box(-5.8,1,-5.22,2.4,.18,.55,'#efe7d0');box(-5.8,.9,-5.6,2.8,1.4,.15,wood);target('bed','Rest for a moment',-5.8,1,-3,bed,'rest');
  solid(-2,.95,-4.9,1.4,1.9,1.4,'#657268');
  solid(-2.2,.55,-2.1,1.1,1.1,.65,wood);lamp(-7.5,-5.1);
  for(let i=0;i<3;i++){const x=-3.2+i*.55;orb(x,2.2+Math.sin(i)*.2,-5.3,.27,['#bd735c','#bdab69','#587f85'][i]);box(x,1.4,-5.3,.008,1.45,.008,'#b4b4a2');}
  box(-2.2,1.15,-2.1,.55,.12,.4,'#b47d62');
  // Kitchen and dining area.
  solid(6.6,.5,-5,2.5,1,1.5,'#88917c');box(6.6,1.05,-5,2.7,.12,1.6,'#c2baa4');
  solid(7.25,.5,-2.7,1.2,1,3.1,'#88917c');box(7.25,1.05,-2.7,1.3,.12,3.1,'#c2baa4');
  for(const z of [-3.6,-2.7,-1.8])box(6.59,.73,z,.04,.04,.3,brass);
  box(7.22,1.12,-2.6,.9,.03,1.05,dark);for(const z of [-2.85,-2.35])for(const x of [6.98,7.47]){const ring=orb(x,1.15,z,.15,'#465354');ring.scale.y=.1;}
  solid(4.2,1.13,-5.18,1.25,2.25,1.3,'#bcc0ad');box(3.68,1.4,-4.49,.05,.48,.07,dark);
  solid(3.8,.78,-1.7,2.5,.13,1.35,wood);for(const x of [2.9,4.7])for(const z of [-2.1,-1.3])box(x,.36,z,.07,.72,.07,dark);
  for(const x of [2.9,4.7]) {solid(x,.48,-.45,.65,.12,.65,'#819079');box(x,.85,-.15,.65,.8,.1,'#819079');for(const dx of [-.24,.24])box(x+dx,.23,-.45,.06,.46,.5,wood);}
  const cake=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.25,16),material('#d9c4a0'));cake.position.set(3.8,.98,-1.7);scene.add(cake);box(3.8,1.23,-1.7,.035,.3,.035,'#caa861');
  target('cake','Read the birthday card',3.8,1.15,-1.7,cake,'card');
  const pendant=new THREE.Mesh(new THREE.ConeGeometry(.5,.4,16),material('#c1ad71'));pendant.position.set(3.8,2.55,-1.7);scene.add(pendant);box(3.8,2.95,-1.7,.02,.6,.02,dark);const kitchenLight=new THREE.PointLight('#ffdfac',23,8,2);kitchenLight.position.set(3.8,2.25,-1.7);scene.add(kitchenLight);
  // Entry console: security phone and reusable repellent.
  solid(3.5,.5,4.9,2.1,.92,.75,wood);box(3.5,1,4.9,2.2,.1,.85,'#b3a481');
  const phone=box(3.2,1.13,4.9,.48,.17,.3,'#28332f');box(3.2,1.24,4.9,.58,.1,.14,'#1b2925');target('phone','Call security backup',3.2,1.2,4.7,phone,'phone');
  const spray=box(4,1.27,4.9,.17,.43,.17,'#a5b983');box(4,1.51,4.9,.1,.06,.1,dark);target('spray','Take clown repellent',4,1.3,4.7,spray,'pickup');
  art(4.4,2.2,5.83,1.2,1.1);
  // Bookshelf and reading nook.
  solid(7.45,1.15,3.7,.8,2.3,2.7,wood);
  for(let row=0;row<4;row++)for(let j=0;j<9;j++)box(6.99,.27+row*.54,2.6+j*.25,.28,.3+(j%3)*.06,.17,['#9f9c7e','#677e74','#a16f51','#c1ad81'][j%4]);
  lamp(6.5,5.3);
  // Wet street. Apartment and pavement share a flat threshold for stable movement.
  box(0,-.15,13,48,.25,14,'#192b31');box(0,-.05,7.2,24,.1,2.4,'#697572');box(0,-.04,18,48,.1,2,'#637271');
  for(let x=-22;x<24;x+=4)box(x,.005,13,2,.012,.09,'#a0a492');
  const wet=new THREE.MeshStandardMaterial({color:'#31515a',roughness:.17,metalness:.45,transparent:true,opacity:.55});
  for(let i=0;i<12;i++){const puddle=new THREE.Mesh(new THREE.CircleGeometry(.7+(i%3)*.3,12),wet);puddle.rotation.x=-Math.PI/2;puddle.position.set(-11+i*2,.005,10+(i%3)*2);puddle.scale.x=1.7;scene.add(puddle);}
  for(let i=0;i<9;i++){const x=-23+i*5.8;const h=8+(i%4)*2;box(x,h/2,23,5.5,h,6,['#293b40','#34474b','#28383d'][i%3]);for(let row=0;row<4;row++)for(let col=0;col<3;col++){const win=box(x-1.6+col*1.6,2+row*2.1,19.94,.72,1.12,.03,(row+col+i)%3?'#657269':'#b1a773');if((row+col+i)%3===0)win.material=material('#b1a773',true);}}
  for(const x of [-10,9]){box(x,2.5,8.5,.09,5,.09,dark);box(x+.55,4.9,8.5,1.2,.08,.08,dark);const light=box(x+1,4.8,8.5,.5,.1,.3,'#dcc68d');light.material=material('#dcc68d',true);const p=new THREE.PointLight('#e0ca94',35,12,2);p.position.set(x+1,4.65,8.5);scene.add(p);}
  function person(x,z,clown=false,variant=0){
    const model=createCharacter(clown?'clown':'guard',variant);
    model.position.set(x,0,z);
    scene.add(model);
    return model;
  }
  const guards=[person(-.65,7),person(2.65,7,false,1)];guards.forEach((g,i)=>target('guard'+i,'Talk to bodyguard',g.position.x,1.5,7,g,'guard'));
  const clown=person(-4,15,true);
  const van=new THREE.Group();scene.add(van);van.visible=false;box(0,.85,0,2,1.2,4,'#283c3e',van);box(0,1.7,.25,1.85,.65,2.4,'#455b5b',van);box(0,1.75,-.98,1.65,.45,.03,'#789c9d',van);for(const x of [-.9,.9])for(const z of [-1.2,1.2])orb(x,.4,z,.38,'#151e20',van);for(const x of [-.6,.6]){const beacon=box(x,2.1,0,.35,.12,.3,'#628eae',van);beacon.material=material('#628eae',true);}
  // Rain only falls outside the roof, including in the front window view.
  const count=1300, positions=new Float32Array(count*6);
  for(let i=0;i<count;i++){const k=i*6;positions[k]=Math.random()*48-24;positions[k+1]=Math.random()*15;positions[k+2]=6.2+Math.random()*21;positions[k+3]=positions[k]-.055;positions[k+4]=positions[k+1]-.3;positions[k+5]=positions[k+2];}
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:'#a9c9cd',transparent:true,opacity:.34}));rain.frustumCulled=false;scene.add(rain);
  return {colliders,targets,views,door,doorCollider,clown,guards,van,rain,positions,screen};
}

