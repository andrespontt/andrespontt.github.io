import * as THREE from 'three';
import {buildWorld} from './world.js';
import {createState,movePlayer,roomAt} from './simulation.js';
import {updateClown} from './simulation.js';

const $=id=>document.getElementById(id);
const state=createState(), keys=new Set();
const canvas=$('scene');
let renderer,world,camera,scene,moon,aimed=null,last=0,drag=null,stickId=null,lookId=null;
let touchX=0,touchZ=0,audio=null,soundOn=false,rainGain=null,held=null,mist=null;
const ray=new THREE.Raycaster(),forward=new THREE.Vector3(),delta=new THREE.Vector3();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function fail(message){$('error-message').textContent=message;$('error').hidden=false;}
function caption(message){$('caption').textContent=message;state.captionTime=5.5;$('caption').classList.add('show');}
function clearInput(){keys.clear();touchX=0;touchZ=0;drag=null;stickId=null;lookId=null;$('knob').style.transform='';}
function pause(){if(!state.playing)return;state.playing=false;clearInput();document.exitPointerLock?.();document.body.classList.remove('playing');$('hud').hidden=true;$('menu').hidden=false;$('menu-footer').hidden=false;$('start').textContent='Resume the night  →';if(audio)audio.suspend();$('start').focus();}
function start(){state.playing=true;state.started=true;$('menu').hidden=true;$('hud').hidden=false;$('menu-footer').hidden=true;document.body.classList.add('playing');last=performance.now();if(soundOn)ensureAudio();if(!matchMedia('(pointer: coarse)').matches){try{const request=canvas.requestPointerLock?.();request?.catch(()=>caption('Drag to look. WASD to move. E to interact.'));}catch{caption('Drag to look. WASD to move. E to interact.');}}caption('You’re home. The guards are at the front door.');}
function ensureAudio(){try{if(!audio){audio=new AudioContext();const buffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate);const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;const filter=audio.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1000;rainGain=audio.createGain();rainGain.gain.value=.045;source.connect(filter).connect(rainGain).connect(audio.destination);source.start();}audio.resume().catch(()=>{});}catch{soundOn=false;$('sound').textContent='SOUND UNAVAILABLE';}}
function tone(frequency,duration=.2,volume=.025,type='sine'){if(!soundOn||!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=frequency;g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration);}
function spray(){if(!state.playing)return;if(!state.spray){caption('Clown repellent is on the entry console, beside the phone.');return;}if(state.sprayCooldown>0)return;state.sprayCooldown=1.5;const c=state.clown;const distance=Math.hypot(c.x-state.player.x,c.z-state.player.z);camera.getWorldDirection(forward);const facing=((c.x-state.player.x)*forward.x+(c.z-state.player.z)*forward.z)/Math.max(distance,.01);if(distance<6 && facing>.6 && state.player.z>6 && c.mode!=='gone'){c.mode='flee';c.timer=12;caption('The clown recoils and retreats into the rain.');}else caption('A cloud of repellent. Keep it ready for the street.');tone(170,.5,.025,'sawtooth');$('inventory').textContent='REPELLENT · SPRAYING';}
function interact(){if(!state.playing)return;if(state.seated){state.seated=null;caption('Back on your feet.');return;}if(!aimed)return;const a=aimed;
  switch(a.action){
    case 'door':if(state.doorOpen&&Math.abs(state.player.z-6)<.5&&state.player.x>-.3&&state.player.x<2.3){caption('Step clear of the doorway before closing it.');break;}state.doorOpen=!state.doorOpen;tone(state.doorOpen?150:110,.2);break;
    case 'pickup':state.spray=true;world.views.get('spray').visible=false;caption('Repellent equipped. Press F or SPRAY to use it. Unlimited refills.');break;
    case 'guard':state.escort=!state.escort;caption(state.escort?'BODYGUARD: We’ll cover you outside. Stay close.':'BODYGUARD: We’ll hold the entrance. He’s not getting inside.');break;
    case 'phone':if(state.backup==='idle'){state.backup='called';state.backupTime=0;tone(660,.12);caption('DISPATCH: Backup is on the way. Stay with your guards.');}else caption(state.backup==='arrived'?'DISPATCH: The street is secure. Take your time at home.':'DISPATCH: The team is approaching. Hold tight.');break;
    case 'tv':state.tv=!state.tv;world.screen.material.emissiveIntensity=state.tv?.65:0;world.screen.material.color.set(state.tv?'#80a29e':'#142325');break;
    case 'sit':state.seated='sofa';caption('A moment of quiet. Press E to stand up.');break;
    case 'rest':state.seated='bed';caption('You close your eyes, but the rain keeps you awake. Press E to get up.');break;
    case 'coffee':caption('Cold coffee. It’s going to be a long night.');break;
    case 'card':caption('“Happy birthday, kiddo. We’ll find a better clown next year.”');break;
  }
}
function aim(){
  aimed=null;camera.getWorldDirection(forward);let best=.87;
  for(const t of world.targets){if(t.id==='spray'&&state.spray)continue;delta.copy(t.position).sub(camera.position);const distance=delta.length();if(distance>2.65)continue;const alignment=delta.normalize().dot(forward);if(alignment<best)continue;
    // The ray must reach the target before crossing static walls or furniture.
    ray.set(camera.position,delta);ray.far=Math.max(0,distance-.45);const hits=ray.intersectObjects(scene.children,true);if(hits.some(h=>h.object!==world.views.get(t.id)&&h.object.parent!==held&&h.object.type==='Mesh'&&h.object.material.opacity>=1))continue;
    best=alignment;aimed=t;
  }
  $('interact').hidden=!aimed&&!state.seated;
  let label=aimed?.label;
  if(aimed?.id==='door')label=state.doorOpen?'Close front door':'Open front door';
  if(aimed?.id==='tv')label=state.tv?'Switch off the television':'Switch on the television';
  if(state.seated)label='Stand up';
  $('interact').querySelector('span').textContent=label||'';
}
function jump(){if(state.playing && state.player.y===0 && !state.seated){state.player.velocity=3.6;}}
function look(dx,dy){state.player.yaw-=dx*.0025;state.player.pitch=THREE.MathUtils.clamp(state.player.pitch-dy*.0025,-1.3,1.3);}
function bindInput(){
  $('start').onclick=start;$('pause').onclick=pause;$('interact').onclick=interact;$('spray').onclick=spray;$('jump').onclick=jump;$('crouch').onclick=()=>{state.crouched=!state.crouched;};
  $('help-toggle').onclick=()=>{$('help').hidden=!$('help').hidden;$('help-toggle').setAttribute('aria-expanded',String(!$('help').hidden));};
  $('sound').onclick=()=>{soundOn=!soundOn;$('sound').setAttribute('aria-pressed',String(soundOn));$('sound').textContent=soundOn?'SOUND ON':'SOUND OFF';if(soundOn)ensureAudio();else audio?.suspend();};
  addEventListener('keydown',e=>{if(!state.playing)return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyE')interact();if(e.code==='KeyF')spray();if(e.code==='KeyC')state.crouched=!state.crouched;if(e.code==='Space')jump();if(e.code==='Escape')pause();});
  addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&state.playing)pause();});
  document.addEventListener('mousemove',e=>{if(state.playing&&document.pointerLockElement===canvas)look(e.movementX,e.movementY);});
  canvas.addEventListener('pointerdown',e=>{if(!state.playing||document.pointerLockElement)return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!drag||!state.playing)return;look(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>drag=null);
  const stick=$('stick');stick.onpointerdown=e=>{if(stickId!==null)return;stickId=e.pointerId;stick.setPointerCapture(e.pointerId);};stick.onpointermove=e=>{if(e.pointerId!==stickId)return;const r=stick.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,z=e.clientY-r.top-r.height/2;const length=Math.hypot(x,z);if(length>35){x*=35/length;z*=35/length;}touchX=x/35;touchZ=z/35;$('knob').style.transform=`translate(${x}px,${z}px)`;};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,e=>{if(e.pointerId!==stickId)return;stickId=null;touchX=0;touchZ=0;$('knob').style.transform='';});
  const pad=$('touch-look');let lx=0,ly=0;pad.onpointerdown=e=>{if(lookId!==null)return;lookId=e.pointerId;lx=e.clientX;ly=e.clientY;pad.setPointerCapture(e.pointerId);};pad.onpointermove=e=>{if(e.pointerId!==lookId)return;look((e.clientX-lx)*1.5,(e.clientY-ly)*1.5);lx=e.clientX;ly=e.clientY;};for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,e=>{if(e.pointerId===lookId)lookId=null;});
}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
function update(dt){
  if(state.playing||!state.started)state.time+=dt;const p=state.player;
  if(state.playing){
    let x=touchX+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    let z=touchZ+Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
    const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}
    const speed=state.crouched?1.35:keys.has('ShiftLeft')?4.1:2.5;
    if(!state.seated)movePlayer(p,(x*Math.cos(p.yaw)+z*Math.sin(p.yaw))*speed*dt,(-x*Math.sin(p.yaw)+z*Math.cos(p.yaw))*speed*dt,world.colliders,state.doorOpen);
    p.velocity-=9.8*dt;p.y=Math.max(0,p.y+p.velocity*dt);if(p.y===0)p.velocity=0;
    const eye=state.seated?(state.seated==='bed'?.95:1.18):state.crouched?1.04:1.68;
    const seat=state.seated==='sofa'?[-5.4,1.45]:state.seated==='bed'?[-5.8,-4.3]:[p.x,p.z];camera.position.set(seat[0],THREE.MathUtils.lerp(camera.position.y,eye+p.y,1-Math.exp(-14*dt)),seat[1]);camera.rotation.set(p.pitch,p.yaw,0,'YXZ');
    if(updateClown(state,dt)==='guard')caption('BODYGUARD: Back off. This family is under our protection.');
    if(state.backup==='called'){state.backupTime+=dt;world.van.visible=true;world.van.position.set(16-Math.min(18,state.backupTime*2),0,11);if(state.backupTime>=9){state.backup='arrived';caption('SECURITY: Perimeter secure. He won’t be back tonight.');}}
    state.captionTime-=dt;if(state.captionTime<=0)$('caption').classList.remove('show');state.sprayCooldown=Math.max(0,state.sprayCooldown-dt);
    held.visible=state.spray;
    mist.visible=state.sprayCooldown>.8;
    mist.material.opacity=Math.max(0,(state.sprayCooldown-.8)*.45);
    mist.scale.setScalar(1+(1.5-state.sprayCooldown)*2);
    $('room').textContent=roomAt(p.x,p.z);$('status').textContent=state.backup==='arrived'?'The street is secure':state.escort?'Bodyguards escorting you':'Two guards on watch';
    $('objective').textContent=state.backup==='arrived'?'You’re safe. Make yourself at home.':state.backup==='called'?'Backup is approaching. Stay near the guards.':p.z>6?'The phone inside can call security backup.':'Explore your home. Check the front entrance.';
    $('inventory').textContent=state.spray?(state.sprayCooldown>0?'REPELLENT · SPRAYING':'REPELLENT READY · F'):'NO ITEM EQUIPPED';aim();
    if(soundOn&&Math.floor(state.time*2)!==Math.floor((state.time-dt)*2)&&state.clown.mode!=='gone')tone([261.6,311.1,392,369.9][Math.floor(state.time*2)%4],.18,p.z>6?.018:.004,'triangle');
  } else if(!state.started){camera.position.set(-5.4,1.8,-.1);camera.lookAt(-1.7+Math.sin(state.time*.08)*.2,1.45,5.8);}
  world.door.rotation.y=THREE.MathUtils.lerp(world.door.rotation.y,state.doorOpen?-Math.PI*.51:0,1-Math.exp(-7*dt));
  const c=state.clown;world.clown.visible=c.mode!=='gone';world.clown.position.set(c.x,0,c.z);world.clown.rotation.y=Math.atan2(p.x-c.x,p.z-c.z);
  world.guards.forEach((g,i)=>{const tx=state.escort&&p.z>6?p.x+(i?1:-1):i?2.65:-.65;const tz=state.escort&&p.z>6?Math.max(7,p.z-.8):7;g.position.x=THREE.MathUtils.lerp(g.position.x,tx,1-Math.exp(-3*dt));g.position.z=THREE.MathUtils.lerp(g.position.z,tz,1-Math.exp(-3*dt));g.rotation.y=Math.atan2(c.x-g.position.x,c.z-g.position.z);world.targets.find(t=>t.id==='guard'+i).position.set(g.position.x,1.5,g.position.z);});
  const positions=world.positions;for(let i=0;i<positions.length;i+=6){positions[i+1]-=dt*9;positions[i+4]-=dt*9;if(positions[i+1]<0){positions[i+1]=15;positions[i+4]=14.7;}}world.rain.geometry.attributes.position.needsUpdate=true;
  const flash=!reducedMotion&&state.time%19>.1&&state.time%19<.23;moon.intensity=flash?3.5:.8;
  if(rainGain&&audio?.state==='running')rainGain.gain.setTargetAtTime(p.z>6?.09:.035,audio.currentTime,.3);
}
try{
  scene=new THREE.Scene();scene.background=new THREE.Color('#182d36');scene.fog=new THREE.FogExp2('#182d36',.019);
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  camera=new THREE.PerspectiveCamera(67,1,.07,95);camera.position.set(-3,1.68,1.5);
  scene.add(new THREE.HemisphereLight('#afc9d0','#64563d',1.35));moon=new THREE.DirectionalLight('#a1c8e1',.8);moon.position.set(-7,12,15);moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);Object.assign(moon.shadow.camera,{left:-12,right:12,top:12,bottom:-12});moon.shadow.bias=-.001;scene.add(moon);
  world=buildWorld(scene);
  scene.add(camera);
  held=new THREE.Group();camera.add(held);held.visible=false;
  const bottle=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.25,10),new THREE.MeshStandardMaterial({color:'#b4c594'}));bottle.position.set(.3,-.28,-.55);bottle.rotation.z=-.15;held.add(bottle);
  const nozzle=new THREE.Mesh(new THREE.BoxGeometry(.05,.045,.06),new THREE.MeshStandardMaterial({color:'#28332f'}));nozzle.position.set(.315,-.145,-.55);held.add(nozzle);
  const mistPoints=new Float32Array(90);for(let i=0;i<90;i+=3){mistPoints[i]=(Math.random()-.5)*.3;mistPoints[i+1]=(Math.random()-.5)*.3;mistPoints[i+2]=-Math.random()*.65;}
  const mistGeo=new THREE.BufferGeometry();mistGeo.setAttribute('position',new THREE.BufferAttribute(mistPoints,3));mist=new THREE.Points(mistGeo,new THREE.PointsMaterial({color:'#d7e7a5',size:.07,transparent:true,opacity:.4,depthWrite:false}));mist.position.set(.27,-.12,-.7);camera.add(mist);mist.visible=false;
  bindInput();resize();addEventListener('resize',resize);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();fail('The graphics context was interrupted. Reload to return to the apartment.');});
  $('start').disabled=false;$('start').textContent='Enter the apartment  →';
  renderer.setAnimationLoop(now=>{const dt=Math.min((now-(last||now))/1000,.04);last=now;if(!document.hidden){update(dt);renderer.render(scene,camera);}});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('apartment-sw.js').catch(()=>{});
}catch(error){console.error(error);fail('The apartment could not load. Please reload with WebGL enabled.');}

