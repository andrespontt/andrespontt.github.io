import * as THREE from 'three';
import { addSeatedDrivers, DRIVER } from './crew.js';

// All meshes, textures and lights belong to this area and can be disposed together.
export async function createCabin(){
 const scene=new THREE.Scene();
 scene.background=new THREE.Color('#182735');
 scene.fog=new THREE.FogExp2('#263849',.009);
 scene.add(new THREE.AmbientLight('#8ba9b3',1.05));
 scene.add(new THREE.HemisphereLight('#abc4cb','#25272a',1.25));
 const metal=new THREE.MeshStandardMaterial({color:'#40494a',roughness:.78,metalness:.45});
 const dark=new THREE.MeshStandardMaterial({color:'#141d23',roughness:.85});
 const seat=new THREE.MeshStandardMaterial({color:'#555d51',roughness:1});
 const glow=new THREE.MeshBasicMaterial({color:'#a1d8c0'});
 const amber=new THREE.MeshBasicMaterial({color:'#dba65d'});
 const fabric=new THREE.MeshStandardMaterial({color:'#9eaa9a',roughness:1});
 const orange=new THREE.MeshStandardMaterial({color:'#c88145',roughness:.8});
 const trim=new THREE.MeshStandardMaterial({color:'#697579',roughness:.65,metalness:.65});
 const unitBox=new THREE.BoxGeometry(1,1,1);
 function box(w,h,d,x,y,z,material=metal){const m=new THREE.Mesh(unitBox,material);m.scale.set(w,h,d);m.position.set(x,y,z);scene.add(m);return m;}
 function sign(title,subtitle,w,h,x,y,z,rotation=0,color='#c9d4cf'){
  const c=document.createElement('canvas');c.width=768;c.height=Math.max(128,Math.round(768*h/w));const a=c.getContext('2d');
  a.fillStyle='#1c292d';a.fillRect(0,0,c.width,c.height);a.fillStyle='#d5a75d';a.fillRect(0,0,14,c.height);
  a.fillStyle=color;a.font=`bold ${Math.min(64,c.height*.38)}px monospace`;a.textAlign='center';a.textBaseline='middle';a.fillText(title,c.width/2,c.height*(subtitle ? .36 : .5),c.width-70);
  if(subtitle){a.fillStyle='#899e9d';a.font=`${Math.min(29,c.height*.2)}px monospace`;a.fillText(subtitle,c.width/2,c.height*.73,c.width-64);}
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;scene.add(mesh);return mesh;
 }
 function display(kind,label,w,h,x,y,z,rotation=0){
  const c=document.createElement('canvas');c.width=640;c.height=360;const a=c.getContext('2d');
  a.fillStyle='#071412';a.fillRect(0,0,640,360);a.strokeStyle='#234638';a.lineWidth=1;
  for(let x=0;x<640;x+=40){a.beginPath();a.moveTo(x,0);a.lineTo(x,360);a.stroke();}
  for(let y=0;y<360;y+=40){a.beginPath();a.moveTo(0,y);a.lineTo(640,y);a.stroke();}
  a.fillStyle='#90c998';a.font='bold 22px monospace';a.fillText(label,20,32);a.font='15px monospace';
  if(kind==='map'){
   a.strokeStyle='#70a985';a.lineWidth=3;for(let i=0;i<5;i++){a.strokeRect(100+i*24,88+i*15,340-i*39,210-i*27);}
   a.strokeStyle='#b5d1a3';a.setLineDash([8,6]);a.beginPath();a.moveTo(64,290);a.lineTo(170,215);a.lineTo(320,215);a.lineTo(390,135);a.stroke();a.setLineDash([]);
   for(const [x,y] of [[170,215],[320,215],[390,135]]){a.fillStyle='#e2b768';a.fillRect(x-5,y-5,10,10);}
   a.fillStyle='#b7d1a7';a.fillText('OUTPOST 07',398,126);a.fillText('NOMAD',75,316);
  }else if(kind==='feed'){
   a.fillStyle='#182c23';a.fillRect(20,60,600,260);a.fillStyle='#344b3b';a.beginPath();a.moveTo(20,270);a.lineTo(120,115);a.lineTo(230,220);a.lineTo(360,95);a.lineTo(500,270);a.fill();a.strokeStyle='#78a080';a.strokeRect(250,170,140,100);
   for(let i=0;i<110;i++){const x=(i*73)%600+20,y=(i*47)%250+65;a.fillStyle=i%3?'#59735c':'#9db593';a.fillRect(x,y,2,2);}a.fillStyle='#b3cba6';a.fillText('EXT CAMERA / SIGNAL DEGRADED',28,340);
  }else{
   a.fillText('ENVIRONMENTAL CONTROL / NOMINAL',20,72);for(let j=0;j<4;j++){a.strokeStyle='#88c58b';a.beginPath();for(let i=0;i<560;i++){const y=110+j*55+Math.sin(i*.07+j)*4-(i%107<5?24:0);i?a.lineTo(35+i,y):a.moveTo(35+i,y);}a.stroke();}a.fillText('O2 21%    CABIN +18 C    BERTHS 04',20,340);
  }
  a.fillStyle='#00000030';for(let y=0;y<360;y+=4)a.fillRect(0,y,640,1);
  const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture}));m.position.set(x,y,z);m.rotation.y=rotation;scene.add(m);return m;
 }
 // Pressure-hull style compartment, with a clear full-length central passage.
 box(5,.15,13.5,0,.65,-1.5,dark);box(5,.15,13.5,0,3.6,-1.5);
 for(const side of [-1,1]){
  const x=side*2.5;
  box(.16,1.35,13.5,x,1.35,-1.5);box(.16,.8,13.5,x,3.25,-1.5);
  // Small recessed windows look onto the lightweight backdrop owned by this area.
  for(let z=-7.5;z<5;z+=2.5){
   box(.16,.9,1.45,x,2.45,z);
   for(const edgeZ of [z+.75,z+1.8])box(.22,.96,.09,x,2.45,edgeZ,dark);
   box(.24,.08,1.08,x,2.04,z+1.275,dark);box(.24,.08,1.08,x,2.87,z+1.275,dark);
   box(.3,.025,1.06,side*2.42,2.075,z+1.275,glow);
   for(const boltZ of [z+.78,z+1.76])for(const boltY of [2.1,2.8])box(.025,.045,.045,side*2.365,boltY,boltZ,trim);
  }
  for(const z of [-7,-4.5,-2,.5,3]){box(.14,2.85,.13,side*2.35,2.15,z);box(4.7,.14,.13,0,3.46,z);}
  // Overhead utility conduits and aisle safety rails.
  box(.08,.08,12,side*2.12,3.32,-1.3,amber);
  box(.06,.12,12.7,side*2.34,1.95,-1.5,dark);
 }
 box(1.7,2.9,.18,-1.65,2.1,-8.15);box(1.7,2.9,.18,1.65,2.1,-8.15);box(1.6,.55,.18,0,3.35,-8.15);
 for(let z=-8;z<5;z+=.32)box(4.7,.014,.022,0,.735,z,metal);
 for(const x of [-.65,.65])box(.035,.018,12.5,x,.75,-1.4,amber);
 const privateDoor=new THREE.Group();scene.add(privateDoor);
 const door=box(1.55,2.3,.14,0,1.85,-8.12,dark);const handle=box(.08,.38,.1,.53,1.85,-8.02,amber);
 const doorSign=sign('YOUR QUARTERS','PRIVATE / 01',1.15,.4,0,2.65,-8.02);
 const doorReverseSign=sign('CREW DECK','RETURN TO CABIN',1.15,.4,0,2.65,-8.22,Math.PI);
 const doorInset=box(1.27,.035,.04,0,1.2,-8.035,trim);
 privateDoor.add(door,handle,doorSign,doorReverseSign,doorInset);
 scene.userData.privateDoor=privateDoor;
 sign('01 / PRIVATE QUARTERS','SLIDING PRESSURE DOOR',1.8,.3,0,3.28,-8.045);
 for(const x of [-.84,.84])box(.045,2.4,.06,x,1.9,-8.02,amber);
 // Rear personal quarters, beyond the sliding bulkhead door.
 const warm=new THREE.MeshStandardMaterial({color:'#746455',roughness:.9});
 box(5,.15,4.2,0,.65,-10.3,warm);box(5,.15,4.2,0,3.6,-10.3);
 for(const x of [-2.5,2.5])box(.16,2.9,4.2,x,2.1,-10.3);
 box(5,2.9,.18,0,2.1,-12.4);
 // Full-length bed, pillow, folded duvet and reading lamp.
 box(1.45,.38,2.5,-1.57,.97,-10.7,dark);box(1.4,.25,2.4,-1.57,1.28,-10.7,seat);
 box(1.22,.14,1.5,-1.57,1.47,-10.3,warm);box(.95,.18,.45,-1.57,1.48,-11.55,glow);
 box(1.5,.8,.12,-1.57,1.5,-11.98,warm);
 // Stitched cover, storage drawers and bedside cabinet stay within the bed footprint.
 for(const x of [-2.13,-1.02])box(.022,.012,1.38,x,1.548,-10.3,fabric);
 for(const z of [-11.45,-10.65,-9.85]){box(.03,.24,.64,-.825,.97,z,warm);box(.035,.035,.2,-.803,1.01,z,trim);}
 box(.28,.1,.42,-2.17,1.7,-11.6,warm);
 box(.32,.07,.22,-2.25,2.2,-11.65,amber);
 const readingLight=new THREE.PointLight('#ffc890',4,4);readingLight.position.set(-1.9,2.3,-11.3);scene.add(readingLight);
 // Personal desk, terminal, chair and shelving.
 box(1.2,.12,1.65,1.75,1.48,-11.1,warm);box(.12,.7,.12,1.25,1.05,-11.7);box(.12,.7,.12,2.2,1.05,-10.5);
 box(.15,.7,1.12,2.2,1.95,-11.1,dark);display('map','PERSONAL TERMINAL / LOG',.95,.55,2.1,1.95,-11.1,-Math.PI/2);
 box(.4,.035,.7,1.65,1.56,-11.1,dark);chair(.92,-11.1,-Math.PI/2);
 box(.9,2.1,.75,1.9,1.75,-8.85,warm);box(.1,.4,.08,1.4,1.75,-8.85,amber);
 for(const y of [1.9,2.5]){box(.32,.07,1.7,-2.2,y,-8.95,warm);for(let i=0;i<5;i++)box(.2,.25,.12,-2.2,y+.16,-9.5+i*.19,i%2?seat:metal);}
 sign('FIELD NOTES','NOMAD / NORTHERN EXPEDITION',1.25,.55,-2.405,2.75,-10.7,Math.PI/2);
 sign('REST / RECOVER','PERSONAL QUARTERS 01',1.65,.42,0,2.9,-12.295);
 // Personal effects: a thermos, journal, under-desk drawers and a wool floor runner.
 const thermos=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.25,12),trim);thermos.position.set(1.65,1.665,-11.7);scene.add(thermos);
 box(.25,.035,.35,1.66,1.56,-10.55,orange);
 box(.65,.65,.6,1.98,1.08,-11.7,dark);for(const y of [.93,1.18])box(.025,.035,.2,1.64,y,-11.7,trim);
 box(.82,.012,2.3,.07,.736,-10.1,seat);
 for(const z of [-11.17,-9.03])box(.82,.014,.04,.07,.738,z,fabric);
 box(.85,.035,.2,0,3.45,-10.3,amber);const roomLight=new THREE.PointLight('#ffd6a7',7,6);roomLight.position.set(0,3.15,-10.3);scene.add(roomLight);
 // Forward driving compartment.
 box(5,.85,.2,0,1.1,5.2);box(5,.4,.2,0,3.4,5.2);
 for(const x of [-2.4,0,2.4])box(.14,2,.18,x,2.3,5.2);
 box(4.6,.4,1,0,1.45,4.65,dark);
 display('map','NAVIGATION / NOMAD 07',1.25,.6,-1.15,1.9,4.17,Math.PI);
 display('status','ENGINE / STANDBY',1.25,.6,1.15,1.9,4.17,Math.PI);
 const wheelGeometry=new THREE.TorusGeometry(.32,.045,8,24);
 for(const x of [-1.15,1.15]){
  const steering=new THREE.Group();steering.position.set(x,DRIVER.wheelY,DRIVER.wheelZ);steering.rotation.x=.45;scene.add(steering);
  steering.add(new THREE.Mesh(wheelGeometry,metal));
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.09,12),trim);hub.rotation.x=Math.PI/2;steering.add(hub);
  for(const angle of [0,Math.PI*2/3,Math.PI*4/3]){const spoke=new THREE.Mesh(new THREE.BoxGeometry(.035,.3,.045),trim);spoke.position.set(Math.sin(angle)*.15,Math.cos(angle)*.15,0);spoke.rotation.z=-angle;steering.add(spoke);}
  const column=box(.08,.08,.95,x,DRIVER.wheelY-.2,DRIVER.wheelZ+.45,dark);column.rotation.x=.45;
  for(const side of [-.17,.17])box(.14,.05,.24,x+side,DRIVER.floor+.08,DRIVER.seatZ+.85,trim);
 }
 function chair(x,z,rotation=0){const g=new THREE.Group();const start=scene.children.length;box(.8,.2,.8,x,1.05,z,seat);box(.8,.8,.15,x,1.55,z-.35,seat);box(.5,.25,.15,x,2.05,z-.35,dark);box(.12,.5,.12,x,.85,z);const pieces=scene.children.slice(start);g.position.set(x,0,z);scene.add(g);scene.updateMatrixWorld(true);for(const piece of pieces)g.attach(piece);g.rotation.y=rotation;}
 function pilotChair(x,z){const top=DRIVER.seatTop,floor=DRIVER.floor;box(.78,.16,.72,x,top-.08,z+.02,seat);box(.78,.62,.12,x,top+.33,z-.38,seat);box(.16,top-.16-floor,.16,x,(top-.16+floor)/2,z,metal);box(.6,.05,.6,x,floor+.03,z,trim);}
 pilotChair(-1.15,DRIVER.seatZ);pilotChair(1.15,DRIVER.seatZ);
 await addSeatedDrivers(scene);
 sign('NOMAD 07','POLAR EXPEDITION CARRIER',2,.26,0,3.36,5.08,Math.PI);
 // Port-side operations desk, leaving the center aisle unobstructed.
 box(1.35,.75,2.4,-1.78,1.1,-5.5,dark);box(1.5,.12,2.6,-1.7,1.52,-5.5);
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
  const z=-6.35+col*.82,y=1.95+row*.65;box(.22,.61,.79,-2.3,y,z,dark);
  display(col===1?'status':'feed',col===1?'LIFE SUPPORT':'PERIMETER / CAM '+(col+1),.71,.48,-2.17,y,z,Math.PI/2);
 }
 const map=display('map','MISSION / SECTOR 07',1.1,1.85,-1.65,1.6,-5.5);map.rotation.x=-Math.PI/2;
 // Four empty submarine-style bunks along starboard.
 for(const z of [-5.9,-4.5])for(const y of [1.1,2.05]){
  box(1.3,.13,1.25,1.75,y,z);box(1.18,.17,1.12,1.75,y+.15,z,seat);box(.8,.12,.25,1.75,y+.28,z-.39);
  box(.045,.16,1.12,1.12,y+.35,z,metal);
  box(.95,.035,.63,1.75,y+.25,z+.17,fabric);
  box(.16,.025,.58,1.26,y+.28,z+.17,orange);
  box(.07,.035,.6,2.35,y+.67,z,amber);
 }
 for(const z of [-6.6,-3.8])box(.09,2.1,.09,1.1,1.75,z);
 for(const y of [1.1,1.42,1.74,2.06])box(.12,.055,.42,1.06,y,-3.98,trim);
 sign('02 / CREW BERTHS','FOUR BUNKS / QUIET ZONE',2,.3,2.26,3.05,-5.2,-Math.PI/2);
 sign('03 / OPERATIONS','COMMS / TERRAIN / WEATHER',2,.3,-2.26,3.05,-5.4,Math.PI/2);
 // Galley, equipment lockers, and a two-person crew bench.
 box(1.35,.85,2.3,-1.8,1.15,-2.2);box(1.4,.08,2.4,-1.78,1.62,-2.2,dark);
 box(.75,.04,.65,-1.75,1.68,-2.6,metal);box(.08,.3,.08,-2.15,1.82,-2.6,metal);
 for(const z of [-2.8,-2,-1.3])box(.05,.12,.3,-1.1,1.3,z,dark);
 // Recessed sink, cooktop and galley upper shelf.
 box(.55,.025,.47,-1.75,1.707,-2.6,dark);box(.38,.018,.35,-1.75,1.72,-2.6,trim);
 box(.55,.025,.52,-1.75,1.68,-1.6,dark);
 const burner=new THREE.Mesh(new THREE.TorusGeometry(.15,.012,6,24),trim);burner.rotation.x=Math.PI/2;burner.position.set(-1.75,1.705,-1.6);scene.add(burner);
 box(.4,.08,1.65,-2.18,2.8,-2.2,metal);
 for(const z of [-2.75,-2.4,-2.05])box(.21,.3,.23,-2.18,2.99,z,z===-2.4?orange:fabric);
 sign('04 / GALLEY','WATER / RATIONS',1.8,.3,-2.26,3.05,-2.15,Math.PI/2);
 box(1.2,.22,2.1,1.8,1.05,-1.7,seat);box(.17,.8,2.1,2.3,1.5,-1.7,seat);
 for(const z of [.55,1.3]){box(1.15,1.9,.7,-1.85,1.7,z,metal);box(.06,.35,.08,-1.24,1.7,z,dark);}
 for(const z of [.55,1.3]){for(let y=2.13;y<2.4;y+=.085)box(.015,.024,.4,-1.265,y,z,dark);sign(z<1?'GEAR / 01':'GEAR / 02','',.48,.16,-1.258,1.96,z,Math.PI/2);}
 // Entry hatch and warm ceiling lamps.
 box(.1,1.95,1,2.35,1.7,1.1,dark);box(.1,.35,.09,2.25,1.8,1.4,amber);
 sign('EXTERIOR','AIRLOCK / EXIT',.82,.3,2.29,2.4,1.1,-Math.PI/2);
 sign('CREW DECK','AFT: PRIVATE QUARTERS',1.2,.28,-2.26,3.05,.8,Math.PI/2);
 for(const z of [-6,-3,0,3]){box(1.2,.04,.2,0,3.47,z,glow);const light=new THREE.PointLight('#bfd0b0',8,7);light.position.set(0,3.2,z);scene.add(light);}
 // A separate, small backdrop means the exterior scene can be fully unloaded.
 const snowMaterial=new THREE.MeshStandardMaterial({color:'#637f95',roughness:1});
 box(180,.1,180,0,-1.1,0,snowMaterial);
 const mountainGeometry=new THREE.ConeGeometry(1,1,5);
 for(let i=0;i<16;i++){
  const angle=i/16*Math.PI*2,radius=38+(i%3)*7,height=9+(i*7%15);
  const peak=new THREE.Mesh(mountainGeometry,snowMaterial);peak.position.set(Math.cos(angle)*radius,height/2-1,Math.sin(angle)*radius);peak.scale.set(9+(i%4)*3,height,8);scene.add(peak);
 }
 const flakes=new Float32Array(600*3);
 for(let i=0;i<600;i++){const side=i%2?1:-1;flakes[i*3]=side*(5+(i*17.37%30));flakes[i*3+1]=(i*3.91%18)-2;flakes[i*3+2]=(i*13.13%65)-32;}
 const snowGeometry=new THREE.BufferGeometry();snowGeometry.setAttribute('position',new THREE.BufferAttribute(flakes,3));
 const snow=new THREE.Points(snowGeometry,new THREE.PointsMaterial({color:'#c5d9e8',size:.055,transparent:true,opacity:.65,depthWrite:false}));snow.frustumCulled=false;scene.add(snow);
 const outsideStorm={
  flurries:{haze:0,speed:1.5,drift:.8,opacity:.3,count:170},
  snowfall:{haze:0.25,speed:3.4,drift:1.8,opacity:.52,count:360},
  blizzard:{haze:0.55,speed:6.5,drift:4.2,opacity:.78,count:600},
  whiteout:{haze:0.9,speed:9,drift:7,opacity:1,count:600}
 };
 const clearSky=new THREE.Color('#182735'),clearSnow=new THREE.Color('#637f95'),stormSky=new THREE.Color('#8c9eab');
 let haze=.6;
 scene.userData.updateBackdrop=(dt,weather)=>{
  const name=typeof weather==='string'?weather:weather?.name;
  const storm=outsideStorm[name]||outsideStorm.blizzard;
  haze+=(storm.haze-haze)*Math.min(1,dt*1.5);
  scene.background.copy(clearSky).lerp(stormSky,haze*.75);snowMaterial.color.copy(clearSnow).lerp(stormSky,haze);
  snow.material.opacity=storm.opacity;
  snowGeometry.setDrawRange(0,storm.count);
  for(let i=0;i<storm.count;i++){const offset=i*3;flakes[offset+1]-=dt*storm.speed;flakes[offset+2]-=dt*storm.speed*storm.drift*.18;if(flakes[offset+1]<-2)flakes[offset+1]=16;if(flakes[offset+2]<-32)flakes[offset+2]=33;}
  snowGeometry.attributes.position.needsUpdate=true;
 };
 return scene;
}








