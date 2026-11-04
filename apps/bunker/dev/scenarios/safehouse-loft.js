import * as THREE from 'three';
import { safehouse } from '../safehouse.js';
import { buildTransportStreet } from '../transport-street.js';
import { dressTransportInterior } from '../transport-interior.js';
import { VEYR_TRANSPORT as P } from '../safehouse-plans.js';

function build(k,{group,setSolid,say}) {
 const {box,cylinder,rod,mat,glow,tex,picture,floor,walls,windows}=k;
 const steel=mat('#35484b',.65,.3),wood=mat('#7b6750'),concrete=mat('#81877e'),dark=mat('#222c30'),trim=mat('#2c3a3d',.7,.2),brass=mat('#a99566',.55,.3);
 const cutaway=[],lamps=[],interactions=[];
 // Static detail goes in its own group and is batched by material at the end of the build.
 const detail=new THREE.Group();group.add(detail);
 const d=(x0,y0,z0,x1,y1,z1,m)=>box(x0,y0,z0,x1,y1,z1,m,detail);
 const sign=(text,w,h,x,y,z,rot=0)=>picture(tex(1024,128,g=>{
  g.fillStyle='#1c3035';g.fillRect(0,0,1024,128);g.fillStyle='#e1d8bb';g.font='500 43px monospace';g.textAlign='center';g.textBaseline='middle';g.fillText(text,512,64,980);
 }),w,h,x,y,z,rot);
 const brick=new THREE.MeshStandardMaterial({map:tex(256,256,g=>{
  g.fillStyle='#3e4646';g.fillRect(0,0,256,256);
  for(let r=0;r<8;r++)for(let c=-1;c<5;c++){g.fillStyle=['#6e7066','#78796f','#646d68'][(r+c+9)%3];g.fillRect(c*64+(r%2)*32+2,r*32+2,60,28);}
 },[1,1]),roughness:.95});
 brick.map.anisotropy=8;
 // Street and footprint. Ground deliberately has a hole for the occupied basement.
 floor([-60,-30,60,40],[[-6.3,-4.8,6.3,4.8]],mat('#323c3e'),-.04);
 box(-60,-.15,7,60,-.02,13,mat('#1c2429',.3,.3));
 for(let x=-58;x<60;x+=5)if(![-23,23].some(c=>x<c+3&&x+2.5>c-3))box(x,-.019,9.9,x+2.5,-.017,10.02,mat('#aea38a'));
 const lowerFloor=new THREE.MeshStandardMaterial({color:'#697570',roughness:.92,map:tex(256,256,g=>{
  g.fillStyle='#a4aaa3';g.fillRect(0,0,256,256);g.fillStyle='#919b94';
  for(let i=0;i<190;i++){const x=(i*73)%256,y=(i*137)%256;g.fillRect(x,y,2,2);}
  g.strokeStyle='#7d8982';g.lineWidth=2;g.strokeRect(1,1,254,254);
 },[1,1])});lowerFloor.map.anisotropy=8;
 // Office vinyl in half-metre tiles; a plain concrete slab in the garage and the yard (floor UVs are in metres).
 const officeFloor=new THREE.MeshStandardMaterial({roughness:.8,map:tex(256,256,g=>{
  for(let i=0;i<4;i++){g.fillStyle=['#a7a99d','#9c9e93'][(i+(i>>1))%2];g.fillRect((i%2)*128,(i>>1)*128,128,128);}
  g.fillStyle='rgba(58,62,56,.22)';for(let i=0;i<300;i++)g.fillRect((i*89)%256,(i*151)%256,1,1);
  g.strokeStyle='#878a80';g.lineWidth=2;g.strokeRect(0,0,256,256);g.beginPath();g.moveTo(128,0);g.lineTo(128,256);g.moveTo(0,128);g.lineTo(256,128);g.stroke();
 },[1,1])});
 const slab=new THREE.MeshStandardMaterial({roughness:.95,map:tex(256,256,g=>{
  g.fillStyle='#8f938b';g.fillRect(0,0,256,256);
  for(let i=0;i<700;i++){g.fillStyle=i%3?'rgba(66,70,66,.16)':'rgba(176,178,170,.18)';g.fillRect((i*97)%256,(i*61)%256,2,2);}
  g.strokeStyle='rgba(70,74,70,.35)';g.lineWidth=2;g.strokeRect(0,0,256,256);
 },[.25,.25])});
 officeFloor.map.anisotropy=slab.map.anisotropy=8;
 // The office floor is laid around the stairwell right up to both wall faces, so no sliver of floor hangs along
 // either wall above the flight. The stair side wall (x -4.55..-4.35, from z -4.6) rises to floor level: its top is
 // left out of the floor and shows as a concrete kerb at the head of the stairs.
 for(const f of P.floors){
  const material=f.y<0?lowerFloor:f.rect[0]>=6.3?slab:officeFloor,well=f.y===0&&f.holes?.[0];
  if(well){const [x0,z0,x1,z1]=f.rect;for(const r of [[x0,z0,x1,-4.6],[x0,-4.6,-4.55,well[1]],[-4.35,-4.6,x1,well[3]],[x0,well[3],x1,z1]])floor(r,[],material,f.y);}
  else floor(f.rect,f.holes,material,f.y);
 }
 // Oil stains under the parked van and in the open bay.
 const stain=tex(128,128,g=>{const r=g.createRadialGradient(64,64,4,64,64,62);r.addColorStop(0,'rgba(20,24,24,.3)');r.addColorStop(.6,'rgba(20,24,24,.12)');r.addColorStop(1,'rgba(20,24,24,0)');g.fillStyle=r;g.fillRect(0,0,128,128);});
 for(const [x,z,s] of [[16,-1.4,1.5],[10.3,-.2,1.1],[11.2,2.1,.6]]){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s*1.4),new THREE.MeshBasicMaterial({map:stain,transparent:true,depthWrite:false}));
  m.rotation.x=-Math.PI/2;m.position.set(x,.006,z);group.add(m);
 }
 walls(P,concrete,brick);windows(P,steel,new THREE.MeshStandardMaterial({color:'#84999a',transparent:true,opacity:.35,roughness:.25}));
 cutaway.push(box(-6.5,3.2,-10,6.5,3.45,5,steel));
 // A tiled office ceiling under the apartment slab; it hides with the slab in the cutaway.
 const tiles=tex(128,128,g=>{g.fillStyle='#b5b4a9';g.fillRect(0,0,128,128);g.fillStyle='rgba(80,82,76,.16)';for(let i=0;i<140;i++)g.fillRect((i*37)%128,(i*71)%128,1,1);g.strokeStyle='#8c8e86';g.lineWidth=3;g.strokeRect(0,0,128,128);},[1/.6,1/.6]);
 cutaway.push(floor([-6.3,-9.8,6.3,4.8],[],new THREE.MeshStandardMaterial({map:tiles,roughness:.95,side:THREE.BackSide}),3.17));
 // Upper floor underside is split around the stairwell, never sealing the descent, and stops at the wall face.
 for(const r of [[-4.55,-9.8,19.3,4.8],[-6.3,-9.8,-4.55,-4],[-6.3,2,-4.55,4.8]]){
  const underside=floor(r,[],mat('#484f4c'),-.14);underside.material.side=THREE.DoubleSide;cutaway.push(underside);
 }
 // A solid concrete flight down the west wall, wall to wall, so nothing shows beneath it. Step 0 would lie flush
 // with the landing floor (and flicker against it), so the flight starts one step down with a nosing on the edge.
 const ramp=P.ramps[0],steps=24,run=(ramp.to-ramp.from)/steps,rise=(ramp.y1-ramp.y0)/steps,stair=mat('#5c6562'),nosing=mat('#c2ad70'),joint=mat('#6b716a');
 for(let i=1;i<steps;i++){
  const z=ramp.from+run*i,y=ramp.y0+rise*i;
  d(-6.32,ramp.y1,z,-4.53,y,z+run,stair);
  d(-6.3,y+.004,z,-4.55,y+.016,z+.035,nosing);
 }
 d(-6.3,.004,-4.035,-4.6,.016,-4,nosing);
 // In the stair shaft the walls of both storeys meet at slab level: a joint line covers the seam, and the slab's
 // edge over the foot of the flight is closed.
 d(-6.31,-.03,-4,-6.29,.03,2,joint);d(-4.56,-.03,-3.6,-4.54,.03,2,joint);
 d(-6.3,-.14,1.98,-4.55,0,2,concrete);
 // Handrails on both walls, 0.9 m above the nosings, on brackets.
 const pitchAt=z=>ramp.y0+(ramp.y1-ramp.y0)*(z-ramp.from)/(ramp.to-ramp.from);
 for(const [x,wall,from] of [[-6.22,-6.3,-4.25],[-4.63,-4.55,-3.5]]){
  rod([x,pitchAt(from)+.9,from],[x,pitchAt(2.3)+.9,2.3],.022,brass,detail);
  for(let z=from+.25;z<2.3;z+=1.6)d(Math.min(x,wall),pitchAt(z)+.85,z-.02,Math.max(x,wall),pitchAt(z)+.88,z+.02,steel);
 }
 // A bulkhead light near the foot of the stairs, which are walled in below the ground floor.
 d(-6.3,-.95,1.45,-6.22,-.75,1.75,trim);
 const bulkhead=glow('#e8dcb8');d(-6.22,-.92,1.48,-6.2,-.78,1.72,bulkhead);
 const stairLight=new THREE.PointLight('#e8dcb8',8,6,1.6);stairLight.position.set(-5.7,-.9,1.4);group.add(stairLight);
 lamps.push({light:stairLight,on:8,out:8});
 // Restrained business frontage; no safehouse markings on the street.
 sign('VEYR TRANSPORT',4.8,.6,0,2.95,5.04);
 sign('VISITS BY ARRANGEMENT',1.2,.18,2.7,1.75,4.94);
 sign('Please contact the office',1.2,.15,2.7,1.5,4.94);
 sign('DISPATCH / STAFF ONLY',1.7,.24,1.5,2.66,.115);
 // The way down, on the wall above the top of the stairs.
 sign('LOWER STORES ↓',1.5,.24,-6.28,2.3,-4.3,Math.PI/2);
 // Reception counter, waiting bench and dispatch desks have leg space. The rail, pallet and cages are dressed below.
 for(const f of P.furniture){
  const [x,y,z,X,Y,Z]=f.box;
  if(['rail','pallet','cageA','cageB'].includes(f.id))continue;
  if(['reception','dispatch','radioDesk','briefing','opsDesk','askTable'].includes(f.id)){
   box(x,Y-.09,z,X,Y,Z,wood);
   for(const a of [x+.08,X-.16])for(const b of [z+.08,Z-.16])box(a,y,b,a+.08,Y-.09,b+.08,steel);
  }else if(f.id.includes('Seat')){
   box(x,Y-.09,z,X,Y,Z,steel);
   for(const a of [x+.03,X-.08])for(const b of [z+.03,Z-.08])box(a,y,b,a+.05,Y-.09,b+.05,steel);
  }else if(f.id==='stores'||f.id==='files'){
   for(const a of [x,X-.07])for(const b of [z,Z-.07])box(a,y,b,a+.07,Y,b+.07,steel);
   for(let h=y+.15;h<Y;h+=.6)box(x,h,z,X,h+.06,Z,wood);
  }else box(...f.box,f.id==='cargo'?wood:steel);
 }
 box(-3.7,0,1.72,-.9,.95,1.82,steel);
 sign('VEYR / OFFICE',2,.27,-2.3,.65,1.84);
 for(let z=1.3;z<3.5;z+=.8){box(4.95,.5,z,5.85,.6,z+.65,mat('#706f58'));box(5.8,.5,z,5.95,1.05,z+.65,steel);}
 for(const [x,y,z] of [[-2,1.05,1.4],[-1,.8,-4.1],[4.7,-2.4,-4.1]]){
  box(x-.24,y,z-.16,x+.24,y+.04,z+.16,mat('#d3ceb6'));
  box(x+.4,y,z-.2,x+.8,y+.3,z+.1,dark);
 }
 // Rear parcel shelves and basement supplies.
 // Use the shelves already built from the plan; parcels sit on their top faces.
 for(let i=0;i<9;i++)box(3.85+(i%3)*.7,.21+Math.floor(i/3)*.6,-4.58,4.4+(i%3)*.7,.63+Math.floor(i/3)*.6,-4.12,mat('#96876b'));
 box(2.3,-2.4,-4.5,3.5,-1.95,-4,steel);
 for(let i=0;i<5;i++)box(2.4+i*.2,-2.22,-3.98,2.47+i*.2,-2.15,-3.95,glow('#a5d9b1'));
 sign('VEYR CROSSINGS / NIGHT DISPATCH',3.2,.35,-1.4,-.8,-9.75);
 // Briefing papers, shipping labels and a small route board give the workspace a purpose.
 const routes=tex(512,256,g=>{g.fillStyle='#243a3c';g.fillRect(0,0,512,256);g.strokeStyle='#a7b9a2';g.lineWidth=3;
  for(let i=0;i<5;i++){g.beginPath();g.moveTo(40,30+i*40);g.lineTo(230,120);g.lineTo(470,30+i*40);g.stroke();}
  g.fillStyle='#d0b880';for(const [x,y] of [[40,30],[230,120],[470,190]]){g.fillRect(x-6,y-6,12,12);}
 });picture(routes,2.8,1.4,-1.4,-1.9,-9.74);
 for(let i=0;i<4;i++)box(18.4,-2.99+i*.6,1,19,-2.64+i*.6,1.8,mat('#8a8169'));
 // A door is both visible and solid while closed. Swing into clear wall space.
 function door(id,x,z,w,label,level=0){
  // A casing proud of both wall faces covers the reveals; the leaf fills the opening up to the head.
  for(const [a,b] of [[x-.08,x+.004],[x+w-.004,x+w+.08]])d(a,level,z-.145,b,level+2.47,z+.145,trim);
  d(x-.08,level+2.396,z-.145,x+w+.08,level+2.47,z+.145,trim);
  const hinge=new THREE.Group();hinge.position.set(x,level,z);group.add(hinge);
  box(0,0,-.045,w,2.388,.045,steel,hinge);
  box(w-.2,1,-.09,w-.08,1.07,.09,mat('#c0b397'),hinge);
  let open=false;
  const sync=()=>setSolid(id,open?[x-.06,level,z-w,x+.06,level+2.35,z]:[x,level,z-.06,x+w,level+2.35,z+.06]);sync();
  interactions.push({at:[x+w/2,z],y:level,r:1.8,label:()=>`${open?'Close':'Open'} ${label}`,action(){open=!open;hinge.rotation.y=open?Math.PI/2:0;sync();}});
 }
 door('front',-1,4.9,1.4,'office door');door('staff',.8,0,1.4,'staff door');door('interview',11,-3,1.4,'interview room door',-3.2);
 interactions.push({at:[-2.3,2.35],label:()=>'Read appointment book',action(){say('OFFICE BOOK','Visits by arrangement. Leave a name and a contact number. The next page has been removed.');}});
 // Pools of warm office light, cooler dispatch and a concealed basement workspace.
 for(const [x,y,z,color,intensity] of [[0,2.8,2.5,'#ffe3b0',22],[1,2.8,-2.5,'#d2e7e2',25],[0,-.45,2,'#d5c5a6',22],[2,-.45,-3,'#e4d7b1',23],[3,2.8,-7,'#d2e7e2',25],[5,-.45,-7,'#b5d6df',25],[15,-.45,-6,'#e4d7b1',25],[14,-.45,2,'#e3c598',20]]){
  const bulb=glow(color);box(x-.6,y,z-.08,x+.6,y+.05,z+.08,bulb);
  const ceiling=y<0?-.14:3.2;
  for(const a of [x-.45,x+.45])box(a-.025,y+.05,z-.025,a+.025,ceiling,z+.025,steel);
  const light=new THREE.PointLight(color,intensity,10,1.6);light.position.set(x,y-.15,z);group.add(light);
  lamps.push({light,on:intensity,out:y<0?intensity:2,bulb,color:new THREE.Color(color)});
 }
 // Direct staff access from the garage, sliding along the partition.
 const staffPanel=box(6.33,0,-3.8,6.47,2.4,-2.3,steel);let accessOpen=false;
 const accessSolid=()=>setSolid('garageStaff',accessOpen?null:[6.33,0,-3.8,6.47,2.4,-2.3]);accessSolid();
 interactions.push({at:[6.4,-3.05],r:1.8,label:()=>`${accessOpen?'Close':'Open'} dispatch access`,action(){accessOpen=!accessOpen;staffPanel.position.z=accessOpen?-4.65:-3.05;accessSolid();}});
 sign('STAFF ACCESS',1.5,.25,6.52,2.7,-3.05,Math.PI/2);
 sign('INTERVIEW 01',2,.3,15,-.55,-2.87);
 // Two staffed terminals; keyboards match seated hand targets.
 for(const x of [3,6]){
  box(x-.3,-2.4,-8.35,x+.3,-2.38,-7.95,steel);
  box(x-.055,-2.38,-8.28,x+.055,-2.15,-8.21,steel);
  box(x-.55,-2.32,-8.3,x+.55,-1.65,-8.18,steel);
  const screen=tex(512,256,g=>{g.fillStyle='#10272f';g.fillRect(0,0,512,256);g.fillStyle='#a3d9c6';g.font='20px monospace';g.fillText(x===3?'COMMS / OUTPOST 07':'DISPATCH / VEYR',18,32);g.fillStyle='#8da9ac';g.font='13px monospace';g.fillText('NIGHT WATCH     02:14     LINK OK',18,54);
   for(let i=0;i<4;i++){const y=85+i*32;g.fillStyle='#24434b';g.fillRect(18,y-16,476,26);g.fillStyle='#b9c5b9';g.fillText((x===3?['OUTPOST 07','NORTH CROSSING','RIVER RELAY','VEYR OFFICE']:['MANIFEST 024','MANIFEST 025','GARAGE 01','GARAGE 02'])[i],28,y);g.fillStyle=i===1?'#c5a876':'#8ec8aa';g.fillText((x===3?['ONLINE','MONITORED','ONLINE','STANDBY']:['CLEARED','HOLD','AVAILABLE','OCCUPIED'])[i],330,y);}
   g.strokeStyle='#82b3ad';g.beginPath();for(let i=0;i<470;i++){const y=231+Math.sin(i*.13)*Math.sin(i*.04)*7;i?g.lineTo(20+i,y):g.moveTo(20+i,y);}g.stroke();});
  picture(screen,1,.55,x,-1.98,-8.16,0,{lit:true});box(x-.4,-2.4,-7.75,x+.4,-2.36,-7.4,dark);
 }
 // Chair backs and thin legs instead of featureless seating blocks.
 for(const [x,z] of [[3,-6.9],[6,-6.9],[14.7,-8.1],[14.7,-5.4]]){
  const back=z===-8.1?-.32:.24;
  box(x-.3,-2.68,z+back,x+.3,-1.95,z+back+.08,steel);
 }
 // An unoccupied interview room: paperwork, recording equipment and a wall clock.
 box(14.2,-2.39,-6.9,14.8,-2.37,-6.45,mat('#d6d0bb'));
 box(15.1,-2.39,-7.1,15.55,-2.27,-6.8,dark);
 box(15.16,-2.265,-6.97,15.2,-2.25,-6.93,glow('#b89a66'));
 const clock=tex(256,256,g=>{g.fillStyle='#263438';g.fillRect(0,0,256,256);g.strokeStyle='#dad6bf';g.lineWidth=5;g.beginPath();g.arc(128,128,105,0,Math.PI*2);g.stroke();for(let i=0;i<12;i++){const a=i*Math.PI/6;g.beginPath();g.moveTo(128+87*Math.sin(a),128-87*Math.cos(a));g.lineTo(128+96*Math.sin(a),128-96*Math.cos(a));g.stroke();}g.beginPath();g.moveTo(128,128);g.lineTo(163,96);g.moveTo(128,128);g.lineTo(195,121);g.stroke();});
 picture(clock,.6,.6,15,-.65,-9.74);
 // Pinboards, forms, office plants and shelving make the public face believable.
 for(const x of [-3.8,5.9]){
  cylinder(x,0,3.9,.23,.45,mat('#786a55'));for(let i=0;i<5;i++){const leaf=box(x-.04,.4,3.85,x+.04,1.2+i*.06,3.95,mat('#465e46'));leaf.rotation.z=(i-2)*.16;}
 }
 sign('VEYR / SHIPPING SERVICES',2.4,.35,-3,2.65,4.74,Math.PI);
 for(let i=0;i<4;i++)box(-2.8+i*.45,.8,-4.5,-2.48+i*.45,1.13,-4.1,mat(['#6f8273','#8e8164'][i%2]));
 const pinboard=tex(512,256,g=>{g.fillStyle='#6e624a';g.fillRect(0,0,512,256);for(let i=0;i<6;i++){g.fillStyle='#d4cfb8';g.fillRect(20+i%3*165,20+Math.floor(i/3)*120,130,90);g.fillStyle='#656e69';for(let j=0;j<5;j++)g.fillRect(30+i%3*165,35+Math.floor(i/3)*120+j*12,95,3);}});
 picture(pinboard,2.7,1.3,-1.3,1.9,-9.75);

 // --- Ground floor finish: skirting and street-window blinds -------------------------------------------------
 // Each strip sinks 1-2 cm into its wall so no face lies flush with the wall surface.
 const skirt=mat('#2b3638',.8);
 for(const [x0,z0,x1,z1] of [
  [-4.35,4.75,-1.08,4.79],[.48,4.75,6.3,4.79],   // front wall, either side of the door
  [-4.37,.1,-4.33,4.75],[6.28,.1,6.32,4.75],     // reception side walls
  [-4.35,.07,.72,.12],[2.28,.07,6.3,.12],        // partition, reception side
  [-4.35,-.12,.72,-.07],[2.28,-.12,6.3,-.07],    // partition, dispatch side
  [-6.3,-9.79,6.3,-9.75],[-6.32,-9.75,-6.28,-4], // back wall; west wall up to the stairs
  [6.28,-9.75,6.32,-3.85],[6.28,-2.25,6.32,-.1], // east wall, either side of the garage access
  [-4.37,-3.6,-4.33,-.1],                        // stair partition, dispatch side
 ])d(x0,0,z0,x1,.09,z1,skirt);
 // Venetian blinds two-thirds down the street windows: the office stays ordinary from outside.
 const slat=mat('#c9c5b2',.75);
 for(const [a,b] of [[-4,-2.6],[2,3.4]]){
  d(a-.04,2.36,4.69,b+.04,2.43,4.79,trim);
  for(let y=2.32;y>1.7;y-=.06)d(a+.02,y-.012,4.705,b-.02,y,4.765,slat);
  d(a+.02,1.64,4.7,b-.02,1.68,4.77,trim);
  d(b-.1,1.3,4.73,b-.09,2.36,4.74,slat);
 }

 // --- Reception: the clerk's chair, a clock, the company poster, a side table by the waiting bench ------------
 const cloth=mat('#3f5458');
 d(-2.33,.08,.57,-2.27,.46,.63,steel);d(-2.62,.02,.575,-1.98,.06,.625,steel);d(-2.325,.02,.28,-2.275,.06,.92,steel);
 d(-2.56,.46,.36,-2.04,.54,.86,cloth);d(-2.53,.6,.3,-2.07,1.06,.36,cloth);d(-2.32,.5,.33,-2.28,.62,.38,steel);
 setSolid('receptionChair',[-2.62,0,.28,-1.98,1.06,.92]);
 picture(clock,.42,.42,-4.33,2.45,1.45,Math.PI/2);
 const poster=tex(512,384,g=>{
  g.fillStyle='#22383c';g.fillRect(0,0,512,384);
  g.fillStyle='#4f7480';g.beginPath();g.moveTo(300,0);g.bezierCurveTo(220,120,380,220,280,384);g.lineTo(330,384);g.bezierCurveTo(430,220,270,120,350,0);g.fill();
  g.strokeStyle='#c9ac72';g.lineWidth=6;g.beginPath();g.moveTo(20,300);g.lineTo(200,230);g.lineTo(420,170);g.lineTo(500,90);g.stroke();
  g.fillStyle='#e2d9bd';for(const [x,y] of [[200,230],[420,170]]){g.beginPath();g.arc(x,y,9,0,7);g.fill();}
  g.font='bold 34px monospace';g.fillText('VEYR TRANSPORT',24,52);
  g.font='18px monospace';g.fillStyle='#b9c2b6';g.fillText('Riverside · Northline · Frostford Road',24,84);g.fillText('Freight & parcels since 1961',24,356);
 });
 d(-4.35,1.3,2.15,-4.335,2.25,3.45,trim);picture(poster,1.2,.9,-4.33,1.775,2.8,Math.PI/2);
 const advert=tex(384,512,g=>{
  const sky=g.createLinearGradient(0,0,0,512);sky.addColorStop(0,'#2d4a55');sky.addColorStop(.6,'#c79a68');sky.addColorStop(1,'#3a3a34');g.fillStyle=sky;g.fillRect(0,0,384,512);
  g.fillStyle='#1d2427';g.fillRect(0,330,384,182);g.fillRect(0,245,384,10);for(let x=10;x<384;x+=60)g.fillRect(x,250,8,80);
  g.fillStyle='#d8d2bd';g.fillRect(120,280,120,50);g.fillRect(240,295,40,35);
  g.fillStyle='#1d2427';for(const x of [140,215,262]){g.beginPath();g.arc(x,332,10,0,7);g.fill();}
  g.fillStyle='#efe6cc';g.font='bold 40px monospace';g.fillText('VEYR',24,70);g.font='20px monospace';g.fillText('on time, every crossing',24,104);
 });
 d(6.282,1.25,1.75,6.3,2.55,2.75,trim);picture(advert,.9,1.2,6.278,1.9,2.25,-Math.PI/2);
 d(5.1,.43,.35,5.8,.47,.95,wood);for(const [a,b] of [[5.13,.38],[5.73,.38],[5.13,.88],[5.73,.88]])d(a,0,b,a+.04,.43,b+.04,steel);
 d(5.2,.47,.45,5.5,.49,.8,mat('#b8b29a'));d(5.35,.49,.55,5.65,.505,.88,mat('#7c8d86'));
 setSolid('sideTable',[5.1,0,.35,5.8,.5,.95]);

 // --- Rear dispatch: a wrapped pallet, roll cages of parcels, a sack truck, tonight's board and a clock --------
 const card=[mat('#9a8664'),mat('#8a7a5c'),mat('#a89571')],at=id=>P.furniture.find(f=>f.id===id).box;
 {
  const [x,,z,X,,Z]=at('pallet'),hw=(X-x-.04)/2,hd=(Z-z-.04)/2;
  for(let i=0;i<3;i++)d(x+.03,0,z+.05+i*(Z-z-.2)/2,X-.03,.1,z+.15+i*(Z-z-.2)/2,wood);
  d(x,.1,z,X,.14,Z,wood);
  for(let i=0;i<8;i++){const a=x+.02+(i%2)*hw,b=z+.02+((i>>1)%2)*hd,y=.14+(i>>2)*.53;d(a+.01,y,b+.01,a+hw-.01,y+.52,b+hd-.01,card[i%3]);}
  d(x+.005,.14,z+.005,X-.005,1.24,Z-.005,new THREE.MeshStandardMaterial({color:'#dfe8e8',transparent:true,opacity:.22,roughness:.15,depthWrite:false}));
 }
 for(const id of ['cageA','cageB']){
  const [x,,z,X,Y,Z]=at(id);
  for(const [a,b] of [[x,z],[X-.03,z],[x,Z-.03],[X-.03,Z-.03]]){d(a,.08,b,a+.03,Y,b+.03,steel);d(a-.005,0,b-.005,a+.035,.08,b+.035,dark);}
  d(x,.1,z,X,.13,Z,steel);
  for(let y=.4;y<Y;y+=.3){d(x,y,Z-.025,X,y+.015,Z-.01,steel);d(x,y,z,x+.015,y+.015,Z,steel);d(X-.015,y,z,X,y+.015,Z,steel);}
  for(let a=x+.15;a<X-.05;a+=.15)d(a,.13,Z-.022,a+.012,Y,Z-.012,steel);
  for(let i=0;i<5;i++){const c=i%2,y=.13+(i>>1)*.33;d(c?x+.42:x+.06,y,z+.08,c?X-.06:x+.38,y+.3-.04*(i%3),Z-.1,card[(i+1)%3]);}
 }
 const sackTruck=new THREE.Group();sackTruck.position.set(3.2,0,-9.5);sackTruck.rotation.x=-.18;group.add(sackTruck);
 for(const a of [-.17,.15])box(a,.05,-.02,a+.02,1.2,.02,steel,sackTruck);
 for(let y=.3;y<1.1;y+=.25)box(-.17,y,-.015,.17,y+.02,.015,steel,sackTruck);
 box(-.19,0,-.02,.19,.03,.22,steel,sackTruck);
 for(const a of [-.2,.2]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.05,12),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(a,.11,-.08);sackTruck.add(wheel);}
 const board=tex(512,256,g=>{
  g.fillStyle='#e7e6dc';g.fillRect(0,0,512,256);
  g.fillStyle='#24424a';g.font='bold 22px monospace';g.fillText('DISPATCH / NIGHT SHIFT',16,32);g.font='16px monospace';
  [['024','RIVERSIDE > NORTHLINE','BAY 01','02:40'],['025','FROSTFORD ROAD','BAY 02','03:15'],['026','RAIL YARD (COLLECT)','--','HOLD'],['027','NORTH CROSSING','BAY 01','05:30']].forEach((r,i)=>{
   const y=70+i*40;g.fillStyle=r[3]==='HOLD'?'#a4542f':'#2f3f45';r.forEach((c,j)=>g.fillText(c,[16,70,330,430][j],y));g.fillStyle='rgba(47,63,69,.35)';g.fillRect(16,y+12,480,1);
  });
  g.strokeStyle='#2f6b4f';g.lineWidth=3;g.beginPath();g.moveTo(482,60);g.lineTo(490,70);g.lineTo(504,50);g.stroke();
 });
 d(-3.25,1.05,-.125,-.95,2.25,-.08,trim);picture(board,2.2,1.1,-2.1,1.65,-.13,Math.PI);
 picture(clock,.42,.42,1.5,2.8,-.11,Math.PI);

 // Static detail: one draw call per material.
 const batches=new Map();
 for(const m of [...detail.children])if(m.isMesh&&m.geometry===k.cube){const list=batches.get(m.material)||[];list.push(m);batches.set(m.material,list);}
 for(const [material,meshes] of batches)if(meshes.length>2){
  const batch=new THREE.InstancedMesh(k.cube,material,meshes.length);
  meshes.forEach((m,i)=>{m.updateMatrix();batch.setMatrixAt(i,m.matrix);detail.remove(m);});batch.computeBoundingSphere();detail.add(batch);
 }
 dressTransportInterior({group,plan:P,interactions,say});
 const street=buildTransportStreet(k,{group,setSolid,say,sign,brick,cutaway,interactions,plan:P});
 return {cutaway,lamps,interactions,update:street.update,radio:[3,-3.7],radioY:-3.2};
}

