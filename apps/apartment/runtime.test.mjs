import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as THREE from '../vendor/three.module.min.js';
import * as simulation from './simulation.js';
const vendor=new URL('../vendor/three.module.min.js',import.meta.url).href;
const characterCode=(await readFile(new URL('./characters.js',import.meta.url),'utf8')).replace("from 'three'",`from '${vendor}'`);
const characterURL='data:text/javascript;base64,'+Buffer.from(characterCode).toString('base64');
const {animateCharacter}=await import(characterURL);
const worldCode=(await readFile(new URL('./world.js',import.meta.url),'utf8')).replace("from 'three'",`from '${vendor}'`).replace("from './characters.js'",`from '${characterURL}'`);
const {buildWorld}=await import('data:text/javascript;base64,'+Buffer.from(worldCode).toString('base64'));
const elements=new Map(),events=new Map();
function element(id){
  if(!elements.has(id))elements.set(id,{hidden:false,textContent:'',style:{},dataset:{},classList:{add(){},remove(){}},setAttribute(){},focus(){},animate(){},querySelector(){return element(id+' span');},addEventListener(name,fn){events.set(id+':'+name,fn);},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:108,height:108};},firstElementChild:{style:{}}});
  return elements.get(id);
}
const sandbox=vm.createContext({THREE,...simulation,animateCharacter,buildWorld,console,performance,Math,Float32Array,Promise,Date,setTimeout,clearTimeout,localStorage:{getItem:()=> 'off'},navigator:{},window:{},matchMedia:()=>({matches:false}),document:{getElementById:element,body:element('body'),addEventListener:(n,f)=>events.set(n,f),exitPointerLock(){}},addEventListener:(n,f)=>events.set(n,f),fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)})});
let source=await readFile(new URL('./game.js',import.meta.url),'utf8');
source=source.slice(0,source.lastIndexOf('try{\n  scene=')===-1?source.lastIndexOf('try{\r\n  scene='):source.lastIndexOf('try{\n  scene=')).replace(/^import .*;\r?\n/gm,'');
vm.runInContext(source,sandbox);
const run=code=>vm.runInContext(code,sandbox);
run(`scene=new THREE.Scene();world=buildWorld(scene);camera=new THREE.PerspectiveCamera(67,1,.07,95);scene.add(camera);held=new THREE.Group();camera.add(held);mist=new THREE.Group();mist.material={};moon={};bindInput();`);
function reset(){run(`Object.assign(state,createState());state.playing=true;state.started=true;soundOn=false;keys.clear();touchX=touchZ=0;aimed=null;world.door.rotation.y=0;world.views.get('spray').visible=true;camera.position.set(state.player.x,1.68,state.player.z);scene.updateMatrixWorld(true);`);}
function target(id){run(`aimed=world.targets.find(t=>t.id===${JSON.stringify(id)});interact();`);}
function key(code){events.get('keydown')({code,repeat:false,preventDefault(){}});}
reset();key('KeyF');assert.match(element('caption').textContent,/entry console/);
target('spray');assert(run('state.spray'));assert.equal(run("world.views.get('spray').visible"),false);
run('state.player.x=1;state.player.z=4;state.clown.x=1;state.clown.z=5.5;camera.position.set(1,1.68,4);camera.lookAt(1,1.68,5.5);');key('KeyF');
assert.equal(run('state.clown.mode'),'flee','Repellent can defend against an indoor intruder');
reset();run('state.spray=true;state.player.x=-4;state.player.z=6.5;state.clown.x=-4;state.clown.z=5.5;camera.position.set(-4,1.68,6.5);camera.lookAt(-4,1.68,5.5);');key('KeyF');
assert.notEqual(run('state.clown.mode'),'flee','Repellent cannot pass through a wall or window');
reset();target('bed');run('update(.04);');
assert(run('camera.position.y>1.005'),'Resting camera is above the top of the blanket');
key('KeyE');assert.equal(run('state.seated'),null);
reset();run('state.player.x=1;state.player.z=3;state.player.yaw=0;keys.add("KeyW");keys.add("ShiftRight");update(.04)');
assert(Math.abs(run('state.player.z')-(3-4.1*.04))<1e-6,'Right Shift sprints like Left Shift');
reset();target('door');assert(run('state.doorOpen'));run('state.player.x=1;state.player.z=6');target('door');assert(run('state.doorOpen'),'Cannot close the door through the player');
reset();target('phone');assert.equal(run('state.backup'),'called');run('state.backupTime=4');target('phone');assert.equal(run('state.backupTime'),4,'Repeated calls do not reset backup');
reset();target('tv');assert.equal(run('state.tv'),false);target('tv');assert.equal(run('state.tv'),true);
key('KeyC');assert(run('state.crouched'));key('Space');assert(run('state.player.velocity>0'));
key('KeyW');key('Escape');assert.equal(run('state.playing'),false);assert.equal(run('keys.size'),0);key('KeyE');assert.equal(run('state.doorOpen'),false);
// Exercise actual scene rays, including a guard's articulated child meshes.
function aimAt(id,position){run(`camera.position.fromArray(${JSON.stringify(position)});camera.lookAt(world.targets.find(t=>t.id===${JSON.stringify(id)}).position);scene.updateMatrixWorld(true);aim();`);}
reset();run(`world.guards.forEach((g,i)=>{g.position.set(i?2.65:-.65,0,7);g.rotation.y=Math.atan2(-4-g.position.x,15-7);world.targets.find(t=>t.id==='guard'+i).position.set(g.position.x,1.5,7);animateCharacter(g,1,1/60,'watch',0);});`);
aimAt('guard0',[-.2583365452,1.04,7.3108049841]);
assert.equal(run('aimed?.id'),'guard0','A nearby crouching player can talk to the guard through his own arm geometry');
key('KeyE');assert(run('state.escort'),'Guard interaction enables escort');
key('KeyE');assert.equal(run('state.escort'),false,'Second guard interaction returns to hold');
reset();aimAt('guard1',[1,1.68,5.3]);
assert.notEqual(run('aimed?.id'),'guard1','The closed front door blocks targeting the guard outside');
run('world.door.rotation.y=-Math.PI*.51;state.doorOpen=true;');aimAt('guard1',[1,1.68,5.3]);
assert.equal(run('aimed?.id'),'guard1','The open entrance allows targeting the outside guard');
reset();aimAt('phone',[3.2,1.68,2.6]);assert.equal(run('aimed?.id'),'phone');
run('world.van.position.set(3.2,0,3.6);world.van.visible=false;');aimAt('phone',[3.2,1.68,2.6]);
assert.equal(run('aimed?.id'),'phone','Hidden scene groups must not occlude an interaction ray');
reset();target('sofa');run('update(.04);');assert.equal(run('state.seated'),'sofa');
key('Space');assert.equal(run('state.player.velocity'),0,'Seated players cannot jump');
key('KeyE');assert.equal(run('state.seated'),null,'Interact stands up from the sofa');
target('cup');assert.match(element('caption').textContent,/Cold coffee/);
target('cake');assert.match(element('caption').textContent,/Happy birthday/);
reset();run('state.spray=true;state.player.x=7;state.player.z=14;state.clown.x=7;state.clown.z=15;camera.position.set(7,1.68,14);camera.lookAt(7,1.68,13);');
key('KeyF');assert.notEqual(run('state.clown.mode'),'flee','Repellent requires aiming toward the clown');
run('camera.lookAt(7,1.68,15);');key('KeyF');assert.notEqual(run('state.clown.mode'),'flee','A repeat spray respects its cooldown');
run('state.sprayCooldown=0;');key('KeyF');assert.equal(run('state.clown.mode'),'flee');
reset();let spacePrevented=false;events.get('keydown')({code:'Space',repeat:false,preventDefault(){spacePrevented=true;}});
assert(spacePrevented,'Gameplay Space suppresses the focused button default click');
element('stick').onpointerdown({pointerId:3});element('stick').onpointermove({pointerId:3,clientX:89,clientY:54});
assert.equal(run('touchX'),1,'Touch joystick moves right');
events.get('stick:pointercancel')({pointerId:3});assert.equal(run('touchX'),0,'Canceled touch movement releases the stick');
console.log('Runtime interaction and command regressions passed.');
reset();run('state.player.x=7;state.player.z=14;state.clown.x=7;state.clown.z=14.5;state.backup="called";state.backupTime=8.99;update(.02);');
assert.equal(run('state.backup'),'arrived');assert.equal(run('state.caught'),false,'Backup resolves before a same-frame clown attack');assert.equal(run('state.clown.mode'),'gone');
reset();run('state.player.x=7;state.player.z=14;state.clown.x=7;state.clown.z=14.5;update(.02);');
assert(run('state.caught'));assert.equal(run('state.playing'),false);assert.equal(element('caught').hidden,false,'Capture opens the retry overlay');
reset();run('state.player.x=9;state.player.z=4;update(.02)');
assert.equal(element('room').textContent,'The street');assert.match(element('status').textContent,/Exposed/,'Exterior side alleys are not labeled sheltered');
