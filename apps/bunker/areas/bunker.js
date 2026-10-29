import * as THREE from 'three';
import { wallSurvey } from '../sector.js?v=room3';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { soldierUrl, addCommandStaff, OPERATOR_STATIONS, COMMAND_GUARDS } from '../crew.js';

export async function createArea(saved={}) {
  // Load before allocating the room so a failed download leaves the old area intact.
  const staffModel=await new GLTFLoader().loadAsync(soldierUrl);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#172124');
  const state={selected:'shelter',route:null,scanned:false,weather:'blizzard',...saved};
  const material=(color,metalness=.15,roughness=.82)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
  const wall=material('#67706a'),steel=material('#344349',.65),edge=material('#718087',.6),black=material('#10191f'),rubber=material('#232d2c'),amber=material('#c7a264',.4),ceiling=material('#454e4c');
  const warm=new THREE.MeshBasicMaterial({color:'#ffe3ad'}),cool=new THREE.MeshBasicMaterial({color:'#9ad1da'});
  const cube=new THREE.BoxGeometry(1,1,1);
  function box(w,h,d,x,y,z,mat=steel){const m=new THREE.Mesh(cube,mat);m.scale.set(w,h,d);m.position.set(x,y,z);scene.add(m);return m;}
  function plaque(text,x,y,z,w=2,color='#c5d4cb',rotate=0){const c=document.createElement('canvas');c.width=768;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#142128';ctx.fillRect(0,0,768,128);ctx.fillStyle=color;ctx.font='bold 40px monospace';ctx.fillText(text,24,79,720);const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/6),new THREE.MeshBasicMaterial({map:tx}));m.position.set(x,y,z);m.rotation.y=rotate;scene.add(m);return m;}
  scene.add(new THREE.HemisphereLight('#d7e5e6','#39342b',1.6));
  const key=new THREE.DirectionalLight('#ffe9c5',2.3);key.position.set(1,5,3);scene.add(key);
  for(const x of [-3.3,3.3]){const light=new THREE.PointLight('#ffdfb2',25,11,2);light.position.set(x,3.25,-1.6);scene.add(light);}
  const glow=new THREE.PointLight('#83cbdb',10,7,2);glow.position.set(0,2,-3.7);scene.add(glow);
  // A closed, compact command room with a clear central approach.
  box(9.6,.2,10,0,-.12,0,black);box(9.6,.2,10,0,3.85,0,ceiling);
  const floorA=material('#424c4c',.5),floorB=material('#485152',.5);
  for(let x=-4;x<=4;x+=1)for(let z=-4.5;z<=4.5;z+=1){box(.975,.035,.975,x,0,z,(Math.round(x+z+.5)%2)?floorA:floorB);}
  for(const x of [-4.8,4.8])box(.2,3.8,10,x,1.9,0,wall);
  box(9.6,3.8,.2,0,1.9,-5,wall);box(9.6,3.8,.2,0,1.9,5,wall);
  for(const x of [-4.65,4.65])for(const z of [-4,-1,2,4.7]){box(.2,3.6,.15,x,1.8,z,steel);box(.32,.16,.25,x,3.4,z,edge);}
  for(const x of [-4.6,4.6]){box(.11,.62,9.8,x,.32,0,steel);box(.12,.035,9.8,x,.65,0,amber);box(.12,.12,9.8,x,3.52,0,edge);}
  for(const z of [-3.5,0,3.4]){box(9.2,.18,.18,0,3.57,z,steel);for(const x of [-3.3,3.3]){box(.48,.11,1.25,x,3.47,z,black);box(.32,.035,1.08,x,3.39,z,warm);}}
  // Cable trays and pipework read as practical infrastructure.
  for(const x of [-4.1,4.1]){const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,9.7,12),edge);pipe.rotation.x=Math.PI/2;pipe.position.set(x,3.35,0);scene.add(pipe);for(const z of [-3,0,3])box(.27,.32,.08,x,3.4,z,steel);}
  // Main console: screen, instrument panels, keyboard and trackball.
  box(5.7,.85,1.05,0,.43,-4.05,steel);box(5.85,.1,1.2,0,.91,-4.05,edge);box(5.7,.055,1.08,0,.985,-4.05,black);
  for(const x of [-2.65,2.65])box(.12,.75,.8,x,.42,-4.05,black);
  box(4.55,2.52,.2,0,2.23,-4.79,black);box(4.38,2.35,.05,0,2.23,-4.65,edge);
  const screenTexture=new THREE.CanvasTexture(wallSurvey(state));screenTexture.colorSpace=THREE.SRGBColorSpace;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(4.24,2.23),new THREE.MeshBasicMaterial({map:screenTexture}));screen.position.set(0,2.23,-4.61);scene.add(screen);
  plaque('07 / SITUATION ROOM',0,3.58,-4.8,3.3,'#e5c394');
  box(1.15,.04,.38,-.35,1.03,-3.82,rubber);for(let row=0;row<4;row++)for(let col=0;col<14;col++)box(.057,.018,.053,-.85+col*.075,1.06,-3.96+row*.08,edge);
  const ball=new THREE.Mesh(new THREE.SphereGeometry(.075,16,10),amber);ball.position.set(.7,1.06,-3.78);scene.add(ball);box(.32,.035,.3,.7,1.03,-3.8,rubber);
  for(const side of [-1,1])for(let i=0;i<5;i++){box(.1,.022,.1,side*(1.5+i*.18),1.027,-3.8,i%2?warm:cool);box(.12,.02,.04,side*(1.5+i*.18),1.027,-4.1,edge);}
  plaque('USE TERMINAL  [ E ]',0,1.03,-4.59,1.5,'#a8e5e9');
  // Rack bays on the left, storage and two staffed workstations on the right.
  for(const z of [-2.1,-.7]){box(.85,2.55,1.15,-4.13,1.29,z,black);for(let i=0;i<8;i++){box(.07,.23,1.02,-3.66,.28+i*.29,z,steel);box(.025,.035,.16,-3.61,.31+i*.29,z-.3,i%3?cool:warm);}}
  for(const z of [1.3,2.5,3.7]){box(.8,2.45,1.05,4.16,1.25,z,steel);box(.04,2.3,.96,3.72,1.25,z,edge);box(.055,.34,.07,3.68,1.3,z-.25,black);}
  box(1.8,.75,.75,-3.3,.4,3.7,rubber);box(1.9,.12,.85,-3.3,.85,3.7,steel);
  for(const [index,z] of OPERATOR_STATIONS.entries()){
    const station=new THREE.Group();station.position.set(3,0,z);station.rotation.y=-Math.PI/2;scene.add(station);
    const part=(...args)=>{const mesh=box(...args);station.add(mesh);return mesh;};
    part(.62,.14,.64,0,.55,0,rubber);part(.62,.65,.13,0,.9,.28,rubber);
    part(.12,.4,.12,0,.25,0,edge);part(.75,.07,.08,0,.06,0,edge);part(.08,.07,.75,0,.06,0,edge);
    for(const side of [-1,1]){part(.07,.1,.5,side*.36,.78,0,black);part(.12,.8,.72,side*.72,.43,-.95,steel);}
    part(1.65,.1,.9,0,.88,-.95,edge);part(1.58,.025,.86,0,.945,-.95,black);
    part(.84,.025,.3,0,.97,-.63,rubber);
    for(let row=0;row<3;row++)for(let col=0;col<11;col++)part(.052,.012,.052,-.35+col*.07,.99,-.73+row*.075,edge);
    part(.14,.34,.12,0,1.12,-1.22,steel);part(1.24,.8,.09,0,1.52,-1.27,black);
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=384;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#0b2028';ctx.fillRect(0,0,640,384);ctx.strokeStyle='#24434d';ctx.lineWidth=1;
    for(let i=0;i<640;i+=40){ctx.beginPath();ctx.moveTo(i,70);ctx.lineTo(i,350);ctx.stroke();}
    for(let i=70;i<350;i+=40){ctx.beginPath();ctx.moveTo(20,i);ctx.lineTo(620,i);ctx.stroke();}
    ctx.fillStyle='#b1dfe2';ctx.font='bold 28px monospace';ctx.fillText(index?'SIGNALS / SECURE NET':'OPERATIONS / CONVOY',24,42);
    ctx.strokeStyle='#71d5ba';ctx.lineWidth=3;ctx.beginPath();
    if(index){for(let i=25;i<615;i++){const y=170+Math.sin(i*.09)*Math.sin(i*.019)*48;i===25?ctx.moveTo(i,y):ctx.lineTo(i,y);}}
    else{ctx.moveTo(55,270);ctx.lineTo(140,270);ctx.lineTo(140,220);ctx.lineTo(310,220);ctx.lineTo(310,130);ctx.lineTo(545,130);}
    ctx.stroke();ctx.fillStyle='#e4c48c';ctx.font='22px monospace';ctx.fillText(index?'UPLINK 07  /  ENCRYPTED':'MEDICAL CORRIDOR / MONITORING',24,335);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const monitor=new THREE.Mesh(new THREE.PlaneGeometry(1.14,.69),new THREE.MeshBasicMaterial({map:texture}));monitor.position.set(0,1.52,-1.215);station.add(monitor);
    plaque(index?'02 / SIGNALS':'01 / OPERATIONS',4.49,2.25,z,1.5,'#a8e5e9',-Math.PI/2);
  }
  const staff=addCommandStaff(scene,staffModel);let staffTime=0;
  // Rear pressure hatch and handles, facing into the room.
  box(1.8,2.7,.2,0,1.35,4.78,black);box(1.5,2.45,.08,0,1.3,4.64,edge);box(.06,2.25,.05,0,1.3,4.57,black);
  for(const x of [-.53,.53])box(.09,.4,.09,x,1.35,4.52,amber);
  plaque('SURFACE / EXIT',0,2.96,4.55,1.8,'#e5c394',Math.PI);
  for(const x of [-1.25,1.25])box(.035,.013,7.3,x,.035,.35,amber);
  const obstacles=[[-2.95,2.95,-4.75,-3.45],[-4.7,-3.45,-2.85,0],[3.5,4.7,.65,4.4],...OPERATOR_STATIONS.map(z=>[2.55,4.65,z-.86,z+.86]),...COMMAND_GUARDS.map(g=>[g.x-.3,g.x+.3,g.z-.3,g.z+.3]),[-4.3,-2.2,3.2,4.3]];
  function blocked(x,z){return Math.abs(x)>4.42||Math.abs(z)>4.45||obstacles.some(([a,b,c,d])=>x>a-.22&&x<b+.22&&z>c-.22&&z<d+.22);}
  return {scene,spawn:{x:0,z:1.4,yaw:Math.PI,pitch:0},eyeHeight:1.68,
    tools:[
      {label:'View: Command desk',action({setPose}){setPose({x:0,z:1.4,yaw:Math.PI,pitch:0});}},
      {label:'View: Crew stations',action({setPose}){setPose({x:.8,z:.8,yaw:2.22,pitch:-.12});}},
      {label:'View: Security posts',action({setPose}){setPose({x:0,z:.15,yaw:0,pitch:-.1});}},
    ],
    update(dt){staffTime+=dt;staff.update(staffTime,dt);},
    dispose(){staff.dispose();},
    move(p,dx,dz){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));for(let i=0;i<steps;i++){if(!blocked(p.x+dx/steps,p.z))p.x+=dx/steps;if(!blocked(p.x,p.z+dz/steps))p.z+=dz/steps;}return p;},
    getInteraction(p){if(Math.abs(p.x)<2.9&&p.z<-.6)return {label:'Use situation terminal',panel:'situation-map'};if(Math.abs(p.x)<1.4&&p.z>3.4)return {label:'Open surface hatch',destination:'outside',entry:'bunker'};return null;},
    setMapState(next){Object.assign(state,next);const fresh=wallSurvey(state);screenTexture.image=fresh;screenTexture.needsUpdate=true;},
    snapshot(){return {...state};}
  };
}