// Preserve the existing scene/address IDs so saved links still open the replacement.
export default safehouse({
 id:'safehouse-loft',title:'Veyr Transport',summary:'A rented ground-floor transport office and garage beneath Drakenburg apartments. Behind the staff door: dispatch, a guarded stairwell and basement operations.',
 plan:P,build,seed:41,civilian:true,weatherLabel:'Freezing rain · 1 °C',fog:['#192329',35,110],ambient:.85,key:.4,floorY:-3.6,precip:'rain',roofY:17,precipBottom:0,firstPass:55,
 views:[{label:'Inside',x:1.8,z:3.7,yaw:-2.6,pitch:0,eye:1.7,floor:0},{label:'Rear dispatch',x:1.5,z:-2.4,yaw:-2.5,pitch:0,eye:1.7,floor:0},{label:'Basement',x:-2.5,z:2,yaw:2.5,pitch:0,eye:1.7,floor:-3.2},{label:'Operations',x:4.5,z:-4.8,yaw:Math.PI,pitch:-.06,eye:1.7,floor:-3.2},{label:'Interview',x:17.6,z:-4.4,yaw:-2.5,pitch:0,eye:1.7,floor:-3.2},{label:'Street',x:5,z:14,yaw:Math.PI,pitch:.22,eye:1.7,floor:0},{label:'Garage',x:8.6,z:3.4,yaw:2.45,pitch:-.04,eye:1.7,floor:0},{label:'Cutaway',x:0,z:12,yaw:Math.PI,pitch:-1,eye:17}],
 callsign:'Veyr',alertCall:'Patrol outside. Keep the office quiet. Hold your posts.',clearCall:'Street is clear. Carry on.',hush:'Keep your voice down. They are still outside.',
 text:{routine:'Visits by arrangement. Reception in front; staff dispatch and basement beyond the internal door.',warning:'A patrol is approaching the office.',road:'Patrol passing. Rear staff hold position.',gone:'Waiting for the street to clear.'},
 lines:{tomas:['Is anyone on the desk tonight? I was told the parcel would be ready by six.','My van is round the corner with the engine running. The diesel will not wait all night.','I only sign for it. Whatever is inside is not my business.'],ilya:['Rear access is secure. Garage deliveries come through the staff door.'],nash:['Interview room is clear. Observation windows face operations.'],oren:['Checking the next dispatch window. No changes from the crossing.'],marek:['The office takes appointments. The rear is staff only.','Stairs are at the far left, behind dispatch. Keep the door closed.'],piet:['Lower stores. The passage stays clear.','We remain downstairs when the patrol passes.'],vesna:['The public ledger only lists appointments. Dispatch records stay here.','Outpost Seven is listening. Use the set if you need a status report.']},
 chatter:['…Veyr, Outpost Seven. Routine check. Over…','…North Crossing unchanged. Await the next report…'],
});
