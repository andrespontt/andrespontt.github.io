import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,canStand,movePlayer,roomAt,updateClown} from './simulation.js';
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
const state=createState();state.player.z=12;state.clown.x=state.player.x;state.clown.z=13;
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
