import * as THREE from 'three';
import { AreaManager } from './area-manager.mjs';
import { createTerminal } from './terminal.js?v=room2';

const $=id=>document.getElementById(id);
const canvas=$('scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const camera=new THREE.PerspectiveCamera(70,1,.05,240);
const manager=new AreaManager({outside:()=>import('./areas/outside.js'),vehicle:()=>import('./areas/vehicle.js'),bunker:()=>import('./areas/bunker.js?v=room2'),dev:()=>import('./areas/dev.js')},{onDispose(){renderer.renderLists.dispose();}});
const names={outside:'Snowfield / Outpost 07',vehicle:'Nomad / Crew compartment',bunker:'Bunker 07 / Situation room',dev:'Dev / Scenarios'};
let overview=true,paused=false,transitioning=false,terminalOpen=false,weather='blizzard',yaw=0,pitch=0,distance=38,drag=null,fallbackLook=false,last=performance.now(),diagnosticTime=0;
const walker={x:0,z:0},keys=new Set(),fine=matchMedia('(pointer:fine)');
let touchMoveX=0,touchMoveY=0,stickPointer=null;
let currentInteraction=null;
// First-person weapon (areas that provide fire()): held trigger fires at ~9 rounds/s.
let triggerHeld=false,fireCooldown=0;
const devParam=new URLSearchParams(location.search).get('dev');
const isDev=id=>String(id).startsWith('dev/');
// Dev pages expose internals for automated checks (no effect on the normal game).
if(devParam!==null)globalThis.bunkerDebug={get manager(){return manager;},get camera(){return camera;}};
const devTitles={};
const areaName=id=>names[id]||(id===manager.id&&manager.current?.title)||devTitles[id]||'Dev scenario';
// The address always names where you are, so a refresh returns there: ?dev=<scenario> or ?dev for the menu.
function syncUrl(){
 const next=isDev(manager.id)?'?dev='+manager.id.slice(4):devMenuOpen?'?dev':'';
 if(location.search!==next)history.replaceState(null,'',location.pathname+next);
}
let devMenuOpen=false;
async function openDevMenu(){
 if(transitioning)return;
 releaseLook();devMenuOpen=true;$('dev-menu').hidden=false;syncUrl();
 const list=$('dev-menu-list');
 try{
  const {default:scenarios}=await import('./dev/scenarios/index.js');
  list.replaceChildren(...scenarios.map(sc=>{devTitles['dev/'+sc.id]='Dev / '+sc.title;const b=document.createElement('button');b.className='dev-menu-item';b.setAttribute('aria-current',String(manager.id==='dev/'+sc.id));b.innerHTML='<b></b><span></span>';b.querySelector('b').textContent=sc.title;b.querySelector('span').textContent=sc.summary||'';b.onclick=()=>{closeDevMenu();travel('dev/'+sc.id);};return b;}));
  list.querySelector('button')?.focus({preventScroll:true});
 }catch(error){console.error(error);list.textContent='Scenarios could not load.';}
}
function closeDevMenu(){if(!devMenuOpen)return;devMenuOpen=false;$('dev-menu').hidden=true;syncUrl();}
const weatherOrder=['flurries','snowfall','blizzard','whiteout'];
const locked=()=>fallbackLook||document.pointerLockElement===canvas;
function syncCursor(){
 document.body.classList.toggle('fps-locked',locked());
 $('cursor-toggle').textContent=locked()?'Cursor · Tab':'Mouse-look · Tab';
 $('cursor-toggle').setAttribute('aria-pressed',String(locked()));
 $('look-help').textContent=overview?'Drag to orbit · Scroll to zoom':fine.matches?(locked()?'WASD move · Mouse look · E interact · Tab / Esc cursor':'WASD move · Click scene for mouse-look · E interact'):'Use the circle to move · Drag to look · Tap interaction';
 keys.clear();drag=null;
}
function clearStick(){touchMoveX=0;touchMoveY=0;stickPointer=null;$('movement-knob').style.transform='';}
function releaseLook(){triggerHeld=false;fallbackLook=false;keys.clear();clearStick();if(document.pointerLockElement===canvas)document.exitPointerLock();syncCursor();}
async function lockLook(){
 if(overview||paused||transitioning||terminalOpen||!fine.matches)return;
 if(typeof canvas.requestPointerLock!=='function'){fallbackLook=true;syncCursor();return;}
 try{await canvas.requestPointerLock();}catch{fallbackLook=true;syncCursor();}
}
document.addEventListener('pointerlockchange',syncCursor);document.addEventListener('pointerlockerror',syncCursor);
function setPose(spawn){walker.x=spawn.x;walker.z=spawn.z;yaw=spawn.yaw||0;pitch=spawn.pitch||0;}
function updateUI(){
 const outside=manager.id==='outside';
 document.body.classList.toggle('inside',!overview);
 document.body.dataset.area=manager.id;
 $('area-name').textContent=`${areaName(manager.id)} · ${weather.toUpperCase()}`;
 renderTools();
 $('cabin-status').hidden=false;
 document.body.classList.toggle('terminal-open',terminalOpen);
 $('situation-terminal').hidden=!terminalOpen;
 $('enter-vehicle').hidden=!overview;$('enter-bunker').hidden=!overview;
 $('walk-outside').hidden=!overview;$('leave-area').hidden=outside;
 $('overview').hidden=!outside||overview;
 const armed=!overview&&!!manager.current?.fire;$('fire').hidden=!armed;document.body.classList.toggle('has-weapon',armed);
 $('use-terminal').hidden=manager.id!=='bunker';$('weather-cycle').hidden=overview;$('enter-dev').hidden=!overview&&!isDev(manager.id);$('enter-dev').textContent=isDev(manager.id)?'Scenarios menu':'Dev scenarios →';$('weather-cycle').textContent='Weather · '+weather[0].toUpperCase()+weather.slice(1)+' · N';$('cursor-toggle').hidden=overview;$('cabin-view').hidden=manager.id!=='vehicle';
 $('weather-panel').hidden=!overview;$('scene-caption').hidden=!overview;
 $('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(paused));
 syncCursor();
}
async function travel(id,entry){
 if(transitioning)return;
 closeSituationTerminal();
 transitioning=true;for(const b of document.querySelectorAll('#area-actions button'))b.disabled=true;releaseLook();$('transition').hidden=false;$('transition-label').textContent='Entering '+areaName(id)+'…';$('transition-error').hidden=true;
 // Let the loading surface paint before procedural geometry is created.
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 try{
  const changed=await manager.go(id);
  if(changed){if(id!=='bunker'&&tacticalTerminal){tacticalTerminal.dispose();tacticalTerminal=null;}overview=id==='outside'&&!entry;setPose(manager.current.entrySpawns?.[entry]||manager.current.spawn);if(overview){yaw=0;pitch=0;}paused=false;currentInteraction=null;if(id==='bunker')manager.current.setMapState?.({weather});updateUI();syncUrl();}
  $('error').hidden=true;
 }catch(error){console.error(error);$('error').hidden=false;$('error-message').textContent='This area could not load. Your current area is preserved. Retry the entrance when ready.';}
 finally{transitioning=false;for(const b of document.querySelectorAll('#area-actions button'))b.disabled=false;$('transition').hidden=true;if(manager.current&&!overview)lockLook();}
}
$('enter-vehicle').onclick=()=>travel('vehicle');$('enter-dev').onclick=openDevMenu;$('dev-menu-close').onclick=closeDevMenu;$('enter-bunker').onclick=()=>travel('bunker');
$('leave-area').onclick=()=>travel('outside',manager.id==='bunker'?'bunker':manager.id==='vehicle'?'vehicle':undefined);
$('walk-outside').onclick=()=>{overview=false;setPose(manager.current.spawn);updateUI();lockLook();};
$('overview').onclick=()=>{releaseLook();overview=true;yaw=0;pitch=0;distance=38;updateUI();};
$('cursor-toggle').onclick=()=>locked()?releaseLook():lockLook();
$('cabin-view').onclick=()=>{yaw=Math.cos(yaw)>0?Math.PI:0;pitch=-.1;};
$('reset').onclick=()=>{if(manager.current)setPose(manager.current.spawn);if(overview){yaw=0;pitch=0;distance=38;}};
$('pause').onclick=()=>{paused=!paused;if(paused)releaseLook();$('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(paused));};
$('dismiss-error').onclick=()=>$('error').hidden=true;
let tacticalTerminal=null;
function openSituationTerminal(){
 if(manager.id!=='bunker'||terminalOpen||transitioning)return;
 releaseLook();terminalOpen=true;updateUI();
 tacticalTerminal??=createTerminal($('situation-terminal'),{
  onClose:closeSituationTerminal,
  onState(next){manager.current?.setMapState?.(next);}
 });
 tacticalTerminal.open({...manager.current.snapshot?.(),weather});
}
function closeSituationTerminal(){
 if(!terminalOpen)return;
 tacticalTerminal?.close();terminalOpen=false;keys.clear();clearStick();updateUI();$('use-terminal').focus({preventScroll:true});
}
$('use-terminal').onclick=openSituationTerminal;
function interact(){if(paused||transitioning||terminalOpen||!currentInteraction)return;const action=currentInteraction;if(action.panel==='situation-map'){openSituationTerminal();return;}if(action.destination)travel(action.destination,action.entry);else action.action?.();}
$('interact').onclick=interact;
const movementCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
addEventListener('keydown',e=>{
 if(devMenuOpen){if(e.code==='Escape'){e.preventDefault();closeDevMenu();}return;}
 if(e.target instanceof HTMLInputElement)return;
 if(terminalOpen){if(e.code==='Escape'){e.preventDefault();closeSituationTerminal();}return;}
 if(e.code==='KeyM'&&manager.id==='bunker'&&!e.repeat){openSituationTerminal();return;}
 if(!overview&&!terminalOpen&&movementCodes.includes(e.code)){e.preventDefault();keys.add(e.code);}
 if(e.code==='Escape'){if(terminalOpen){closeSituationTerminal();return;}releaseLook();return;}
 if(e.code==='Tab'&&!overview&&!terminalOpen){e.preventDefault();if(!e.repeat)$('cursor-toggle').click();}
 if(e.code==='KeyE'&&!e.repeat)interact();
 if(e.code==='KeyF'&&!e.repeat&&!overview&&manager.current?.fire){e.preventDefault();triggerHeld=true;}
 if(e.code==='KeyN'&&!e.repeat&&!overview)$('weather-cycle').click();
 const digit=/^Digit([1-9])$/.exec(e.code);if(digit&&!e.repeat&&!overview){const tool=manager.current?.tools?.[digit[1]-1];if(tool)runTool(tool);}
});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyF')triggerHeld=false;});
document.addEventListener('mouseup',()=>{if(!document.querySelector('#fire:active'))triggerHeld=false;});
const fireButton=$('fire');
fireButton.addEventListener('pointerdown',e=>{e.preventDefault();fireButton.setPointerCapture(e.pointerId);triggerHeld=true;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(event,()=>triggerHeld=false);addEventListener('blur',releaseLook);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseLook();last=performance.now();});
const stick=$('movement-stick'),knob=$('movement-knob');
function updateStick(e){const rect=stick.getBoundingClientRect(),radius=44;let x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2;const length=Math.hypot(x,y);if(length>radius){x*=radius/length;y*=radius/length;}touchMoveX=x/radius;touchMoveY=y/radius;knob.style.transform=`translate(${x}px,${y}px)`;}
stick.addEventListener('pointerdown',e=>{if(overview||paused||transitioning||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)updateStick(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if(e.pointerId===stickPointer)clearStick();});
document.addEventListener('mousemove',e=>{if(overview||paused||transitioning||terminalOpen||!locked())return;yaw-=e.movementX*.0025;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0025,-1.3,1.3);});
canvas.addEventListener('pointerdown',e=>{if(!overview&&e.pointerType==='mouse'){if(!locked())lockLook();else if(manager.current?.fire&&e.button===0)triggerHeld=true;return;}drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||locked()||paused||transitioning)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;yaw-=dx*.004;pitch=THREE.MathUtils.clamp(pitch+dy*(overview?.003:-.003),overview?-.18:-1.3,overview?.55:1.3);drag={x:e.clientX,y:e.clientY};});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
canvas.addEventListener('wheel',e=>{if(!overview)return;e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.025,18,65);},{passive:false});
const conditions={flurries:[5,160,'A quiet snowfall. The ridgeline reappears in the moonlight.'],snowfall:[24,90,'Steady snowfall. Follow the markers to the shelter.'],blizzard:[78,35,'Heavy snow. Violent crosswinds. Shelter is the only landmark.'],whiteout:[120,12,'The horizon disappears. Hold on to the light.']};
function setWeather(next){
 if(!conditions[next])return;weather=next;
 for(const b of document.querySelectorAll('[data-weather]'))b.setAttribute('aria-pressed',String(b.dataset.weather===weather));
 $('condition').textContent=weather.toUpperCase();$('wind').textContent=conditions[weather][0]+' KM/H';$('visibility').textContent=conditions[weather][1]+' M';$('description').textContent=conditions[weather][2];
 manager.current?.setMapState?.({weather});if(manager.current)updateUI();
}
for(const button of document.querySelectorAll('[data-weather]'))button.onclick=()=>setWeather(button.dataset.weather);
// Inside any area: step through the four presets without returning to the overview.
$('weather-cycle').onclick=()=>setWeather(weatherOrder[(weatherOrder.indexOf(weather)+1)%weatherOrder.length]);
// Optional per-area tool buttons (used by the dev scenarios area).
function renderTools(){
 const nav=$('area-tools'),tools=overview?[]:manager.current?.tools||[];
 if(nav.dataset.owner===manager.id+':'+overview&&nav.childElementCount===tools.length)return;
 nav.dataset.owner=manager.id+':'+overview;nav.replaceChildren(...tools.map((tool,i)=>{const b=document.createElement('button');b.textContent=(i<9?(i+1)+' · ':'')+tool.label;b.onclick=()=>runTool(tool);return b;}));nav.hidden=!tools.length;
}
function runTool(tool){if(transitioning||terminalOpen)return;tool.action({setPose,walker,yaw,pitch});}
let audio=null,audioGain=null,audioFilter=null,audioSfx=null,soundOn=false;
$('sound').onclick=async()=>{try{if(!audio){audio=new AudioContext();const buffer=audio.createBuffer(1,audio.sampleRate*4,audio.sampleRate),data=buffer.getChannelData(0);let v=0;for(let i=0;i<data.length;i++){v=(v+Math.random()*.04-.02)/1.02;data[i]=v*5;}const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;audioFilter=audio.createBiquadFilter();audioFilter.type='lowpass';audioGain=audio.createGain();audioGain.gain.value=0;source.connect(audioFilter).connect(audioGain).connect(audio.destination);source.start();
 // Separate bus for area sound effects (gunfire etc.), muted with the Sound toggle.
 audioSfx=audio.createGain();audioSfx.gain.value=0;audioSfx.connect(audio.destination);}await audio.resume();soundOn=!soundOn;$('sound').textContent=soundOn?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(soundOn));}catch{$('sound').textContent='Retry sound';}};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;releaseLook();$('error').hidden=false;$('error-message').textContent='Graphics were interrupted. Reload the page to restore the scene.';});
