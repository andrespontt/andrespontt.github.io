import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SAFE_WALL, CHAIRS } from './store-layout.js';

// A corner market temporarily converted into a civilian evacuation command post.
export function buildStoreRoom(store) {
  const interior=new THREE.Group();store.add(interior);
  const cube=new THREE.BoxGeometry(1,1,1);
  const mat=(color,roughness=.8,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const plaster=mat('#b3aa93'),green=mat('#344c48'),wood=mat('#705039'),edge=mat('#302f29'),metal=mat('#293c3d',.5,.5),brass=mat('#ba9460',.42,.55),cloth=mat('#55645b');
  const glow=new THREE.MeshBasicMaterial({color:'#ffe5b5'}),paper=mat('#d2c6a4');
  const box=(x0,y0,z0,x1,y1,z1,m,parent=interior)=>{
    const b=new THREE.Mesh(cube,m);b.scale.set(x1-x0,y1-y0,z1-z0);b.position.set((x0+x1)/2,(y0+y1)/2,(z0+z1)/2);parent.add(b);return b;
  };
  const tex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;};
  const panel=(text,sub,w,h,x,y,z,rotation=0,parent=interior)=>{
    const t=tex(768,256,g=>{g.fillStyle='#1d3634';g.fillRect(0,0,768,256);g.strokeStyle='#bb9c66';g.lineWidth=5;g.strokeRect(12,12,744,232);g.fillStyle='#e6d9b8';g.font='bold 54px Arial';g.textAlign='center';g.fillText(text,384,112,710);g.font='24px monospace';g.fillStyle='#9aafa4';g.fillText(sub,384,177,710);});
    const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:t}));p.position.set(x,y,z);p.rotation.y=rotation;parent.add(p);return p;
  };
  // Oak planks, with a darker tiled threshold. Small irregularities keep the materials from looking flat.
  const floorMap=tex(512,512,g=>{g.fillStyle='#665442';g.fillRect(0,0,512,512);for(let row=0;row<8;row++){g.fillStyle=['#72614b','#685640','#7c6952','#60513f'][row%4];g.fillRect(0,row*64,512,62);g.strokeStyle='#433d32';g.lineWidth=2;g.beginPath();g.moveTo((row%3)*170,row*64);g.lineTo((row%3)*170,row*64+64);g.stroke();for(let i=0;i<25;i++){g.fillStyle=i%2?'#ffffff06':'#0000000c';g.fillRect((i*97+row*31)%512,row*64+(i*17)%60,70,1);}}});
  floorMap.wrapS=floorMap.wrapT=THREE.RepeatWrapping;floorMap.repeat.set(4,3);
  box(-6.7,0,-9.7,6.7,.03,1.2,new THREE.MeshStandardMaterial({map:floorMap,roughness:.87}));
  box(-6.7,.031,-.75,6.7,.04,1.18,mat('#424b46'));
  for(let x=-6.6;x<6.7;x+=.65)box(x,.04,-.75,x+.012,.043,1.18,edge);
  for(const z of [-.7,-.05,.6])box(-6.7,.04,z,6.7,.043,z+.012,edge);
  // Full-height interior lining and classic painted timber wainscot.
  for(const x of [-6.66,6.66]){
    box(x-.025,.03,-9.65,x+.025,4.28,1.15,plaster);
    box(x-.05,.03,-9.65,x+.05,1.22,1.15,green);
    box(x-.07,1.22,-9.65,x+.07,1.28,1.15,wood);
    box(x-.06,.03,-9.65,x+.06,.17,1.15,edge);
  }
  box(-6.65,.03,-9.68,6.65,4.28,-9.62,plaster);
  for(const b of SAFE_WALL)box(...b,green);
  for(const [a,b] of [[-6.65,-1.08],[1.08,6.65]]){
    box(a,1.3,-6.79,b,4.25,-6.75,plaster);
    box(a,1.26,-6.78,b,1.32,-6.71,wood);
    box(a,.05,-6.77,b,.18,-6.7,edge);
  }
  const ceiling=box(-6.7,4.3,-9.7,6.7,4.4,1.2,mat('#8b8878'));
  for(const z of [-6.65,-.7])box(-6.7,4.05,z-.09,6.7,4.3,z+.09,edge);
  // Rug under the meeting table, edged in a restrained warm pattern.
  box(-5.65,.036,-5.85,-.35,.045,-1.6,mat('#394c4a'));
  for(const z of [-5.72,-1.76])box(-5.52,.045,z,-.48,.048,z+.035,brass);
  for(const x of [-5.52,-.51])box(x,.045,-5.72,x+.035,.048,-1.72,brass);
  // Trestle meeting table. Thick timber, eased perimeter and visible steel bracing.
  box(-4.4,.76,-5.5,-1.6,.87,-2.65,wood);
  box(-4.43,.78,-5.53,-1.57,.83,-2.62,edge);
  for(const z of [-5.05,-3.1]){
    box(-4.05,.05,z-.1,-3.88,.76,z+.1,metal);box(-2.12,.05,z-.1,-1.95,.76,z+.1,metal);
    box(-4.2,.04,z-.22,-1.8,.11,z+.22,metal);
  }
  box(-4.02,.31,-4.1,-1.98,.39,-3.98,metal);
  // A paper street map, annotated evacuation corridor and briefing folders.
  const mapTex=tex(768,768,g=>{
    g.fillStyle='#beb89f';g.fillRect(0,0,768,768);
    for(let x=45;x<740;x+=90)for(let y=55;y<740;y+=90){g.fillStyle=(x+y)%3?'#8f9585':'#a4a58d';g.fillRect(x,y,60,61);}
    g.strokeStyle='#557e8c';g.lineWidth=38;g.beginPath();g.moveTo(590,0);g.bezierCurveTo(450,300,730,430,600,768);g.stroke();
    g.strokeStyle='#a55139';g.lineWidth=9;g.setLineDash([16,10]);g.beginPath();g.moveTo(90,660);g.lineTo(90,390);g.lineTo(390,390);g.lineTo(390,120);g.stroke();g.setLineDash([]);
    g.strokeStyle='#a55139';g.lineWidth=5;g.beginPath();g.arc(390,390,55,0,Math.PI*2);g.stroke();g.fillStyle='#263e3d';g.fillRect(25,23,440,57);g.fillStyle='#e6dfc8';g.font='bold 28px monospace';g.fillText('KESTREL / CIVILIAN CORRIDOR',38,60);g.font='22px monospace';g.fillStyle='#34433b';g.fillText('N ↑          OPERATION LANTERN',70,720);
  });
  const map=new THREE.Mesh(new THREE.PlaneGeometry(1.85,2.05),new THREE.MeshStandardMaterial({map:mapTex,roughness:1}));map.rotation.x=-Math.PI/2;map.rotation.z=.045;map.position.set(-3,.878,-4.1);interior.add(map);
  for(const [x,z] of [[-4,-5.15],[-1.9,-3.05],[-3.9,-2.95]]){box(x-.17,.875,z-.23,x+.17,.895,z+.23,paper);box(x-.17,.896,z+.12,x+.17,.9,z+.14,brass);}
  const pinMat=mat('#ae5c42');for(const [x,z] of [[-3.3,-4.3],[-2.8,-3.75],[-3.1,-4.8]])box(x-.025,.89,z-.025,x+.025,.94,z+.025,pinMat);
  const cupMat=mat('#d8cfb5',.42);
  for(const [x,z] of [[-4.1,-4.7],[-1.88,-4.6],[-3.7,-2.9]]){const cup=new THREE.Mesh(new THREE.CylinderGeometry(.065,.052,.13,12),cupMat);cup.position.set(x,.94,z);interior.add(cup);const coffee=new THREE.Mesh(new THREE.CircleGeometry(.054,12),edge);coffee.rotation.x=-Math.PI/2;coffee.position.set(x,1.008,z);interior.add(coffee);}
  // Upholstered chairs: readable silhouettes and enough clearance to walk around the table.
  for(const [x,z,yaw] of CHAIRS){
    const chair=new THREE.Group();chair.position.set(x,0,z);chair.rotation.y=yaw;interior.add(chair);
    box(-.27,.43,-.26,.27,.52,.27,cloth,chair);box(-.27,.52,-.28,.27,1.02,-.2,cloth,chair);
    for(const sx of [-.22,.22])for(const sz of [-.21,.21])box(sx-.025,.04,sz-.025,sx+.025,.45,sz+.025,metal,chair);
  }
  // Store identity remains: stocked wall shelving, a coffee counter, and a small radio station.
  const goods=['#a48a52','#717c58','#b5ab87','#865c48'].map(c=>mat(c));
  box(-6.58,.05,-5.8,-6.12,2.8,-1.5,green);
  for(const y of [.3,.95,1.6,2.25]){box(-6.6,y,-5.8,-6.02,y+.06,-1.5,wood);for(let i=0;i<9;i++){const z=-5.65+i*.44;box(-6.32,y+.06,z,-6.08,y+.3,z+.22,goods[i%4]);}}
  box(5.35,.03,-5.9,6.5,.96,-1.8,green);box(5.28,.96,-5.96,6.55,1.04,-1.74,wood);
  for(const z of [-5.4,-4.3,-3.2,-2.1]){box(5.32,.13,z-.4,5.34,.86,z+.4,wood);box(5.28,.7,z-.12,5.32,.73,z+.12,brass);}
  box(5.5,1.04,-5.3,6.22,1.52,-4.65,metal);box(5.46,1.12,-5.25,5.51,1.35,-4.7,brass);
  box(5.5,1.04,-2.9,6.2,1.1,-2.2,edge);
  panel('CORNER MARKET','COFFEE  /  PROVISIONS  /  SINCE 1987',3.4,1.1,6.58,2.5,-3.9,-Math.PI/2);
  box(1.7,.03,-6.65,4.7,1.02,-6.1,green);box(1.65,1.02,-6.68,4.75,1.1,-6.04,wood);
  box(2.3,1.1,-6.55,3.1,1.4,-6.15,metal);box(2.36,1.19,-6.14,2.65,1.31,-6.13,glow);
  for(let i=0;i<5;i++)box(2.75+i*.05,1.18,-6.14,2.77+i*.05,1.33,-6.13,edge);
  box(3.04,1.4,-6.45,3.06,2.06,-6.43,metal);
  panel('OPERATION LANTERN','CIVILIAN EVACUATION  /  SECTOR 07',3.6,1.05,3.4,2.5,-6.72);
  panel('MEETING IN PROGRESS','HOLD THE CORRIDOR. PROTECT THE ENVOY.',3.3,.68,-3.8,3,-6.72);
  // Safe room: internal bench, emergency radio, water, first aid and a protected rear wall.
  box(-6.3,.03,-9.4,-4.2,.46,-8.5,metal);box(-6.3,.46,-9.4,-4.2,.58,-8.5,cloth);box(-6.3,.58,-9.4,-4.2,.92,-9.27,cloth);
  box(3.2,.03,-9.4,5.9,.78,-8.7,green);box(3.16,.78,-9.44,5.94,.85,-8.66,wood);
  for(const x of [3.5,4,4.5])box(x,.85,-9.15,x+.25,1.3,-8.85,mat('#738d91',.4));
  box(5.1,.85,-9.2,5.7,1.27,-8.85,paper);box(5.35,.94,-8.84,5.45,1.2,-8.83,pinMat);box(5.25,1.02,-8.84,5.55,1.12,-8.83,pinMat);
  panel('REFUGE / 01','RADIO CH 04  ·  EMERGENCY SUPPLIES',3.6,.7,0,2.45,-9.6);
  // A sliding security leaf: the real moving solid is shared with movement and bullet tests.
  for(const x of [-1.07,1.07])box(x-.07,.03,-7.13,x+.07,2.65,-6.69,metal);
  box(-1.14,2.55,-7.13,1.14,2.68,-6.69,metal);box(-3.2,2.68,-6.99,1.14,2.78,-6.72,edge);
  panel('SAFE ROOM','01  /  SECURITY DOOR',1.85,.48,0,3,-6.72);
  const door=new THREE.Group();store.add(door);
  box(-.98,.03,-7.02,.98,2.54,-6.84,metal,door);
  box(-.88,.18,-6.83,.88,2.38,-6.81,green,door);
  for(const y of [.4,2.12])box(-.8,y,-6.8,.8,y+.035,-6.79,brass,door);
  box(.68,.94,-6.78,.73,1.24,-6.7,brass,door);
  panel('01','SECURE REFUGE',1.15,.48,0,1.67,-6.79,0,door);
  const lampMat=new THREE.MeshBasicMaterial({color:'#87d5b4'});
  box(1.23,1.28,-6.79,1.46,1.66,-6.68,metal);box(1.27,1.51,-6.67,1.42,1.58,-6.66,lampMat);
  // Warm pendants over the briefing table, cooler safety lighting beyond the door.
  for(const z of [-4.9,-3.2]){
    box(-3.015,2.95,z-.015,-2.985,4.3,z+.015,metal);
    const shade=new THREE.Mesh(new THREE.CylinderGeometry(.14,.4,.23,20,1,true),metal);shade.position.set(-3,2.9,z);interior.add(shade);
    const diffuser=new THREE.Mesh(new THREE.CircleGeometry(.36,20),glow);diffuser.rotation.x=Math.PI/2;diffuser.position.set(-3,2.78,z);interior.add(diffuser);
  }
  for(const [x,y,z,color,intensity,range] of [[-3,2.65,-4,'#ffdb9e',26,10],[3.2,3.6,-3.3,'#ffe6c0',14,10],[0,3.4,-8.5,'#a7d9d1',17,10]]){
    const light=new THREE.PointLight(color,intensity,range,1.7);light.position.set(x,y,z);store.add(light);
  }
  box(-1.4,3.9,-8.7,1.4,3.95,-8.5,glow);
  // Bake static detail by material; keep the ceiling and moving door independent.
  interior.updateMatrixWorld(true);const batches=new Map(),old=[];
  interior.traverse(n=>{if(!n.isMesh||n===ceiling)return;const list=batches.get(n.material)||[];list.push(n.geometry.clone().applyMatrix4(n.matrixWorld));batches.set(n.material,list);old.push(n);});
  for(const n of old)n.removeFromParent();
  for(const [material,geos] of batches){const merged=mergeGeometries(geos);for(const geo of geos)geo.dispose();if(merged)store.add(new THREE.Mesh(merged,material));}
  // The source geometries are no longer referenced by a renderable, except the shared cube.
  for(const geo of new Set(old.map(n=>n.geometry)))if(geo!==cube)geo.dispose();
  return {ceiling,setDoor(fraction,locked){door.position.x=-fraction*2.08;lampMat.color.set(locked?'#ecad65':'#87d5b4');}};
}
