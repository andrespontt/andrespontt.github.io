import * as THREE from 'three';
import { createExpeditionVehicle } from '../vehicle.js';
export function createArea(saved={}){
const scene = new THREE.Scene();
scene.background = new THREE.Color('#101e30');
scene.fog = new THREE.FogExp2('#192c40', .027);

scene.add(new THREE.HemisphereLight('#afcce9','#243144',2.1));
const moon = new THREE.DirectionalLight('#b5d6ff',2.4); moon.position.set(-30,40,-20); scene.add(moon);
const snowMat = new THREE.MeshStandardMaterial({color:'#b4c8db',roughness:1});
const concrete = new THREE.MeshStandardMaterial({color:'#515e65',roughness:1});
const steel = new THREE.MeshStandardMaterial({color:'#26353c',roughness:.7,metalness:.5});
function box(w,h,d,x,y,z,mat=concrete){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);scene.add(mesh);return mesh;}
function terrain(x,z){return -.5+Math.sin(x*.065)*1.3+Math.cos(z*.09)*.65+Math.sin(x*.19+z*.1)*.25;}
const groundGeo=new THREE.PlaneGeometry(300,300,100,100);groundGeo.rotateX(-Math.PI/2);
const gp=groundGeo.attributes.position;for(let i=0;i<gp.count;i++)gp.setY(i,terrain(gp.getX(i),gp.getZ(i)));groundGeo.computeVertexNormals();scene.add(new THREE.Mesh(groundGeo,snowMat));
// The recessed entry and warm fixtures remain a visual anchor through the storm.
box(15,5,10,3,1.6,-12);box(16,.55,11,3,4.35,-12,snowMat);
box(4.8,3.8,.2,4,1.5,-6.87,steel);box(3.9,3.2,.18,4,1.2,-6.7,new THREE.MeshStandardMaterial({color:'#111d25',roughness:.85}));
box(.06,3.1,.08,4,1.2,-6.58,concrete);box(.16,.45,.15,4.5,1.15,-6.5,steel);
box(6,.25,3,4,-.32,-5.5,concrete);box(5.8,.15,1.1,4,-.43,-3.9,snowMat);
for(const x of [1.2,6.8]){box(.3,.7,.3,x,2.7,-6.4,steel);box(.17,.43,.32,x,2.7,-6.22,new THREE.MeshBasicMaterial({color:'#ffcb83'}));const lamp=new THREE.PointLight('#ffad55',24,12,1.5);lamp.position.set(x,2.7,-5.9);scene.add(lamp);}
const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=128;const ctx=signCanvas.getContext('2d');ctx.fillStyle='#9fadb1';ctx.font='bold 66px monospace';ctx.fillText('B U N K E R   07',8,85);const sign=new THREE.Mesh(new THREE.PlaneGeometry(4,.95),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(signCanvas),transparent:true}));sign.position.set(4,3.65,-6.88);scene.add(sign);
// Distant ridgelines, snow-covered pines, and marker posts give visibility scale.
let seed=193;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
for(let i=0;i<24;i++){const x=(random()-.5)*180,z=-45-random()*65;const mountain=new THREE.Mesh(new THREE.ConeGeometry(12+random()*16,20+random()*35,5),snowMat);mountain.position.set(x,7,z);scene.add(mountain);}
const pineMat=new THREE.MeshStandardMaterial({color:'#243b49',roughness:1});
for(let i=0;i<65;i++){let x=(random()-.5)*130,z=-15-random()*80;if(Math.abs(x-3)<13)continue;const h=5+random()*9;for(let j=0;j<3;j++){const g=new THREE.ConeGeometry(h*(.24-j*.04),h*.55,7);const m=new THREE.Mesh(g,j===1?pineMat:snowMat);m.position.set(x,terrain(x,z)+h*(.34+j*.22),z);scene.add(m);}}
for(let i=0;i<10;i++){const z=9-i*2.6;for(const x of [-1,9]){box(.12,1.2,.12,x,terrain(x,z)+.5,z,steel);box(.14,.15,.14,x,terrain(x,z)+1.05,z,new THREE.MeshBasicMaterial({color:'#d9b784'}));}}
box(.18,11,.18,-3,9,-12,steel);box(3,.09,.09,-3,13,-12,steel);

const expeditionVehicle=createExpeditionVehicle();
expeditionVehicle.position.set(22,terrain(22,16)-.02,16);
expeditionVehicle.scale.set(1.12,1.25,1.08);
const slopeX=(terrain(22.5,16)-terrain(21.5,16));
const slopeZ=(terrain(22,16.5)-terrain(22,15.5));
expeditionVehicle.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-slopeX,1,-slopeZ).normalize());
expeditionVehicle.rotateY(-.65);
expeditionVehicle.position.y-=.12;
scene.add(expeditionVehicle);

