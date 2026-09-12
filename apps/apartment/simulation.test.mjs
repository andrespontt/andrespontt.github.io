import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,canStand,movePlayer,roomAt,updateClown,updateGuards,isProtected,rainSettings} from './simulation.js';
import * as THREE from '../vendor/three.module.min.js';
const vendor=new URL('../vendor/three.module.min.js',import.meta.url).href;
const characters=(await readFile(new URL('./characters.js',import.meta.url),'utf8')).replace("from 'three'",`from '${vendor}'`);
const characterURL='data:text/javascript;base64,'+Buffer.from(characters).toString('base64');
const {createCharacter,animateCharacter}=await import(characterURL);
for(const kind of ['guard','clown']) {
  const model=createCharacter(kind);
  let draws=0;
  model.traverse(object=>{if(object.isMesh){draws++;for(const attribute of Object.values(object.geometry.attributes))assert(attribute.array.every(Number.isFinite),`${kind} geometry is finite`);}});
  assert.equal(draws,8,`${kind} stays within the character draw-call budget`);
  for(let frame=0;frame<120;frame++){model.position.z+=.025;animateCharacter(model,frame/60,1/60,'flee');}
  model.traverse(object=>assert([object.rotation.x,object.rotation.y,object.rotation.z].every(Number.isFinite),`${kind} animation is finite`));
}
const source=(await readFile(new URL('./world.js',import.meta.url),'utf8')).replace("from 'three'",`from '${vendor}'`).replace("from './characters.js'",`from '${characterURL}'`);
const {buildWorld}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const scene=new THREE.Scene(),world=buildWorld(scene);scene.updateMatrixWorld(true);
const p=createState().player;
assert(canStand(p.x,p.z,world.colliders));
const closed={x:1,z:5,y:0};movePlayer(closed,0,3,world.colliders,false);assert(closed.z<5.7,'Closed entrance stops walking');
const open={x:1,z:5,y:0};movePlayer(open,0,3,world.colliders,true);assert(open.z>7.5,'Open entrance is traversable');
const wall={x:0,z:-5};movePlayer(wall,0,-20,world.colliders,false);assert(wall.z> -5.8,'Substeps prevent tunnelling');
assert.equal(roomAt(-4,-3),'Bedroom');assert.equal(roomAt(3,-2),'Kitchen & dining');
const state=createState();state.player.z=12;state.guards[0]={x:-3,z:11};state.clown.x=state.player.x;state.clown.z=13;
assert.equal(updateClown(state,.02),'guard');assert.equal(state.clown.mode,'flee');state.backup='arrived';updateClown(state,.02);assert.equal(state.clown.mode,'gone');
// Flood-fill the actual floor plan, checking every interaction has a reachable
// standing position and clear sight line within the in-game interaction range.
const size=.25,start=[-3,1.5],queue=[start],seen=new Set([start.join(',')]);
for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz]of[[size,0],[-size,0],[0,size],[0,-size]]){const nx=x+dx,nz=z+dz,key=[nx,nz].join(',');if(!seen.has(key)&&canStand(nx,nz,world.colliders,false)){seen.add(key);queue.push([nx,nz]);}}}
const ray=new THREE.Raycaster();
for(const t of world.targets.filter(t=>t.action!=='guard')){
  const reachable=queue.some(([x,z])=>{const from=new THREE.Vector3(x,1.68,z),delta=t.position.clone().sub(from),d=delta.length();if(d>2.65||d<.1)return false;ray.set(from,delta.normalize());ray.far=Math.max(0,d-.45);return !ray.intersectObjects(scene.children,true).some(h=>h.object!==world.views.get(t.id)&&h.object.type==='Mesh'&&h.object.material.opacity>=1);});
  assert(reachable,`${t.id} has a reachable, unobstructed interaction point`);
}
console.log(`Passed collision, doorway, guard, ending and ${world.targets.length-2} interaction reachability checks (${queue.length} reachable floor positions).`);

const alone=createState();alone.player.x=5;alone.player.z=14;alone.clown.x=5;alone.clown.z=14.6;
assert.equal(isProtected(alone),false);
assert.equal(updateClown(alone,.02),'caught','Clown catches a player away from the guards');
assert(alone.caught);
const escort=createState();escort.escort=true;escort.player.z=15;
const guardStart={...escort.guards[0]};updateGuards(escort,.1);
assert(Math.hypot(escort.guards[0].x-guardStart.x,escort.guards[0].z-guardStart.z)<=.261,'Escorts have a finite speed');
assert.equal(isProtected(escort),false,'Requesting escort does not grant distant protection');
const sealed=createState();sealed.player={...sealed.player,x:1,z:5};sealed.clown.x=1;sealed.clown.z=6.6;
for(let i=0;i<120;i++)updateClown(sealed,1/60,world.colliders);
assert(!sealed.caught,'A closed door separates player and clown');
const intruder=createState();intruder.doorOpen=true;intruder.player.x=1;intruder.player.z=3.8;intruder.clown.x=1;intruder.clown.z=7;intruder.guards=[{x:9,z:14},{x:10,z:14}];
for(let i=0;i<180&&!intruder.caught;i++)updateClown(intruder,1/60,world.colliders);
assert(intruder.caught,'An unguarded open entrance lets the clown reach the player indoors');
const window=createState();window.player.x=-4;window.player.z=5.5;window.guards=[{x:-4,z:6.5}];
assert(!isProtected(window,world.colliders),'Guards cannot protect through a solid window/wall');
const indoor=rainSettings({x:1,z:5},false),ajar=rainSettings({x:1,z:5},true),outdoor=rainSettings({x:1,z:8},true);
assert(indoor.gain>0&&indoor.gain<ajar.gain&&ajar.gain<outdoor.gain,'Indoor rain remains audible, rises with an open door and stays below outdoors');
assert(indoor.cutoff<ajar.cutoff&&ajar.cutoff<outdoor.cutoff,'Closed door muffles rain more strongly');
assert(rainSettings({x:-5,z:-4},true).gain<ajar.gain,'Distant rooms attenuate the open doorway');
console.log('Threat, nearby guard rescue, escort lag, closed/open door, wall occlusion and indoor rain checks passed.');