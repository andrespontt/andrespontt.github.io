import * as THREE from 'three';
import { dressVehicle } from './safehouse.js';

// One rented unit in a continuous mixed-use city block. Upper floors are exterior scenery.
export function buildTransportStreet(k,{group,setSolid,say,sign,brick,cutaway,interactions,plan:P}) {
 const {box,mat,glow,floor}=k,stone=mat('#8a8c80'),iron=mat('#354246',.65,.3),asphalt=mat('#242d31',.38,.2);
 const windows=[],trim=[];
 const add=(list,x,y,z,w,h,d,color)=>list.push({x,y,z,w,h,d,color});
 function facade(x0,x1,z,y0,h,facing=1){
  for(let y=y0+1;y<h-1;y+=3.1)for(let x=x0+1.4;x<x1-1;x+=3.1){
   const lit=(Math.floor(x*7+y*11)%5+5)%5===0;
   add(windows,x,y+.75,z,1.25,1.6,.035,lit?'#d5b77f':'#23363e');
   add(trim,x,y-.1,z+facing*.05,1.55,.13,.25,'#a3a093');
   add(trim,x,y+.75,z+facing*.06,.065,1.6,.055,'#535d5a');
  }
  for(let y=y0;y<h;y+=3.1)add(trim,(x0+x1)/2,y,z,(x1-x0)+.1,.12,.2,'#777e76');
 }
 // Continuous building: the office occupies only the middle of its ground floor.
 // Ground-floor neighbors stop at the apartment slab: no duplicate coplanar facade above.
 for(const b of P.cityBlocks)k.worldBox(...b,brick);
 const upper=new THREE.Group();group.add(upper);cutaway.push(upper);
 k.worldBox(-20,3.45,-5,19.5,16,5,brick,upper);
 box(-20.3,3.35,4.8,19.8,3.6,5.3,stone,upper);
 box(-20.3,15.9,-5.2,19.8,16.25,5.25,iron,upper);
 facade(-20,19.5,5.035,3.6,16);
 for(const b of P.cityBlocks.slice(1))facade(b[0],b[3],b[2]-.035,3.2,b[4],-1);
 // Other tenants and a separate residential entrance.
 sign('RIVERSIDE HOUSE / 24',5,.4,-8,3.05,5.07);
 sign('NORTHLINE PRINT & COPY',7,.6,-15.2,2.6,5.07);
 box(-9.5,0,5.02,-7,2.5,5.07,iron);box(-9.2,.15,5.08,-7.3,2.3,5.1,mat('#213137'));
 sign('RESIDENTS',1.7,.2,-8.25,1.95,5.12);
 box(-7.25,.95,5.1,-7.05,1.45,5.17,stone);
 for(let x=-19;x<-11;x+=2.4)box(x,.4,5.02,x+1.8,2.15,5.06,mat('#394b4c',.25,.3));
 sign('PHARMACY',5,.55,-13,2.6,16.92,Math.PI);
 sign('RIVER CAFE',5,.55,11,2.6,16.92,Math.PI);
 for(const [a,b] of [[-19,0],[4,18]])for(let x=a;x<b-2;x+=3)box(x,.4,16.94,x+2,2.2,16.98,mat('#4e5955'));
 // Side streets intersect Riverside Avenue at both ends of the block.
 for(const x of [-23,23]){
  box(x-3,-.035,-25,x+3,-.015,40,asphalt);
  for(let z=-20;z<39;z+=5)if(z+2.4<5.1||z>14.9)box(x-.06,-.014,z,x+.06,-.012,z+2.4,mat('#b3aa8e'));
  for(let z=7.4;z<12.6;z+=.9)box(x-2.8,-.014,z,x+2.8,-.012,z+.4,mat('#c6c6b1'));
 }
 // Pavement is level with the accessible entrances; kerb strips stop short of garage drives.
 for(const z of [5.1,13])for(const [a,b] of [[-35,-26],[-20,20],[26,35]]){
  box(a,-.01,z,b,.015,z+1.9,mat('#656c68'));
  for(let x=a;x<b-.02;x+=1.5)box(x,.015,z,x+.018,.017,z+1.85,mat('#434f4e'));
 }
 for(const [a,b] of [[-20,7.7],[12.3,13.7],[18.3,20]])box(a,.02,6.9,b,.12,7.02,stone);
 for(const x of [-18,-5,20,31]){
  k.cylinder(x,0,14.6,.065,4.8,iron);box(x-.4,4.7,14.3,x+.4,4.85,14.9,glow('#d2c397'));
  const light=new THREE.PointLight('#ffe3af',16,13,1.6);light.position.set(x,4.5,14.6);group.add(light);
 }
 sign('RIVERSIDE AVENUE',3,.35,18,2.8,6.6);
 // A freestanding street sign needs posts and a backing, not a plane in mid-air.
 box(16.48,2.605,6.48,19.52,2.995,6.59,iron);
 for(const x of [16.7,19.3]){
  k.cylinder(x,.015,6.52,.055,2.98,iron);
  box(x-.16,.015,6.36,x+.16,.075,6.68,iron);
  setSolid('streetSign'+x,[x-.07,0,6.45,x+.07,3,6.59]);
 }
 // Garage bays: broad openings and illuminated pull-up shutters.
 // Garage floor is rendered by the shared plan.
 cutaway.push(box(6.5,3.2,-5,19.5,3.45,5,iron));
 for(const x of [8,12,14,18])box(x-.025,.01,-4.4,x+.025,.018,4.7,mat('#bca76b'));
 // Bay lights stand either side of the bay sign, never in front of it. The office door is lit from its canopy.
 for(const x of [10,16]){const light=new THREE.PointLight('#d4dfcf',12,9,1.4);light.position.set(x,3,5.6);group.add(light);box(x-.35,3.1,5.15,x+.35,3.18,5.5,glow('#d4dfcf'));box(x-.1,3.18,5.01,x+.1,3.28,5.5,iron);}
 sign('VEYR / VEHICLE ACCESS',4.6,.44,13,3.12,5.08);
 for(const x of [10,16]){
  box(x-1,3,-2,x+1,3.06,-1.85,glow('#dce9d9'));
  for(const a of [x-.75,x+.75])box(a-.025,3.06,-1.95,a+.025,3.21,-1.9,iron);
  const light=new THREE.PointLight('#dce9d9',22,10,1.5);light.position.set(x,2.8,-1);group.add(light);
 }
 let player=null;
 const doors=P.garageDoors.map(d=>{
  const shutter=new THREE.Group();shutter.position.set(d.x,0,d.z);group.add(shutter);
  box(0,0,-.055,d.width,d.height,.055,iron,shutter);
  for(let y=.14;y<d.height;y+=.22)box(0,y,.06,d.width,y+.025,.075,stone,shutter);
  box(d.x-.12,0,d.z-.1,d.x+.025,3.15,d.z+.15,iron);box(d.x+d.width-.025,0,d.z-.1,d.x+d.width+.12,3.15,d.z+.15,iron);
  const door={...d,shutter,lift:0,open:false};
  const collider=()=>setSolid(d.id,[d.x,door.lift,d.z-.1,d.x+d.width,door.lift+d.height,d.z+.1]);
  const occupied=()=>player&&Math.abs(player.y)<1&&player.x>d.x-.35&&player.x<d.x+d.width+.35&&Math.abs(player.z-d.z)<.65;
  collider();
  interactions.push({at:[d.x+d.width/2,d.z],r:3.3,label:()=>`${door.open?'Close':'Open'} garage ${d.id==='garageA'?'01':'02'}`,action(){
   if(door.open&&occupied()){say('GARAGE','Doorway occupied. Step clear to close.');return;}door.open=!door.open;
  }});
  door.update=dt=>{if(!door.open&&occupied())door.open=true;const target=door.open?3.05:0;
   if(Math.abs(target-door.lift)<.001)return;door.lift=door.lift+Math.sign(target-door.lift)*Math.min(Math.abs(target-door.lift),dt*1.7);
   shutter.position.y=door.lift;collider();};return door;
 });
 // Workshop details leave the first bay and staff doorway clear.
 box(10,.85,-4.65,13,.95,-4.05,mat('#89765a'));
 for(const x of [10,12.8])box(x,0,-4.6,x+.12,.85,-4.1,iron);
 setSolid('garageBench',[10,0,-4.65,13,.95,-4.05]);
 sign('TOOLS / RETURN AFTER USE',2.6,.35,11.5,2,-4.75);
 box(10.2,1.15,-4.79,12.9,1.85,-4.75,iron);
 for(let x=10.4;x<12.7;x+=.4){box(x,1.25,-4.74,x+.06,1.75,-4.66,stone);box(x,1.7,-4.76,x+.06,1.74,-4.65,iron);}
 box(18.7,.3,2,19.1,1.1,2.35,mat('#963f34'));box(19.06,.27,1.96,19.31,.32,2.39,iron);box(19.08,.7,2.12,19.31,.8,2.23,iron);sign('FIRE',.7,.25,19.28,1.5,2.1,-Math.PI/2);
 for(const x of [-11,21]){
  box(x-.4,0,5.5,x+.4,.6,6.1,stone);box(x-.3,.6,5.6,x+.3,.9,6,mat('#4e644c'));
  setSolid('streetPlanter'+x,[x-.4,0,5.5,x+.4,.9,6.1]);
 }
 sign('24 / OFFICE B',1.4,.22,5,2.6,5.08);
 // A modest rented office beneath apartments: a canopy on brackets below the name board (nothing crosses the
 // lettering), a downlight under it, rainwater pipes and tenant details.
 box(-1.45,2.48,5.03,.85,2.57,5.85,iron);
 for(const x of [-1.38,.78]){k.rod([x,2.05,5.04],[x,2.49,5.8],.022,iron);box(x-.05,1.98,5.02,x+.05,2.12,5.07,stone);}
 box(-.75,2.455,5.3,.15,2.472,5.62,glow('#d4dfcf'));
 const porch=new THREE.PointLight('#d4dfcf',12,9,1.4);porch.position.set(-.3,2.3,5.6);group.add(porch);
 box(-1.8,1.2,5.03,-1.55,1.55,5.12,iron);box(-1.74,1.3,5.125,-1.62,1.36,5.14,glow('#a9c4ad'));
 for(const x of [-6.85,19.18]){
  k.cylinder(x,.02,5.22,.055,15.8,iron);
  for(let y=.6;y<15.8;y+=2.6)box(x-.09,y,5.01,x+.09,y+.055,5.28,stone);
 }
 // Garage equipment stays against the wall, clear of the moving shutters and van.
 box(18.45,0,-3.4,19.15,.75,-2.4,iron);box(18.43,.75,-3.42,19.17,.8,-2.38,stone);
 for(let y=.15;y<.7;y+=.18){box(18.42,y,-3.35,18.44,y+.12,-2.45,mat('#526365'));box(18.4,y+.04,-3.1,18.42,y+.065,-2.7,stone);}
 setSolid('garageToolChest',[18.4,0,-3.42,19.17,.8,-2.38]);
 for(const z of [1,1.55]){
  const tire=new THREE.Mesh(new THREE.TorusGeometry(.28,.1,7,16),mat('#20292b'));tire.rotation.y=Math.PI/2;tire.position.set(18.87,.38,z);group.add(tire);
 }
 sign('01',.45,.3,7.2,2.5,5.06);sign('02',.45,.3,13,2.5,5.06);
 // Parked delivery van in bay 02; bay 01 remains clear for vehicle access.
 const van=new THREE.Group();van.position.set(16,0,-1.7);group.add(van);
 box(-.9,.3,-2,.9,1.8,2,mat('#aaa99b'),van);dressVehicle(van,'van',4.5);
 setSolid('parkedVan',[15,0,-4,17,2.3,.6]);
 // Facade windows and trims each use one draw call.
 for(const [items,emissive] of [[windows,true],[trim,false]]){
  const material=emissive?new THREE.MeshBasicMaterial():mat('#ffffff');
  const mesh=new THREE.InstancedMesh(k.cube,material,items.length),o=new THREE.Object3D();
  items.forEach((b,i)=>{o.position.set(b.x,b.y,b.z);o.scale.set(b.w,b.h,b.d);o.updateMatrix();mesh.setMatrixAt(i,o.matrix);mesh.setColorAt(i,new THREE.Color(b.color));});mesh.computeBoundingSphere();group.add(mesh);
  // Hide facade details with the building in cutaway mode.
  cutaway.push(mesh);
 }
 return {update(t,dt,state){player=state.player;doors.forEach(d=>d.update(dt));}};
}