const presets={
 flurries:{wind:5,visibility:160,speed:1.1,density:.005,count:3200,alpha:.55,haze:.025,description:'A quiet snowfall. The ridgeline reappears in the moonlight.'},
 snowfall:{wind:24,visibility:90,speed:4,density:.013,count:11000,alpha:.7,haze:.075,description:'Steady snow drifts across the outpost. The night closes in.'},
 blizzard:{wind:78,visibility:35,speed:15,density:.045,count:54000,alpha:.85,haze:.17,description:'Heavy snow. Violent crosswinds. Shelter is the only landmark.'},
 whiteout:{wind:120,visibility:12,speed:25,density:.095,count:85000,alpha:1,haze:.34,description:'The horizon disappears. Hold on to the light.'}
};
const state={...presets.blizzard};let target=presets.blizzard;
// GPU-animated particles wrap in a volume: no per-frame position uploads.
const count=85000,positions=new Float32Array(count*3),sizes=new Float32Array(count);
for(let i=0;i<count;i++){positions[i*3]=(random()-.5)*80;positions[i*3+1]=random()*24;positions[i*3+2]=(random()-.5)*70;sizes[i]=.5+random();}
const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('flakeSize',new THREE.BufferAttribute(sizes,1));
const uniforms={time:{value:0},travel:{value:0},wind:{value:15},opacity:{value:.85},pixelRatio:{value:Math.min(globalThis.devicePixelRatio||1,1.75)}};
const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthWrite:false,vertexShader:`
attribute float flakeSize; uniform float time; uniform float travel; uniform float wind; uniform float pixelRatio; varying float depth; varying float size;
void main(){vec3 p=position;p.x=mod(p.x+travel+sin(time*.7+p.y)*2.+40.,80.)-40.;p.y=mod(p.y-time*(1.5+flakeSize)+24.,24.);p.z+=sin(time*.45+p.x*.1)*1.2;vec4 mv=modelViewMatrix*vec4(p,1.);depth=-mv.z;size=flakeSize;gl_Position=projectionMatrix*mv;gl_PointSize=clamp((105.*flakeSize*pixelRatio)/max(1.,depth),1.,18.);}`,
fragmentShader:`uniform float opacity;uniform float wind;varying float depth;varying float size;void main(){vec2 uv=gl_PointCoord-.5;uv.y*=1.0+wind*.055;float a=1.-smoothstep(.1,.5,length(uv));float fade=smoothstep(0.,2.,depth)*(1.-smoothstep(25.,90.,depth));gl_FragColor=vec4(.78,.88,1.,a*opacity*fade*.85);}`});
const snow=new THREE.Points(geo,material);snow.frustumCulled=false;scene.add(snow);
// Soft moving ground spindrift, generated locally without image assets.
const fogCanvas=document.createElement('canvas');fogCanvas.width=fogCanvas.height=128;const fc=fogCanvas.getContext('2d');const gradient=fc.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(178,204,226,.55)');gradient.addColorStop(.45,'rgba(178,204,226,.22)');gradient.addColorStop(1,'rgba(178,204,226,0)');fc.fillStyle=gradient;fc.fillRect(0,0,128,128);const fogTexture=new THREE.CanvasTexture(fogCanvas);const wisps=[];
for(let i=0;i<32;i++){const m=new THREE.SpriteMaterial({map:fogTexture,transparent:true,opacity:.17,depthWrite:false});const s=new THREE.Sprite(m);s.position.set((random()-.5)*70,random()*4,-random()*65+20);s.scale.set(20+random()*25,2+random()*4,1);scene.add(s);wisps.push(s);}
let elapsed=0,travel=0;
const invVehicle=expeditionVehicle.matrixWorld.clone();
scene.updateMatrixWorld(true);invVehicle.copy(expeditionVehicle.matrixWorld).invert();
const probe=new THREE.Vector3();
function blocked(x,z){
 if(x< -22||x>55||z< -25||z>65)return true;
 if(x> -4.9&&x<11&&z> -17.8&&z< -6.5)return true;
 probe.set(x,terrain(x,z)+1,z).applyMatrix4(invVehicle);
 return Math.abs(probe.x)<2.7&&probe.z> -11.6&&probe.z<7.9;
}
// Boarding works from anywhere alongside the hull, measured in the vehicle's own frame.
function nearNomad(x,z){
 probe.set(x,terrain(x,z)+1,z).applyMatrix4(invVehicle);
 const outX=Math.max(0,Math.abs(probe.x)-2.7),outZ=Math.max(0,probe.z-7.9,-11.6-probe.z);
 return Math.hypot(outX,outZ)<2.3;
}
// Disembark beside the port hatch, facing away from the vehicle.
const hatch=new THREE.Vector3(4.4,0,0).applyMatrix4(expeditionVehicle.matrixWorld),hull=new THREE.Vector3(0,0,0).applyMatrix4(expeditionVehicle.matrixWorld);
const vehicleExit={x:hatch.x,z:hatch.z,yaw:Math.atan2(hatch.x-hull.x,hatch.z-hull.z)};
return {scene,eyeHeight:1.75,
 spawn:{x:4,z:1,yaw:Math.PI,pitch:0},
 entrySpawns:{bunker:{x:4,z:-3.5,yaw:0},vehicle:vehicleExit},
 heightAt:terrain,
 move(p,dx,dz){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));for(let i=0;i<steps;i++){if(!blocked(p.x+dx/steps,p.z))p.x+=dx/steps;if(!blocked(p.x,p.z+dz/steps))p.z+=dz/steps;}},
 getInteraction(p){if(Math.hypot(p.x-4,p.z+5)<3)return {label:'Enter bunker · Airlock 07',destination:'bunker'};if(nearNomad(p.x,p.z))return {label:'Board Nomad · Crew compartment',destination:'vehicle'};return null;},
 update(dt,{weather='blizzard'}={}){
 target=presets[weather]||presets.blizzard;
 elapsed+=dt;for(const key of ['speed','density','count','alpha','haze'])state[key]+=(target[key]-state[key])*(1-Math.exp(-dt*1.5));
 travel+=dt*state.speed*(1+Math.sin(elapsed*.6)*.18);uniforms.time.value=elapsed;uniforms.travel.value=travel;uniforms.wind.value=state.speed;uniforms.opacity.value=state.alpha;geo.setDrawRange(0,Math.round(state.count));scene.fog.density=state.density;
 for(const w of wisps){w.position.x+=dt*state.speed*.65;if(w.position.x>55)w.position.x=-55;w.material.opacity=state.haze*(.7+Math.sin(elapsed+w.position.z)*.3);}
 },snapshot(){return {};}
};
}

