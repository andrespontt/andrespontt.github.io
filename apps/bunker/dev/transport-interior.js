import * as THREE from 'three';
import { createBuilder } from './safehouse.js';

// Dressing stays separate from the walkable plan: large furniture lives in plan.furniture.
export function dressTransportInterior({ group, plan, interactions, say }) {
 const room=new THREE.Group();group.add(room);
 const {box,cylinder,mat,glow,tex,picture,cube}=createBuilder(room);
 const ink=mat('#182d34'),metal=mat('#46575a',.65,.3),brass=mat('#b8a57a',.6,.2),paper=mat('#d2ccb4'),rubber=mat('#20282b'),cloth=mat('#465c62');
 const greenLED=glow('#7eae9b'),amberLED=glow('#bba274');
 const label=(text,w,h,x,y,z,rotation=0)=>picture(tex(512,96,g=>{g.fillStyle='#1c3036';g.fillRect(0,0,512,96);g.fillStyle='#d9cda9';g.font='32px monospace';g.textAlign='center';g.textBaseline='middle';g.fillText(text,256,48,480);}),w,h,x,y,z,rotation);
 const cable=(points,r=.016,color='#252e2e')=>{const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));room.add(new THREE.Mesh(new THREE.TubeGeometry(curve,12,r,5,false),mat(color)));};
 const cup=(x,y,z)=>{cylinder(x,y,z,.055,y+.12,mat('#b7b8a4'));cylinder(x,y+.119,z,.043,y+.122,mat('#35271c'));const handle=new THREE.Mesh(new THREE.TorusGeometry(.038,.009,5,10),mat('#b7b8a4'));handle.position.set(x+.065,y+.065,z);room.add(handle);};
 // A dark painted plinth and real skirting give the concrete shell a human scale.
 box(-6.25,-3.19,-9.77,19.25,-2.25,-9.73,ink);
 box(-6.25,-3.19,4.71,19.25,-2.25,4.77,ink);
 box(19.23,-3.19,-9.7,19.28,-2.25,4.7,ink);
 box(-6.28,-3.19,2.5,-6.23,-2.25,4.7,ink);
 // The walls that close in the underside of the stairs.
 box(-4.36,-3.19,-4.6,-4.31,-2.25,2.4,ink);
 box(-6.3,-3.19,-4.64,-4.315,-2.25,-4.59,ink);
 for(const z of [-9.7,4.68])box(-6.2,-3.19,z,19.2,-3.06,z+.025,metal);
 box(19.2,-3.19,-9.67,19.23,-3.06,4.67,metal);
 box(9.86,-3.19,-9.7,9.9,-2.25,-3.12,ink);
 for(const [a,b] of [[10.12,10.95],[12.45,19.2]])box(a,-3.19,-2.89,b,-2.25,-2.85,ink);
 // Ceiling services: ducts, a cable tray and clamps, all attached to the slab.
 box(-3.5,-.48,-8.9,9.4,-.16,-8.5,metal);
 for(let x=-3;x<9.5;x+=1.6){box(x,-.5,-8.93,x+.045,-.14,-8.47,brass);}
 box(7.5,-.36,-8.4,7.7,-.16,3.9,ink);
 for(let z=-8;z<4;z+=1.5)box(7.46,-.39,z,7.74,-.14,z+.035,metal);
 for(const x of [7.55,7.62])cable([[x,-.34,-8.3],[x,-.34,-2],[x,-.34,3.8]],.018,'#8e7958');
 // Sealed utility access panels and air grilles on the rear wall.
 for(const x of [-4.3,18.2]){
  box(x-.45,-1.3,-9.75,x+.45,-.65,-9.65,metal);
  for(let y=-1.24;y<-.7;y+=.09)box(x-.38,y,-9.64,x+.38,y+.025,-9.625,rubber);
 }
 // A framed regional board replaces the two touching operations signs.
 const map=tex(1024,512,g=>{
  g.fillStyle='#172e37';g.fillRect(0,0,1024,512);
  g.strokeStyle='#2d4750';g.lineWidth=1;for(let x=0;x<1024;x+=40){g.beginPath();g.moveTo(x,0);g.lineTo(x,512);g.stroke();}for(let y=0;y<512;y+=40){g.beginPath();g.moveTo(0,y);g.lineTo(1024,y);g.stroke();}
  g.fillStyle='#5c7378';g.beginPath();g.moveTo(0,0);g.lineTo(380,0);g.lineTo(310,150);g.lineTo(190,240);g.lineTo(0,180);g.fill();
  g.strokeStyle='#b6c3c0';g.lineWidth=3;for(let i=0;i<5;i++){g.beginPath();g.moveTo(10,35+i*24);g.lineTo(120,10+i*25);g.lineTo(250,65+i*21);g.stroke();}
  g.strokeStyle='#547f8b';g.lineWidth=26;g.beginPath();g.moveTo(600,0);g.bezierCurveTo(430,160,740,270,580,512);g.stroke();
  g.fillStyle='#526467';for(let x=700;x<970;x+=45)for(let y=150;y<370;y+=40)g.fillRect(x,y,30,25);
  g.strokeStyle='#c1a570';g.lineWidth=4;g.beginPath();g.moveTo(180,100);g.lineTo(340,300);g.lineTo(620,300);g.lineTo(825,250);g.stroke();
  g.fillStyle='#a6d6bd';for(const [x,y] of [[180,100],[340,300],[620,300],[825,250]]){g.beginPath();g.arc(x,y,8,0,Math.PI*2);g.fill();}
  g.font='19px monospace';g.fillText('OUTPOST 07',200,94);g.fillText('NORTH CROSSING',330,350);g.fillText('DRAKENBURG',740,410);g.fillStyle='#dda57f';g.fillText('VEYR / SAFE ROUTE',700,120);
  g.fillStyle='#d9d3b8';g.font='22px monospace';g.fillText('OPERATIONS 07     /     NIGHT WATCH',28,470);
 });
 box(1.45,-2.18,-9.74,7.55,-.4,-9.62,ink);
 picture(map,5.8,1.5,4.5,-1.29,-9.605,0,{lit:true});
 label('VEYR  /  COMMUNICATIONS & DISPATCH',4.8,.16,4.5,-.31,-8.46);
 interactions.push({at:[4.5,-6.4],y:-3.2,r:2.3,label:()=>'Review operations board',action(){say('NIGHT WATCH','Outpost 07 is listening. North Crossing: monitored. Drakenburg route: appointment traffic only. Next check-in at 02:30.');}});
 // Desk accessories and cable runs. No objects sit beyond the desktop footprint.
 for(const x of [3,6]){
  box(x-.48,-2.399,-7.92,x+.48,-2.394,-7.34,rubber);
  cup(x+.8,-2.4,-7.65);
  box(x-.8,-2.4,-8.2,x-.61,-2.1,-7.9,ink);
  for(let i=0;i<3;i++)box(x-.78,-2.37+i*.08,-7.89,x-.65,-2.345+i*.08,-7.88,greenLED);
  cable([[x,-2.2,-8.32],[x,-2.8,-8.42],[x,-3.184,-8.8]]);
  cable([[x,-3.184,-8.8],[x+.4,-3.184,-9.2],[x+1,-3.184,-9.65]]);
  box(x-.27,-2.675,-7.17,x+.27,-2.62,-6.67,cloth);
  box(x-.27,-2.59,-6.72,x+.27,-2.02,-6.665,cloth);
 }
 // Server fronts: distinct panels, vents and status lights, not a solid featureless box.
 for(const id of ['serverA','serverB']){
  const [x,y,z,X,Y,Z]=plan.furniture.find(f=>f.id===id).box;
  for(let row=0;row<5;row++){
   const h=y+.25+row*.35;box(x+.07,h,Z+.005,X-.07,h+.28,Z+.045,rubber);
   for(let j=0;j<4;j++)box(x+.13+j*.09,h+.09,Z+.046,x+.17+j*.09,h+.13,Z+.054,j===3?amberLED:greenLED);
   box(X-.19,h+.05,Z+.05,X-.14,h+.23,Z+.075,metal);
  }
  label(id==='serverA'?'COMMS / A':'RELAY / B',.65,.14,(x+X)/2,Y-.15,Z+.055);
 }
 // A briefing surface that looks used: paper map, folders, pencil and numbered markers.
 const tableMap=picture(map,1.5,.95,.2,-2.385,0);tableMap.rotation.x=-Math.PI/2;
 box(.98,-2.4,-.5,1.45,-2.37,.12,mat('#8c7753'));box(1.02,-2.37,-.46,1.4,-2.36,.07,paper);
 for(const [x,z] of [[-.2,-.12],[.35,.1],[.7,-.2]])cylinder(x,-2.38,z,.035,-2.29,brass);
 box(-.63,-2.4,.45,-.3,-2.32,.65,ink);cup(1.2,-2.4,.5);
 for(const [x,X,back] of [[-1.65,-1.1,-1.7],[2,2.55,2.55]]){
  box(x+.025,-2.68,-.325,X-.025,-2.62,.225,cloth);
  box(back,-2.68,-.35,back+.055,-2.04,.25,metal);
 }
 interactions.push({at:[.4,1.4],y:-3.2,r:1.5,label:()=>'Read the shift briefing',action(){say('SHIFT BRIEF','Keep the public office ordinary. Four posts remain staffed. Garage deliveries use rear dispatch. Do not leave manifests upstairs.');}});
 // Opposite the work area: lockers, a modest rest bench and an overnight coffee station.
 for(let x=3.05;x<5.9;x+=.7){
  box(x,-3.12,3.96,x+.65,-1.17,4.01,metal);
  for(let y=-1.6;y< -1.25;y+=.08)box(x+.09,y,3.945,x+.55,y+.02,3.96,rubber);
  box(x+.52,-2.2,3.92,x+.56,-1.98,3.96,brass);
 }
 label('PERSONAL KIT',2.4,.22,4.45,-.85,4.7,Math.PI);
 box(8.4,-2.7,4.08,10.4,-2.62,4.6,cloth);box(8.4,-2.62,4.59,10.4,-2.02,4.68,cloth);
 const counter=plan.furniture.find(f=>f.id==='breakCounter').box;
 box(counter[0],-2.35,counter[2],counter[3],-2.3,counter[5],mat('#968773'));
 box(11.3,-2.3,4.08,11.8,-1.72,4.5,metal);box(11.35,-2.05,4.02,11.75,-1.8,4.08,rubber);
 cylinder(11.55,-2.3,4.02,.1,-2.12,rubber);
 for(const x of [12.2,12.5,12.8])cup(x,-2.3,4.18);
 box(13.45,-2.3,4.08,14.4,-2.15,4.5,mat('#8e7454'));
 label('NIGHT SHIFT / LEAVE IT READY',3,.22,13,-1.38,4.7,Math.PI);
 interactions.push({at:[12,3.2],y:-3.2,r:1.5,label:()=>'Pour a coffee',action(){say('NIGHT SHIFT','Still warm. Someone has written “back before sunrise” on the next shift’s note.');}});
 // Interview room: acoustic panels, a visible recorder lead and a wall-mounted camera.
 for(const x of [12.8,14.7,16.6]){
  box(x-.6,-2.17,-9.72,x+.6,-1.05,-9.64,cloth);
  for(let a=x-.48;a<x+.5;a+=.16)box(a,-2.08,-9.63,a+.025,-1.14,-9.615,ink);
 }
 box(18.93,-.55,-8.9,19.3,-.49,-8.8,metal);
 box(18.8,-.72,-9,19.02,-.5,-8.65,ink);
 cylinder(18.9,-.74,-8.78,.06,-.72,rubber);
 cable([[15.3,-2.26,-7.12],[15.8,-2.4,-7.38],[15.9,-3.188,-7.5]],.012);
 cable([[15.9,-3.188,-7.5],[17.1,-3.188,-9.3],[18.9,-3.188,-9.6]],.012);
 // Public reception: a framed timetable, doormat, counter telephone and desk lamp.
 box(-1.25,.001,3.55,.65,.018,4.7,rubber);
 for(let z=3.65;z<4.65;z+=.13)box(-1.15,.019,z,.55,.022,z+.035,metal);
 box(-3.6,1.05,1.2,-3.2,1.16,1.6,ink);box(-3.64,1.16,1.25,-3.16,1.22,1.35,rubber);
 cylinder(-1.1,1.05,1.45,.12,1.08,metal);cylinder(-1.1,1.08,1.45,.018,1.5,metal);box(-1.25,1.5,1.3,-.95,1.56,1.6,metal);box(-1.23,1.49,1.32,-.97,1.5,1.58,glow('#d9b57e'));
 label('OFFICE HOURS / BY ARRANGEMENT',2.5,.24,-2.3,2.2,.115);
 // Pack repeated static boxes into material batches to keep the detailing inexpensive.
 const contact=tex(64,64,g=>{const fade=g.createRadialGradient(32,32,3,32,32,32);fade.addColorStop(0,'rgba(0,0,0,.28)');fade.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=fade;g.fillRect(0,0,64,64);});
 for(const guard of plan.guards){if(guard.route)continue;/* fixed posts only; walkers move off a painted shadow */const s=guard.seat;const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1.1,.8),new THREE.MeshBasicMaterial({map:contact,transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.set(s?.x??guard.at[0],(guard.y??0)+.009,s?.z??guard.at[1]);room.add(shadow);}
 const batches=new Map();
 for(const mesh of [...room.children])if(mesh.isMesh&&mesh.geometry===cube){const list=batches.get(mesh.material)||[];list.push(mesh);batches.set(mesh.material,list);}
 for(const [material,meshes] of batches)if(meshes.length>2){const batch=new THREE.InstancedMesh(cube,material,meshes.length);meshes.forEach((m,i)=>{m.updateMatrix();batch.setMatrixAt(i,m.matrix);room.remove(m);});batch.computeBoundingSphere();room.add(batch);}
 return room;
}