function frame(now){
 requestAnimationFrame(frame);const dt=Math.min((now-last)/1000,.05);last=now;
 const active=manager.current&&!paused&&!transitioning&&!terminalOpen&&!document.hidden;
 if(audioGain){audioGain.gain.setTargetAtTime(soundOn&&active?(manager.id==='outside'?.16:.025):0,audio.currentTime,.2);audioFilter.frequency.setTargetAtTime(manager.id==='outside'?650:150,audio.currentTime,.3);audioSfx.gain.setTargetAtTime(soundOn&&active?.9:0,audio.currentTime,.05);}
 if(!manager.current||transitioning||terminalOpen||document.hidden)return;
 const area=manager.current;
 if(active){
  if(!overview){const f=-touchMoveY+Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),r=touchMoveX+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));const magnitude=Math.hypot(f,r),speed=(area.walkSpeed||(manager.id==='outside'?3.8:2.2))*dt/Math.max(1,magnitude);area.move(walker,(Math.sin(yaw)*f-Math.cos(yaw)*r)*speed,(Math.cos(yaw)*f+Math.sin(yaw)*r)*speed);}
  area.update?.(dt,{weather,position:walker,yaw,audio:soundOn&&audioSfx?{context:audio,output:audioSfx}:null,listener:{x:walker.x,z:walker.z,yaw}});
 }
 currentInteraction=overview?null:area.getInteraction?.(walker);$('interact').hidden=!currentInteraction||paused;if(currentInteraction)$('interact').textContent='E · '+currentInteraction.label;
 if(overview){camera.fov=48;camera.position.set(13+Math.sin(yaw)*distance,7+pitch*distance,4+Math.cos(yaw)*distance);camera.lookAt(13,2,4);}
 else{camera.fov=70;camera.position.set(walker.x,(area.heightAt?.(walker.x,walker.z)||0)+area.eyeHeight,walker.z);camera.lookAt(walker.x+Math.sin(yaw)*Math.cos(pitch),camera.position.y+Math.sin(pitch),walker.z+Math.cos(yaw)*Math.cos(pitch));}
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
 fireCooldown=Math.max(0,fireCooldown-dt);
 if(triggerHeld&&active&&!overview&&area.fire&&fireCooldown===0){
  fireCooldown=.11;
  const result=area.fire({origin:camera.position.clone(),dir:camera.getWorldDirection(new THREE.Vector3())});
  if(result?.hit){document.body.classList.add('hit');clearTimeout(frame.hitTimer);frame.hitTimer=setTimeout(()=>document.body.classList.remove('hit'),140);}
 }
 area.beforeRender?.(camera);
 renderer.render(area.scene,camera);
 if(now-diagnosticTime>700){diagnosticTime=now;$('diagnostics-output').textContent=`Active: ${manager.id} · 1 scene\nGPU geometries: ${renderer.info.memory.geometries} · textures: ${renderer.info.memory.textures}\nDraw calls: ${renderer.info.render.calls}\nLast unload: ${manager.lastDisposed?JSON.stringify(manager.lastDisposed):'none'}\nPosition: ${walker.x.toFixed(1)}, ${walker.z.toFixed(1)}`;}
}
requestAnimationFrame(frame);
if(devParam&&devParam!=='menu'){
 await travel('dev/'+devParam);
 // Unknown or broken scenario: fall back to the snowfield and show the menu.
 if(!manager.current){await travel('outside');$('error').hidden=true;openDevMenu();}
}else{await travel('outside');if(devParam!==null)openDevMenu();}



