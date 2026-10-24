import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,canStand,movePlayer,roomAt,updateClown,updateGuards,isProtected,rainSettings,hasClearPath} from './simulation.js';
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
const state=createState();state.player.z=12;state.guards[0]={x:-3,z:12};state.clown.x=state.player.x;state.clown.z=13;
assert.equal(updateClown(state,.02),'block');assert.equal(state.clown.mode,'blocked');assert.equal(updateClown(state,.21),'guard');assert.equal(state.clown.mode,'stunned');updateClown(state,.5);assert.equal(state.clown.mode,'flee');state.backup='arrived';updateClown(state,.02);assert.equal(state.clown.mode,'gone');
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
const guardStart={...escort.guards[1]};updateGuards(escort,.1);
assert(Math.hypot(escort.guards[1].x-guardStart.x,escort.guards[1].z-guardStart.z)<=.261,'Escorts have a finite speed');
assert.equal(isProtected(escort),false,'Requesting escort does not grant distant protection');
function settledEscort(yaw=Math.PI){
  const s=createState();s.escort=true;s.player={...s.player,x:0,z:12,yaw};s.clown.mode='gone';
  for(let frame=0;frame<300;frame++)updateGuards(s,1/60,world.colliders);
  return s;
}
for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const s=settledEscort(yaw),g=s.guards[1],dx=g.x-s.player.x,dz=g.z-s.player.z;
  assert(Math.hypot(dx,dz)>1.5&&Math.hypot(dx,dz)<2.6,'Escort settles nearby with breathing room');
  assert(Math.abs(dx*Math.cos(yaw)-dz*Math.sin(yaw))>1.2,'Escort stands off the shoulder');
  assert(dx*-Math.sin(yaw)+dz*-Math.cos(yaw)<-.3,'Resting formation is behind the viewing direction');
  const resting={x:g.x,z:g.z};
  for(let frame=0;frame<180;frame++){s.player.yaw+=.03;updateGuards(s,1/60,world.colliders);}
  assert(Math.hypot(g.x-resting.x,g.z-resting.z)<.001,'Looking around does not make the escort orbit');
  s.player.x+=.08;for(let frame=0;frame<60;frame++)updateGuards(s,1/60,world.colliders);
  assert(Math.hypot(g.x-resting.x,g.z-resting.z)<.3,'Small adjustments do not drag the guard along');
}
const walkingEscort=settledEscort();
for(let frame=0;frame<120;frame++){
  walkingEscort.player.z+=2/60;updateGuards(walkingEscort,1/60,world.colliders);
  assert(isProtected(walkingEscort,world.colliders),'A settled escort keeps pace with an ordinary walk');
  assert(Math.hypot(walkingEscort.guards[1].x-walkingEscort.player.x,walkingEscort.guards[1].z-walkingEscort.player.z)>1.35,'Walking retains personal space');
}
for(let direction=0;direction<8;direction++){
  const s=settledEscort(),angle=direction*Math.PI/4;s.clown={x:Math.sin(angle)*5,z:12+Math.cos(angle)*5,mode:'approach',timer:10};
  let blocked=false;
  for(let frame=0;frame<240&&!s.caught;frame++){
    updateGuards(s,1/60,world.colliders);if(updateClown(s,1/60,world.colliders)==='block')blocked=true;
  }
  assert(!s.caught&&blocked,`Nearby escort intercepts approach direction ${direction}`);
}
console.log('Loose diagonal escort, camera independence, walking space and eight threat approaches passed.');
const personalSpace=settledEscort();personalSpace.player.x=personalSpace.guards[1].x-.1;personalSpace.player.z=personalSpace.guards[1].z;
for(let frame=0;frame<120;frame++)updateGuards(personalSpace,1/60,world.colliders);
assert(Math.hypot(personalSpace.guards[1].x-personalSpace.player.x,personalSpace.guards[1].z-personalSpace.player.z)>1.3,'Walking into the escort makes him give way');
for(const x of [-10.8,10.8]){
  const s=createState();s.escort=true;s.clown.mode='gone';s.player={...s.player,x,z:16.5,yaw:0};s.guards[1]={x,z:14};
  for(let frame=0;frame<300;frame++)updateGuards(s,1/60,world.colliders);
  assert(canStand(s.guards[1].x,s.guards[1].z,world.colliders,true));
  assert(Math.hypot(s.guards[1].x-x,s.guards[1].z-16.5)>1.5,'Escort chooses the roomy shoulder near the street boundary');
}
const sealed=createState();sealed.player={...sealed.player,x:1,z:5};sealed.clown.x=1;sealed.clown.z=6.6;sealed.guards=[];
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
for(const escorting of [false,true]){
  const doorWatch=createState();doorWatch.doorOpen=true;doorWatch.escort=escorting;
  doorWatch.player.x=escorting?9:-3;doorWatch.player.z=escorting?14:-3;
  // Begin with an actual attempt to cross the doorway, including when Rivera escorts.
  doorWatch.clown.x=1;doorWatch.clown.z=9;
  let strikes=0;
  for(let frame=0;frame<240;frame++){
    doorWatch.time+=1/60;
    updateGuards(doorWatch,1/60,world.colliders);
    const event=updateClown(doorWatch,1/60,world.colliders);
    if(event==='guard')strikes++;
    assert(doorWatch.guards.every(g=>g.z>=6.6),'Guards never enter the apartment');
    assert(doorWatch.clown.z>6,'Posted guard blocks the clown outside the threshold');
  }
  if(!escorting)assert(strikes>0,'Opening the door leads to a visible block and punch');
  assert(doorWatch.guards[0].z<9,'One guard remains at the entrance');
}
const crossing=createState();crossing.doorOpen=true;
const walker={x:1,z:5};movePlayer(walker,0,3,world.colliders,true);
assert(walker.z>7.5,'Doorway guards do not obstruct the player');
console.log('Doorway interception, punch/recoil sequence, posted guard and unobstructed player passage passed.');
for(const approachX of [-7,-4,1,6]){
  const watched=createState();watched.doorOpen=true;watched.player={...watched.player,x:-3,z:-3};watched.clown.x=approachX;
  let hits=0;
  for(let frame=0;frame<900;frame++){
    watched.time+=1/30;updateGuards(watched,1/30,world.colliders);
    if(updateClown(watched,1/30,world.colliders)==='guard')hits++;
    assert(watched.clown.z>6,'Clown stays outside during repeated doorway approaches');
    assert(!watched.caught);
  }
  assert(hits>0,'A posted guard punches arrivals from either side of the street');
}
console.log('Repeated doorway approaches from both street directions remain blocked.');
// Stress the actual floor plan at three supported frame intervals.
let scenarios=0;
for(const dt of [1/60,1/30,.04])for(const escorting of [false,true])for(const x of [-7,-4,1,6,10]){
  const s=createState();s.doorOpen=true;s.escort=escorting;s.player={...s.player,x:1,z:4.5};s.clown.x=x;
  let punches=0;
  for(let t=0;t<35;t+=dt){
    s.time+=dt;updateGuards(s,dt,world.colliders);
    if(updateClown(s,dt,world.colliders)==='guard')punches++;
    assert(!s.caught&&s.clown.z>6,'Guarded doorway remains safe');
    assert(s.guards.every(g=>g.z>=6.6&&Number.isFinite(g.x)));
    assert(Math.hypot(s.guards[0].x-1,s.guards[0].z-6.8)<=2.601,'Posted guard keeps his entrance assignment');
  }
  assert(punches>0);scenarios++;
}
// Walk away with a nearby threat: a posted guard must not become an escort.
const lure=createState();lure.doorOpen=true;
for(let frame=0;frame<600;frame++){
  lure.player.x=lure.guards[0].x;lure.player.z=lure.guards[0].z+2;
  lure.clown.x=lure.guards[0].x;lure.clown.z=lure.guards[0].z+3.5;lure.clown.mode='approach';
  updateGuards(lure,1/60,world.colliders);
  assert(Math.hypot(lure.guards[0].x-1,lure.guards[0].z-6.8)<=2.601);
}
for(const dt of [1/60,1/30,.04]){
  const chase=createState();chase.player={...chase.player,x:7,z:14};chase.clown.x=7;chase.clown.z=17;
  for(let t=0;t<3&&!chase.caught;t+=dt){updateGuards(chase,dt,world.colliders);updateClown(chase,dt,world.colliders);}
  assert(chase.caught,'Unprotected street player can be caught at every frame interval');
}
console.log(`${scenarios} extended doorway scenarios, posted-guard lure regression and unprotected captures passed.`);

