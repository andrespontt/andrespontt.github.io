import * as THREE from 'three';
import {buildWorld} from './world.js';
import {animateCharacter} from './characters.js';
import {createState,movePlayer,roomAt} from './simulation.js';
import {updateClown,updateGuards,isProtected,rainSettings} from './simulation.js';

const $=id=>document.getElementById(id);
const state=createState(), keys=new Set();
const canvas=$('scene');
let renderer,world,camera,scene,moon,aimed=null,last=0,drag=null,stickId=null,lookId=null;
let touchX=0,touchZ=0,audio=null,soundOn=true,rainGain=null,rainFilter=null,held=null,mist=null;
const ray=new THREE.Raycaster(),forward=new THREE.Vector3(),delta=new THREE.Vector3();
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function fail(message){$('error-message').textContent=message;$('error').hidden=false;}
function caption(message){$('caption').textContent=message;state.captionTime=5.5;$('caption').classList.add('show');}
function clearInput(){keys.clear();touchX=0;touchZ=0;drag=null;stickId=null;lookId=null;$('knob').style.transform='';}
function pause(){if(!state.playing)return;state.playing=false;clearInput();document.exitPointerLock?.();document.body.classList.remove('playing');$('hud').hidden=true;$('menu').hidden=false;$('menu-footer').hidden=false;$('start').textContent='Resume the night  →';stopAudio();$('start').focus();}
function endRun(){
  state.playing=false;clearInput();stopAudio();document.exitPointerLock?.();
  document.body.classList.remove('playing');$('hud').hidden=true;$('menu').hidden=true;$('menu-footer').hidden=true;
  $('caught').hidden=false;$('retry').focus();
}
function start(){if(state.caught)return;state.playing=true;state.started=true;$('menu').hidden=true;$('hud').hidden=false;$('menu-footer').hidden=true;document.body.classList.add('playing');last=performance.now();if(soundOn)ensureAudio();if(!matchMedia('(pointer: coarse)').matches){try{const request=canvas.requestPointerLock?.();request?.catch(()=>caption('Drag to look. WASD to move. E to interact.'));}catch{caption('Drag to look. WASD to move. E to interact.');}}caption('You’re home. The guards are at the front door.');}
// AUDIO START: prepared samples need no network or decoding during the Enter tap.
const rainSamples=new Float32Array(22050*2);
for(let i=0;i<rainSamples.length;i++)rainSamples[i]=Math.random()*2-1;
let musicGain=null,musicFilter=null,musicNextTime=0,musicStep=0,activeVoice=null,pendingDialogue=null,hasGreeted=false;
let masterGain=null,audioWanted=false,audioPending=false,audioFailed=false,audioAttempt=0;
try{soundOn=localStorage.getItem('apartment-sound')!=='off';}catch{}
function updateSoundUI(){
  const running=audio?.state==='running'&&audioWanted&&!audioFailed;
  const label=!soundOn?'SOUND OFF':audioPending?'STARTING SOUND':running?'SOUND ON':audioFailed||audioWanted?'TAP FOR SOUND':'SOUND READY';
  for(const id of ['sound','hud-sound']){
    const button=$(id);if(!button)continue;
    button.textContent=label;
    button.setAttribute('aria-pressed',String(soundOn));
    button.setAttribute('aria-label',!soundOn?'Enable sound':running?'Mute sound':'Start or retry sound');
  }
}
function stopAudio(){
  audioWanted=false;audioAttempt++;audioPending=false;cancelVoice();musicNextTime=0;
  if(masterGain&&audio)masterGain.gain.setValueAtTime(0,audio.currentTime);
  if(audio&&audio.state!=='closed')audio.suspend().catch(()=>{});
  updateSoundUI();
}
function ensureAudio(){
  if(!soundOn||audioPending)return;
  audioWanted=true;
  try{
    // A failed or interrupted iOS context can require replacement on a new tap.
    if(audio&&(audioFailed||audio.state==='interrupted'||audio.state==='closed')){
      audio.onstatechange=null;
      if(audio.state!=='closed')audio.close().catch(()=>{});
      audio=null;
    }
    if(!audio){
      const Context=window.AudioContext||window.webkitAudioContext;
      if(!Context)throw new Error('Web Audio unavailable');
      try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
      audio=new Context();musicNextTime=0;musicStep=0;cancelVoice();
      masterGain=audio.createGain();masterGain.gain.value=0;masterGain.connect(audio.destination);
      const buffer=audio.createBuffer(1,rainSamples.length,22050);
      buffer.getChannelData(0).set(rainSamples);
      const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;
      const filter=audio.createBiquadFilter();rainFilter=filter;filter.type='lowpass';filter.frequency.value=550;
      rainGain=audio.createGain();rainGain.gain.value=.018;
      source.connect(filter).connect(rainGain).connect(masterGain);source.start();
      musicGain=audio.createGain();musicGain.gain.value=0;
      musicFilter=audio.createBiquadFilter();musicFilter.type='lowpass';musicFilter.frequency.value=750;
      musicFilter.connect(musicGain).connect(masterGain);
      prepareVoices(audio);
      audio.onstatechange=()=>updateSoundUI();
    }
    const context=audio,attempt=++audioAttempt;
    audioFailed=false;audioPending=true;updateSoundUI();
    // Call resume synchronously inside the user's click, before any await.
    const resume=context.resume();
    const timeout=setTimeout(()=>{
      if(attempt!==audioAttempt)return;
      audioAttempt++;audioPending=false;audioFailed=true;updateSoundUI();
    },2000);
    Promise.resolve(resume).then(()=>{
      clearTimeout(timeout);
      if(attempt!==audioAttempt||context!==audio||!audioWanted||!soundOn)return;
      audioPending=false;audioFailed=context.state!=='running';
      if(!audioFailed){masterGain.gain.setValueAtTime(1,context.currentTime);tone(523.25,.15,.025);if(pendingDialogue)playDialogue(pendingDialogue.id);}
      updateSoundUI();
    }).catch(()=>{
      clearTimeout(timeout);
      if(attempt!==audioAttempt)return;
      audioPending=false;audioFailed=true;updateSoundUI();
    });
  }catch{
    audioPending=false;audioFailed=true;updateSoundUI();
    caption('Sound couldn’t start. Tap the sound button to try again.');
  }
}
function toggleSound(){
  if(soundOn&&(audioPending||(audioWanted&&audio?.state==='running'&&!audioFailed))){soundOn=false;stopAudio();}
  else{soundOn=true;ensureAudio();}
  try{localStorage.setItem('apartment-sound',soundOn?'on':'off');}catch{}
  updateSoundUI();
}
function tone(frequency,duration=.2,volume=.025,type='sine',output=masterGain,when=audio?.currentTime){
  if(!soundOn||!audioWanted||!audio||audio.state!=='running'||audioFailed)return;
  const o=audio.createOscillator(),g=audio.createGain();
  o.type=type;o.frequency.value=frequency;
  g.gain.setValueAtTime(volume,when);g.gain.exponentialRampToValueAtTime(.0001,when+duration);
  o.connect(g).connect(output);o.onended=()=>{o.disconnect();g.disconnect();};o.start(when);o.stop(when+duration);
}
const dialogue={
  welcome:['BODYGUARD',"Evening. We're watching the street. Stay inside if you hear that music."],
  escort:['BODYGUARD',"We'll cover you outside. Stay close."],
  hold:['BODYGUARD',"We'll hold the entrance. He's not getting inside."],
  warning:['BODYGUARD','Back off. This family is under our protection.'],
  incoming:['DISPATCH','Backup is on the way. Stay with your guards.'],
  waiting:['DISPATCH','The team is approaching. Hold tight.'],
  secure:['SECURITY',"Perimeter secure. He won't be back tonight. Make yourself at home."],
};
const voiceBuffers=new Map();
const voiceDownloads=Promise.all(Object.keys(dialogue).map(async id=>{
  try{
    const response=await fetch(`apartment/voices/${id}.wav`);
    if(!response.ok)throw new Error(`Voice ${id}: ${response.status}`);
    return [id,await response.arrayBuffer()];
  }catch(error){console.warn('Dialogue could not preload:',error);return null;}
}));
async function prepareVoices(context){
  voiceBuffers.clear();
  const downloads=await voiceDownloads;
  if(context!==audio)return;
  await Promise.all(downloads.filter(Boolean).map(async([id,bytes])=>{
    try{
      const buffer=await context.decodeAudioData(bytes.slice(0));
      if(context!==audio)return;
      voiceBuffers.set(id,buffer);
      if(pendingDialogue?.id===id)playDialogue(id);
    }catch(error){console.warn('Dialogue could not decode:',error);}
  }));
}
function cancelVoice(){
  pendingDialogue=null;
  if(activeVoice){activeVoice.onended=null;try{activeVoice.stop();}catch{}activeVoice.disconnect();activeVoice=null;}
}
function playDialogue(id){
  if(!soundOn||!audioWanted||!audio||audio.state!=='running')return;
  if(pendingDialogue&&pendingDialogue.expires<Date.now()){pendingDialogue=null;return;}
  const buffer=voiceBuffers.get(id);
  if(!buffer){pendingDialogue={id,expires:Date.now()+10000};return;}
  cancelVoice();
  const source=audio.createBufferSource();source.buffer=buffer;source.connect(masterGain);activeVoice=source;
  source.onended=()=>{source.disconnect();if(activeVoice===source)activeVoice=null;};
  state.captionTime=Math.max(state.captionTime,buffer.duration+.5);source.start();
}
function say(id){
  const [speaker,line]=dialogue[id];caption(`${speaker}: ${line}`);
  if(!soundOn)return;
  if(audio?.state!=='running')ensureAudio();
  pendingDialogue={id,expires:Date.now()+10000};playDialogue(id);
}
// An original minor-key calliope waltz. Schedule ahead on the audio clock so
// frame-rate dips cannot skip notes. Door distance controls gain and filtering.
const circusMelody=[69,72,76,75,72,71,69,64,68,71,74,72,69,72,77,76,72,71,68,71,76,74,71,68];
function musicSettings(player,doorOpen){
  const near=Math.max(0,1-Math.hypot(player.x-1,player.z-6)/7);
  const outside=player.z>6;
  return {gain:outside?.72:.04+near*(doorOpen?.62:.42),cutoff:outside?5200:doorOpen?3200:650+near*900};
}
function updateMusic(player,doorOpen,present){
  if(!soundOn||!audioWanted||!audio||audio.state!=='running'||!musicGain)return;
  const settings=musicSettings(player,doorOpen);
  musicGain.gain.setTargetAtTime(present?settings.gain*(activeVoice?.22:1):0,audio.currentTime,.22);
  musicFilter.frequency.setTargetAtTime(settings.cutoff,audio.currentTime,.22);
  if(!present){musicNextTime=0;return;}
  if(musicNextTime<audio.currentTime)musicNextTime=audio.currentTime;
  while(musicNextTime<audio.currentTime+.12){
    const index=musicStep%circusMelody.length;
    const hz=440*2**((circusMelody[index]-69)/12);
    tone(hz,.27,.11,'triangle',musicFilter,musicNextTime);
    tone(hz*2,.19,.025,'sine',musicFilter,musicNextTime);
    const bass=index<6||index>=12&&index<18?110:164.81;
    if(musicStep%3===0)tone(bass,.24,.095,'triangle',musicFilter,musicNextTime);
    else{tone(bass*2,.16,.035,'triangle',musicFilter,musicNextTime);tone(bass*3,.16,.025,'triangle',musicFilter,musicNextTime);}
    musicStep++;musicNextTime+=.32;
  }
}
// AUDIO END
function spray(){if(!state.playing)return;if(!state.spray){caption('Clown repellent is on the entry console, beside the phone.');return;}if(state.sprayCooldown>0)return;state.sprayCooldown=1.5;const c=state.clown;const distance=Math.hypot(c.x-state.player.x,c.z-state.player.z);camera.getWorldDirection(forward);const facing=((c.x-state.player.x)*forward.x+(c.z-state.player.z)*forward.z)/Math.max(distance,.01);if(distance<6 && facing>.6 && state.player.z>6 && c.mode!=='gone'){c.mode='flee';c.timer=12;caption('The clown recoils and retreats into the rain.');}else caption('A cloud of repellent. Keep it ready for the street.');tone(170,.5,.025,'sawtooth');$('inventory').textContent='REPELLENT · SPRAYING';}
function interact(){if(!state.playing)return;if(state.seated){state.seated=null;caption('Back on your feet.');return;}if(!aimed)return;const a=aimed;
  switch(a.action){
    case 'door':if(state.doorOpen&&Math.abs(state.player.z-6)<.5&&state.player.x>-.3&&state.player.x<2.3){caption('Step clear of the doorway before closing it.');break;}state.doorOpen=!state.doorOpen;tone(state.doorOpen?150:110,.2);break;
    case 'pickup':state.spray=true;world.views.get('spray').visible=false;caption('Repellent equipped. Press F or SPRAY to use it. Unlimited refills.');break;
    case 'guard':state.escort=!state.escort;say(state.escort?'escort':'hold');break;
    case 'phone':if(state.backup==='idle'){state.backup='called';state.backupTime=0;tone(660,.12);say('incoming');}else say(state.backup==='arrived'?'secure':'waiting');break;
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
  $('sound').onclick=toggleSound;
  $('hud-sound').onclick=toggleSound;
  updateSoundUI();
  document.addEventListener('click',event=>{
    if(event.target.closest('button,a'))return;
    if(state.playing&&soundOn&&audio?.state!=='running')ensureAudio();
  });
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
    updateGuards(state,dt,world.colliders);
    const encounter=updateClown(state,dt,world.colliders);
    if(encounter==='guard'){tone(85,.16,.12,'triangle');say('warning');}
    if(encounter==='caught'){endRun();return;}
    if(state.backup==='called'){state.backupTime+=dt;world.van.visible=true;world.van.position.set(16-Math.min(18,state.backupTime*2),0,11);if(state.backupTime>=9){state.backup='arrived';say('secure');}}
    state.captionTime-=dt;if(state.captionTime<=0)$('caption').classList.remove('show');state.sprayCooldown=Math.max(0,state.sprayCooldown-dt);
    held.visible=state.spray;
    mist.visible=state.sprayCooldown>.8;
    mist.material.opacity=Math.max(0,(state.sprayCooldown-.8)*.45);
    mist.scale.setScalar(1+(1.5-state.sprayCooldown)*2);
    $('room').textContent=roomAt(p.x,p.z);$('status').textContent=state.backup==='arrived'?'The street is secure':isProtected(state,world.colliders)?'Protected · guard nearby':p.z>6?'Exposed · stay near a guard':'Sheltered · watch the entrance';
    $('objective').textContent=state.backup==='arrived'?'You’re safe. Make yourself at home.':state.backup==='called'?'Backup is approaching. Stay near the guards.':p.z>6?'The phone inside can call security backup.':'Explore your home. Check the front entrance.';
    $('inventory').textContent=state.spray?(state.sprayCooldown>0?'REPELLENT · SPRAYING':'REPELLENT READY · F'):'NO ITEM EQUIPPED';aim();
    updateMusic(p,state.doorOpen,state.clown.mode!=='gone');
    if(!hasGreeted&&Math.hypot(p.x-1,p.z-6)<2.4){hasGreeted=true;say('welcome');}
  } else if(!state.started){camera.position.set(-5.4,1.8,-.1);camera.lookAt(-1.7+Math.sin(state.time*.08)*.2,1.45,5.8);}
  world.door.rotation.y=THREE.MathUtils.lerp(world.door.rotation.y,state.doorOpen?-Math.PI*.51:0,1-Math.exp(-7*dt));
  const c=state.clown;world.clown.visible=c.mode!=='gone';world.clown.position.set(c.x,0,c.z);const facing=['blocked','stunned'].includes(c.mode)?state.guards[c.defender]||p:p;world.clown.rotation.y=c.mode==='flee'?Math.atan2(3,2):Math.atan2(facing.x-c.x,facing.z-c.z);
  animateCharacter(world.clown,state.time,state.playing?dt:0,c.mode);
  world.guards.forEach((g,i)=>{const guard=state.guards[i];g.position.set(guard.x,0,guard.z);g.rotation.y=Math.atan2(c.x-guard.x,c.z-guard.z);world.targets.find(t=>t.id==='guard'+i).position.set(guard.x,1.5,guard.z);});
  world.guards.forEach((g,i)=>animateCharacter(g,state.time,state.playing?dt:0,'watch',state.guards[i].punch||0));
  const positions=world.positions;for(let i=0;i<positions.length;i+=6){positions[i+1]-=dt*9;positions[i+4]-=dt*9;if(positions[i+1]<0){positions[i+1]=15;positions[i+4]=14.7;}}world.rain.geometry.attributes.position.needsUpdate=true;
  const flash=!reducedMotion&&state.time%19>.1&&state.time%19<.23;moon.intensity=flash?3.5:.8;
  if(rainGain&&audio?.state==='running'){
    const rain=rainSettings(p,state.doorOpen);
    rainGain.gain.setTargetAtTime(rain.gain,audio.currentTime,.4);
    rainFilter.frequency.setTargetAtTime(rain.cutoff,audio.currentTime,.4);
  }
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