// The pursuit must work across the real floor plan, not just down the empty
// foyer: dining chairs and the exterior side alleys used to trap it forever.
let pursuits=0;
for(let x=-11;x<=11;x+=2)for(let z=-5;z<=17;z+=2){
  if(!canStand(x,z,world.colliders,true))continue;
  const s=createState();s.doorOpen=true;s.guards=[];s.player.x=x;s.player.z=z;
  for(let frame=0;frame<1800&&!s.caught;frame++){
    s.time+=1/60;updateClown(s,1/60,world.colliders);
    assert(canStand(s.clown.x,s.clown.z,world.colliders,true),'Pursuit never cuts through furniture or walls');
  }
  assert(s.caught,`Unguarded player at (${x},${z}) can be reached`);pursuits++;
}
for(const dt of [1/60,1/30,.04])for(const [x,z] of [[3,-3],[5,-3],[-11,-5],[11,-5]]){
  const s=createState();s.doorOpen=true;s.guards=[];s.player.x=x;s.player.z=z;
  for(let time=0;time<25&&!s.caught;time+=dt)updateClown(s,dt,world.colliders);
  assert(s.caught,`Obstructed pursuit works at dt=${dt}`);
}
for(const x of [-10,10]){
  const s=createState();s.guards=[];s.player.x=x;s.player.z=-4;
  for(let frame=0;frame<1200&&!s.caught;frame++)updateClown(s,1/60,world.colliders);
  assert(s.caught,'Closing the front door does not make the exterior side alleys safe');
}
const changingDoor=createState();changingDoor.guards=[];changingDoor.doorOpen=true;changingDoor.player.x=3;changingDoor.player.z=-3;changingDoor.clown.x=1;changingDoor.clown.z=7.5;
for(let frame=0;frame<5;frame++)updateClown(changingDoor,1/60,world.colliders);
changingDoor.doorOpen=false;
for(let frame=0;frame<120;frame++){
  updateClown(changingDoor,1/60,world.colliders);
  assert(changingDoor.clown.z>6.3&&!changingDoor.caught,'Closing the door invalidates the open entrance route');
}
changingDoor.doorOpen=true;
for(let frame=0;frame<900&&!changingDoor.caught;frame++)updateClown(changingDoor,1/60,world.colliders);
assert(changingDoor.caught,'Pursuit resumes around the furniture after reopening the door');
const retreat=createState();retreat.guards=[];retreat.clown={x:3,z:-3,mode:'flee',timer:100};
for(let frame=0;frame<120;frame++){
  updateClown(retreat,1/60,world.colliders);
  assert(retreat.clown.z<5.7,'Retreat cannot cross a closed door');
}
retreat.doorOpen=true;
for(let frame=0;frame<900;frame++){
  updateClown(retreat,1/60,world.colliders);
  assert(canStand(retreat.clown.x,retreat.clown.z,world.colliders,true),'Retreat respects body clearance');
}
assert(Math.hypot(retreat.clown.x-11,retreat.clown.z-17.3)<.2,'A retreat routes out of the furnished apartment when the door opens');
assert(!hasClearPath({x:1,z:5.4},{x:1,z:6.6},world.colliders,false),'The closed door blocks attacks and spray');
assert(hasClearPath({x:1,z:5.4},{x:1,z:6.6},world.colliders,true),'The open door permits attacks and spray');
assert(!hasClearPath({x:-4,z:5.4},{x:-4,z:6.6},world.colliders,true),'Glass continues to block attacks and spray');
console.log(`${pursuits} whole-floor-plan pursuits, furniture routes, side alleys, door transitions and indoor retreat passed.`);
