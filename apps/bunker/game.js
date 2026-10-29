import * as THREE from 'three';
import { AreaManager } from './area-manager.mjs';
import { createTerminal } from './terminal.js?v=routes1';
import { createTrade, advance as advanceTrade, setRoute, dispatchRescue, newEvacuation, recruitSoldier, squadStatus, VERSION as TRADE_VERSION } from './trade.mjs';

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
let currentInteraction=null,controlsOpen=false;
// First-person weapon (areas that provide fire()): held trigger fires at ~9 rounds/s.
let triggerHeld=false,fireCooldown=0;
const params=new URLSearchParams(location.search),devParam=params.get('dev');
// Places with their own address (?at=…). The City operation also lives in the dev menu as dev/city.
// ?at=meeting is the City store at the table as the evacuation meeting begins (it then reads ?at=city&view=meeting-table).
const PLACES={snowfield:'outside',nomad:'vehicle',bunker:'bunker',map:'bunker',trucks:'bunker',city:'dev/city',meeting:'dev/city'};
const isDev=id=>String(id).startsWith('dev/');
// Dev pages expose internals for automated checks (no effect on the normal game).
if(devParam!==null)globalThis.bunkerDebug={get manager(){return manager;},get camera(){return camera;}};
const devTitles={};
const areaName=id=>names[id]||(id===manager.id&&manager.current?.title)||devTitles[id]||'Dev scenario';
// The address always names where you are, so a refresh returns there:
// ?at=snowfield | nomad | bunker | map (bunker, situation map open) | city, plus &view=<camera view> where an
// area has named views; other dev scenarios use ?dev=<id>, and ?dev alone opens the scenarios menu.
// The overview (the landing page) has no query.
let droneFeed=false;
function placeOf(id){
 if(id==='outside')return overview?null:'snowfield';
 if(id==='vehicle')return 'nomad';
 if(id==='bunker')return terminalOpen?(tacticalTerminal?.tradeOpen?'trucks':'map'):'bunker';
 if(id==='dev/city')return 'city';
 return null;
}
function syncUrl(){
 if(!manager.current)return;
 const place=placeOf(manager.id),view=manager.current.viewSlug?.();
 let next=devMenuOpen?'?dev':place?'?at='+place:isDev(manager.id)?'?dev='+manager.id.slice(4):'';
 if(view&&next&&!devMenuOpen)next+='&view='+view;
 if(droneFeed&&manager.id==='dev/city'&&!devMenuOpen)next+='&from=map';
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
 // Some views (the drone feed) are watched with the cursor free; they never take the mouse.
 if(overview||paused||transitioning||terminalOpen||devMenuOpen||controlsOpen||!fine.matches||manager.current?.wantsCursor?.())return;
 if(typeof canvas.requestPointerLock!=='function'){fallbackLook=true;syncCursor();return;}
 try{await canvas.requestPointerLock();}catch{fallbackLook=true;syncCursor();}
}
document.addEventListener('pointerlockchange',syncCursor);document.addEventListener('pointerlockerror',syncCursor);
function setPose(spawn){walker.x=spawn.x;walker.z=spawn.z;yaw=spawn.yaw||0;pitch=spawn.pitch||0;}
function updateUI(){
 if(manager.current?.wantsCursor?.()&&locked())releaseLook();
 const outside=manager.id==='outside';
 document.body.classList.toggle('inside',!overview);
 document.body.dataset.area=manager.id;
 // Areas far from the outpost (the city) have their own weather.
 $('area-name').textContent=`${areaName(manager.id)} · ${(manager.current?.weatherLabel||weather).toUpperCase()}`;
 syncUrl();
 renderTools();
 $('cabin-status').hidden=false;
 document.body.classList.toggle('terminal-open',terminalOpen);
 $('situation-terminal').hidden=!terminalOpen;
 $('enter-vehicle').hidden=!overview;$('enter-bunker').hidden=!overview;
 $('walk-outside').hidden=!overview;$('leave-area').hidden=outside;$('leave-area').textContent=droneFeed&&manager.id==='dev/city'?'Return to command center':'Return outside';
 $('overview').hidden=!outside||overview;
 const armed=!overview&&!!manager.current?.fire&&(manager.current.canFire?.()??true);$('fire').hidden=!armed;document.body.classList.toggle('has-weapon',armed);
 $('use-terminal').hidden=manager.id!=='bunker';renderTruckButton();$('join-meeting').hidden=!overview&&manager.id!=='bunker';$('weather-cycle').hidden=overview||!!manager.current?.weatherLabel;$('enter-dev').hidden=!overview&&!isDev(manager.id);$('enter-dev').textContent=isDev(manager.id)?'Scenarios menu':'Dev scenarios →';$('weather-cycle').textContent='Weather · '+weather[0].toUpperCase()+weather.slice(1)+' · N';$('cursor-toggle').hidden=overview;$('cabin-view').hidden=manager.id!=='vehicle';
 $('weather-panel').hidden=!overview;$('scene-caption').hidden=!overview;
 $('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(paused));
 syncCursor();
}
async function travel(id,entry,{drone=false}={}){
 if(transitioning)return;
 closeSituationTerminal();
 // Opening the drone feed from the command center: the load reads as the uplink connecting.
 $('transition').classList.toggle('drone-link',drone);
 transitioning=true;for(const b of document.querySelectorAll('#area-actions button'))b.disabled=true;releaseLook();$('transition').hidden=false;$('transition-label').textContent=drone?'Connecting to drone…':'Entering '+areaName(id)+'…';$('transition-error').hidden=true;
 // Let the loading surface paint before procedural geometry is created.
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 try{
  const changed=await manager.go(id,{linked:drone});
  if(changed){droneFeed=drone;pollCity.wall=null;if(id!=='bunker'&&tacticalTerminal){tacticalTerminal.dispose();tacticalTerminal=null;}overview=id==='outside'&&!entry;setPose(manager.current.entrySpawns?.[entry]||manager.current.spawn);if(overview){yaw=0;pitch=0;}paused=false;currentInteraction=null;if(id==='bunker')manager.current.setMapState?.({weather});updateUI();syncUrl();if(id==='bunker'&&!drone&&firstTrade&&!openTrucks.shown){openTrucks.shown=true;setTimeout(openTrucks);}}
  $('error').hidden=true;
 }catch(error){console.error(error);$('error').hidden=false;$('error-message').textContent='This area could not load. Your current area is preserved. Retry the entrance when ready.';}
 finally{transitioning=false;for(const b of document.querySelectorAll('#area-actions button'))b.disabled=false;$('transition').hidden=true;if(manager.current&&!overview)lockLook();}
}
$('enter-vehicle').onclick=()=>travel('vehicle');$('enter-dev').onclick=openDevMenu;$('dev-menu-close').onclick=closeDevMenu;$('enter-bunker').onclick=()=>travel('bunker');
$('leave-area').onclick=async()=>{
 if(droneFeed&&manager.id==='dev/city'){await travel('bunker');openSituationTerminal();return;}
 travel('outside',manager.id==='bunker'?'bunker':manager.id==='vehicle'?'vehicle':undefined);};
$('walk-outside').onclick=()=>{overview=false;setPose(manager.current.spawn);updateUI();lockLook();};
$('overview').onclick=()=>{releaseLook();overview=true;yaw=0;pitch=0;distance=38;updateUI();};
$('cursor-toggle').onclick=()=>locked()?releaseLook():lockLook();
$('cabin-view').onclick=()=>{yaw=Math.cos(yaw)>0?Math.PI:0;pitch=-.1;};
$('reset').onclick=()=>{if(manager.current){if(manager.current.resetView)manager.current.resetView(setPose);else setPose(manager.current.spawn);updateUI();}if(overview){yaw=0;pitch=0;distance=38;}};
$('pause').onclick=()=>{paused=!paused;if(paused)releaseLook();$('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(paused));};
$('dismiss-error').onclick=()=>$('error').hidden=true;
let tacticalTerminal=null;
function openSituationTerminal(focus){
 if(manager.id!=='bunker'||terminalOpen||transitioning)return;
 releaseLook();terminalOpen=true;updateUI();
 tacticalTerminal??=createTerminal($('situation-terminal'),{
  onClose:closeSituationTerminal,
  onState(next){manager.current?.setMapState?.(next);},
  onTrade(){syncUrl();},
  onRescue(){trade=dispatchRescue(trade,Date.now());saveTrade();tacticalTerminal?.setTrade(trade);renderTruckButton();},
  onNewEvacuation(){trade=newEvacuation(trade,Date.now());saveTrade();tacticalTerminal?.setTrade(trade);renderTruckButton();},
  onRecruit(){trade=recruitSoldier(trade,Date.now());saveTrade();tacticalTerminal?.setTrade(trade);renderTruckButton();},
  onRoute(truck,route){const now=Date.now();trade=setRoute(advanceTrade(trade,now),truck,route,now);saveTrade();tacticalTerminal?.setTrade(trade);renderTruckButton();},
  // City marker → drone feed: load the operation and circle it from the air.
  async onDrone(){closeSituationTerminal();await travel('dev/city',undefined,{drone:true});manager.current?.setView?.('drone',setPose);updateUI();}
 });
 tacticalTerminal.open({...manager.current.snapshot?.(),weather,...(focus?.selected?{selected:focus.selected}:{})});
 tacticalTerminal.setTrade(trade);tacticalTerminal.showTrade(!focus?.selected);
 if(cityOp)tacticalTerminal.setCity(cityOp);pollCity();
}
// Trade routes (trade.mjs): the game loop. Outpost 07 makes power cells and needs food; each truck is given a
// standing route once and keeps driving it on the map's roads. It runs on real time, saved in this browser, and is played on the situation terminal (M, T,
// the operations workstation, or the Trucks button), which opens on the trucks card.
const TRADE_KEY='bunker-trade';
let trade=(()=>{try{const s=JSON.parse(localStorage.getItem(TRADE_KEY));if(s?.version===TRADE_VERSION)return advanceTrade(s,Date.now());}catch{}return null;})();
const firstTrade=!trade;trade??=createTrade(Date.now());
function saveTrade(){try{localStorage.setItem(TRADE_KEY,JSON.stringify(trade));}catch{}}
saveTrade();
setInterval(()=>{trade=advanceTrade(trade,Date.now());saveTrade();if(terminalOpen)tacticalTerminal?.setTrade(trade);renderTruckButton();},1000);
function openTrucks(){
 if(manager.id!=='bunker'||transitioning)return;
 openSituationTerminal();tacticalTerminal?.showTrade(true);
}
function renderTruckButton(){
 const b=$('truck-runs');b.hidden=manager.id!=='bunker'||overview;
 const routed=trade.trucks.filter(t=>t.route).length;
 b.querySelector('small').textContent=`⚡ ${trade.cells} · 🥫 ${trade.food} · ${squadStatus(trade).soldiers} soldiers · ${routed?routed+' route'+(routed>1?'s':'')+' running':'no routes set'} · ${trade.evacuation?.rescued||0}/24 rescued`;
}
$('truck-runs').onclick=openTrucks;
// Kestrel Falls runs from the moment the game opens, wherever you are (city-ops.mjs, stored in IndexedDB by
// city-store.js). Every few seconds it catches up; in the command center its status and each new event show in a
// strip (tap it for the map), and the wall map marks the city during contact. While the drone feed is open the
// City scene owns the operation, so polling pauses there. The City opened as a dev scenario is separate.
let cityOp=null,cityLogSeen=null,cityNewsUntil=0;
async function pollCity(){
 if(manager.id==='dev/city'&&droneFeed)return;
 try{
  const op=await (await import('./city-store.js')).getOperation();
  const fresh=cityLogSeen==null?[]:op.log.filter(e=>e.at>cityLogSeen);
  cityLogSeen=op.log.at(-1)?.at??Date.now();cityOp=op;
  if(fresh.length){$('city-strip-news').textContent=fresh.at(-1).text;cityNewsUntil=Date.now()+9000;}
  // The wall map is redrawn only when what it shows changes.
  const wall=JSON.stringify({cityContact:op.phase==='contact',cityOp:{phase:op.phase,active:op.active,wave:op.wave}});
  if(manager.id==='bunker'&&wall!==pollCity.wall){pollCity.wall=wall;manager.current?.setMapState?.(JSON.parse(wall));}
  if(terminalOpen)tacticalTerminal?.setCity(op);
  renderCityStrip();
 }catch(error){console.warn('City operation unavailable',error);}
}
function renderCityStrip(){
 const show=!!cityOp&&manager.id==='bunker'&&!overview&&!terminalOpen;
 $('city-strip').hidden=!show;if(!show)return;
 const o=cityOp,contact=o.phase==='contact';
 $('city-strip-title').textContent='KESTREL FALLS · '+(contact?`CONTACT · wave ${o.wave} · ${o.active} active · ${o.down} down`:o.wave?`quiet · ${o.totalDown} down so far`:'cordon quiet');
 $('city-strip').classList.toggle('contact',contact);
 $('city-strip').classList.toggle('news',Date.now()<cityNewsUntil);
 if(Date.now()>=cityNewsUntil)$('city-strip-news').textContent=contact?'Tap for the map and drone feed.':'';
}
$('city-strip').onclick=()=>openSituationTerminal({selected:'city'});
setInterval(pollCity,3000);setInterval(renderCityStrip,1000);
function closeSituationTerminal(){
 if(!terminalOpen)return;
 tacticalTerminal?.close();terminalOpen=false;keys.clear();clearStick();updateUI();$('use-terminal').focus({preventScroll:true});
}
$('use-terminal').onclick=openSituationTerminal;
// In person at the City store, standing at the table as the meeting starts (the standalone scene, not the live feed).
$('join-meeting').onclick=async()=>{await travel('dev/city');manager.current?.setView?.('meeting-table',setPose);updateUI();};
function interact(){if(paused||transitioning||terminalOpen||!currentInteraction)return;const action=currentInteraction;if(action.panel==='situation-map'){openSituationTerminal();return;}if(action.trucks){openTrucks();return;}if(action.destination)travel(action.destination,action.entry);else action.action?.();}
$('interact').onclick=interact;
const movementCodes=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
addEventListener('keydown',e=>{
 if(controlsOpen){if(e.code==='Escape'){e.preventDefault();closeQuickMenu();}return;}
 if(devMenuOpen){if(e.code==='Escape'){e.preventDefault();closeDevMenu();}return;}
 if(e.target instanceof HTMLInputElement)return;
 if(terminalOpen){if(e.code==='Escape'){e.preventDefault();closeSituationTerminal();}return;}
 if(e.code==='KeyM'&&manager.id==='bunker'&&!e.repeat){openSituationTerminal();return;}
 if(e.code==='KeyT'&&manager.id==='bunker'&&!e.repeat){openTrucks();return;}
 if(!overview&&!terminalOpen&&movementCodes.includes(e.code)){e.preventDefault();keys.add(e.code);}
 if(e.code==='Escape'){if(terminalOpen){closeSituationTerminal();return;}releaseLook();return;}
 if(e.code==='Tab'&&!overview&&!terminalOpen){e.preventDefault();if(!e.repeat)$('cursor-toggle').click();}
 if(e.code==='KeyE'&&!e.repeat)interact();
 if(e.code==='KeyF'&&!e.repeat&&!overview&&manager.current?.fire){e.preventDefault();triggerHeld=true;}
 if(e.code==='KeyR'&&!e.repeat&&!overview&&manager.current?.reload){e.preventDefault();manager.current.reload();}
 if(e.code==='KeyN'&&!e.repeat&&!overview&&!manager.current?.weatherLabel)$('weather-cycle').click();
 const digit=/^Digit([1-9])$/.exec(e.code);if(digit&&!e.repeat&&!overview){const tool=manager.current?.tools?.[digit[1]-1];if(tool)runTool(tool);}
});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyF')triggerHeld=false;});
document.addEventListener('mouseup',()=>{if(!document.querySelector('#fire:active'))triggerHeld=false;});
const fireButton=$('fire');
// Ammo counter: shows rounds left; tap it (or press R) to reload.
$('ammo').onclick=()=>{if(!paused&&!transitioning)manager.current?.reload?.();};let ammoText='';
fireButton.addEventListener('pointerdown',e=>{e.preventDefault();fireButton.setPointerCapture(e.pointerId);triggerHeld=true;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(event,()=>triggerHeld=false);addEventListener('blur',releaseLook);
document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseLook();last=performance.now();});
// Safari gesture zoom must not compete with two-thumb game controls.
for(const event of ['gesturestart','gesturechange','gestureend']) document.addEventListener(event,e=>e.preventDefault(),{passive:false});
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
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
 nav.dataset.owner=manager.id+':'+overview;nav.replaceChildren(...tools.map((tool,i)=>{const b=document.createElement('button');b.textContent=(i<9?(i+1)+' · ':'')+tool.label;b.onclick=()=>runTool(tool);return b;}));nav.hidden=!tools.length;$('area-toolbox').hidden=!tools.length;
}
function runTool(tool){if(transitioning||terminalOpen)return;triggerHeld=false;tool.action({setPose,walker,yaw,pitch});$('area-toolbox').open=false;updateUI();}
// Debug panel: position, heading and frame stats. Remembered per browser; closes with ✕ or the toggle.
let debugOpen=false;try{debugOpen=localStorage.getItem('bunker-debug')==='1';}catch{}
function setDebug(open){debugOpen=open;$('debug-panel').hidden=!open;$('debug-toggle').setAttribute('aria-pressed',String(open));try{localStorage.setItem('bunker-debug',open?'1':'0');}catch{}}
$('debug-toggle').onclick=()=>setDebug(!debugOpen);$('debug-close').onclick=()=>setDebug(false);setDebug(debugOpen);
// Compass: north is -Z, east is +X. yaw 0 looks along +Z (south).
function heading(){const deg=((Math.atan2(Math.sin(yaw),-Math.cos(yaw))*180/Math.PI)+360)%360;return Math.round(deg)+'° '+['N','NE','E','SE','S','SW','W','NW'][Math.round(deg/45)%8];}
let audio=null,audioGain=null,audioFilter=null,audioSfx=null,soundOn=false;
$('sound').onclick=async()=>{try{if(!audio){audio=new AudioContext();const buffer=audio.createBuffer(1,audio.sampleRate*4,audio.sampleRate),data=buffer.getChannelData(0);let v=0;for(let i=0;i<data.length;i++){v=(v+Math.random()*.04-.02)/1.02;data[i]=v*5;}const source=audio.createBufferSource();source.buffer=buffer;source.loop=true;audioFilter=audio.createBiquadFilter();audioFilter.type='lowpass';audioGain=audio.createGain();audioGain.gain.value=0;source.connect(audioFilter).connect(audioGain).connect(audio.destination);source.start();
 // Separate bus for area sound effects (gunfire etc.), muted with the Sound toggle.
 audioSfx=audio.createGain();audioSfx.gain.value=0;audioSfx.connect(audio.destination);}await audio.resume();soundOn=!soundOn;$('sound').textContent=soundOn?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(soundOn));}catch{$('sound').textContent='Retry sound';}};
// Chrome on Windows: sound is on by default. Browsers only allow audio after a user gesture,
// so it switches on at the first click, tap or key press (unless that press is on the Sound button itself).
{const ua=navigator.userAgent;if(/Windows/.test(ua)&&/Chrome\//.test(ua)&&!/Edg\/|OPR\//.test(ua)){
 const start=e=>{removeEventListener('pointerdown',start,true);removeEventListener('keydown',start,true);if(!soundOn&&e.target!==$('sound')&&!e.target.closest('#quick-menu'))$('sound').onclick();};
 addEventListener('pointerdown',start,true);addEventListener('keydown',start,true);}}
// One touch-friendly command surface; existing desktop controls share the same actions.
let quickSection='views';
const quickMenu=$('quick-menu');
function closeQuickMenu(){controlsOpen=false;quickMenu.close();keys.clear();clearStick();triggerHeld=false;$('quick-menu-open').focus({preventScroll:true});}
function renderQuickMenu(){
 const content=$('quick-menu-content');content.replaceChildren();
 for(const tab of document.querySelectorAll('[data-section]'))tab.setAttribute('aria-pressed',String(tab.dataset.section===quickSection));
 const heading=text=>{const h=document.createElement('h3');h.textContent=text;content.append(h);};
 const grid=()=>{const d=document.createElement('div');d.className='quick-grid';content.append(d);return d;};
 const add=(parent,label,action,selected)=>{const b=document.createElement('button');b.textContent=label;if(selected!==undefined)b.setAttribute('aria-pressed',String(selected));b.onclick=action;parent.append(b);};
 const tools=manager.current?.tools||[];
 if(quickSection==='views'){
  heading('Choose your view');const list=grid();
  for(const tool of tools.filter(t=>t.label.startsWith('View: ')))add(list,tool.label.slice(6),()=>{runTool(tool);closeQuickMenu();},tool.isActive?.());
  if(!list.children.length){add(list,'Reset camera',()=>{$('reset').click();closeQuickMenu();});if(!$('cabin-view').hidden)add(list,'Command / cockpit',()=>{$('cabin-view').click();closeQuickMenu();});}
  const drone=tools.find(t=>t.label==='Hold drone orbit');if(drone)add(list,'Hold drone orbit',()=>{runTool(drone);renderQuickMenu();},drone.isActive?.());
  const hint=document.createElement('p');hint.textContent='Choose a view to return directly to the scene.';content.append(hint);
 }else if(quickSection==='scenario'){
  heading(droneFeed?'Linked operation':'Operation mode');if(droneFeed){const note=document.createElement('p');note.textContent='Live feed follows the saved operation. Mode and restart controls are available in the standalone scenario.';content.append(note);}const list=grid();
  for(const tool of tools.filter(t=>!t.label.startsWith('View: ')&&!/Restart|Slow motion|Freeze|Hold drone/.test(t.label)))add(list,tool.label,()=>{runTool(tool);closeQuickMenu();},tool.isActive?.());
  heading('Scenario tools');const actions=grid();
  for(const tool of tools.filter(t=>/Restart|Slow motion|Freeze/.test(t.label)))add(actions,tool.label.replace(' on/off',''),()=>{runTool(tool);renderQuickMenu();},tool.isActive?.());
  add(actions,'Choose scenario',()=>{closeQuickMenu();openDevMenu();});
 }else{
  heading('Game');const actions=grid();
  add(actions,soundOn?'Sound on':'Sound off',async()=>{await $('sound').onclick();renderQuickMenu();},soundOn);
  add(actions,paused?'Resume simulation':'Pause simulation',()=>{$('pause').click();renderQuickMenu();},paused);
  add(actions,'Reset camera',()=>{$('reset').click();closeQuickMenu();});
  heading('Weather');const weatherGrid=grid();if(manager.current?.weatherLabel){const note=document.createElement('p');note.textContent='Local conditions: '+manager.current.weatherLabel;content.append(note);}
  for(const value of (manager.current?.weatherLabel?[]:weatherOrder))add(weatherGrid,value[0].toUpperCase()+value.slice(1),()=>{setWeather(value);renderQuickMenu();},weather===value);
  heading('Location');const locations=grid();
  for(const id of ['enter-bunker','enter-vehicle','walk-outside','join-meeting','truck-runs','use-terminal','leave-area','overview']){const source=$(id);if(!source.hidden&&!source.disabled)add(locations,source.textContent.replace(' · M',''),()=>{closeQuickMenu();source.click();});}
 }
}
$('quick-menu-open').onclick=()=>{if(transitioning||terminalOpen)return;releaseLook();controlsOpen=true;renderQuickMenu();quickMenu.showModal();};
$('quick-menu-close').onclick=$('quick-menu-resume').onclick=closeQuickMenu;
quickMenu.addEventListener('cancel',e=>{e.preventDefault();closeQuickMenu();});
quickMenu.addEventListener('click',e=>{if(e.target===quickMenu){const r=quickMenu.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeQuickMenu();}});
for(const tab of document.querySelectorAll('[data-section]'))tab.onclick=()=>{quickSection=tab.dataset.section;renderQuickMenu();};
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;releaseLook();$('error').hidden=false;$('error-message').textContent='Graphics were interrupted. Reload the page to restore the scene.';});
let fpsFrames=0,fpsElapsed=0;
function frame(now){
 requestAnimationFrame(frame);const frameSeconds=(now-last)/1000,dt=Math.min(frameSeconds,.05);last=now;
 const active=manager.current&&!paused&&!transitioning&&!terminalOpen&&!devMenuOpen&&!controlsOpen&&!document.hidden;
 if(audioGain){audioGain.gain.setTargetAtTime(soundOn&&active?(manager.id==='outside'?.16:.025):0,audio.currentTime,.2);audioFilter.frequency.setTargetAtTime(manager.id==='outside'?650:150,audio.currentTime,.3);audioSfx.gain.setTargetAtTime(soundOn&&active?.9:0,audio.currentTime,.05);}
 if(!manager.current||transitioning||terminalOpen||document.hidden){$('scene-dialogue').hidden=true;fpsFrames=0;fpsElapsed=0;$('fps-counter').textContent='FPS —';return;}
 const area=manager.current;
 const dialogue=area.getDialogue?.();
 $('scene-dialogue').hidden=!dialogue||controlsOpen||devMenuOpen;
 if(dialogue){if($('dialogue-line').textContent!==dialogue.text){$('dialogue-speaker').textContent=dialogue.speaker;$('dialogue-line').textContent=dialogue.text;}}
 // Cursor-first views (drone): drop mouse-look whenever it gets engaged, e.g. by a pointer-lock reply arriving late.
 if(area.wantsCursor?.()&&locked())releaseLook();
 if(active){
  if(!overview){const f=-touchMoveY+Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),r=touchMoveX+Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));const magnitude=Math.hypot(f,r),speed=(area.walkSpeed||(manager.id==='outside'?3.8:2.2))*dt/Math.max(1,magnitude);area.move(walker,(Math.sin(yaw)*f-Math.cos(yaw)*r)*speed,(Math.cos(yaw)*f+Math.sin(yaw)*r)*speed);}
  area.update?.(dt,{weather,position:walker,yaw,audio:soundOn&&audioSfx?{context:audio,output:audioSfx}:null,listener:{x:walker.x,z:walker.z,yaw}});
 }
 currentInteraction=overview?null:area.getInteraction?.(walker);
 // The operations workstation (east wall) dispatches the trucks.
 if(!currentInteraction&&!overview&&manager.id==='bunker'&&walker.x>1.7&&walker.z>-3.6&&walker.z<.4)currentInteraction={label:'Truck runs',trucks:true};$('interact').hidden=!currentInteraction||paused;if(currentInteraction)$('interact').textContent='E · '+currentInteraction.label;
 if(overview){camera.fov=48;camera.position.set(13+Math.sin(yaw)*distance,7+pitch*distance,4+Math.cos(yaw)*distance);camera.lookAt(13,2,4);}
 else{camera.fov=70;camera.position.set(walker.x,(area.heightAt?.(walker.x,walker.z)||0)+area.eyeHeight,walker.z);camera.lookAt(walker.x+Math.sin(yaw)*Math.cos(pitch),camera.position.y+Math.sin(pitch),walker.z+Math.cos(yaw)*Math.cos(pitch));}
 // A 5 cm near plane is needed on foot (the rifle sits close to the eye); from high up it wastes depth
 // precision and distant coplanar-ish surfaces flicker, so push it out there.
 camera.near=camera.position.y>4?.5:.05;
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
 area.beforeRender?.(camera,active?dt:0);
 const ammo=!overview&&area.getAmmo?.(),nextAmmo=ammo?(ammo.reloading!=null?'RELOADING '+Math.round(ammo.reloading*100)+'%':ammo.mag+' / '+ammo.size):'';
 if(nextAmmo!==ammoText){ammoText=nextAmmo;$('ammo').hidden=!ammo;$('ammo').textContent=nextAmmo;$('ammo').classList.toggle('low',!!ammo&&ammo.reloading==null&&ammo.mag<=8);}
 fireCooldown=Math.max(0,fireCooldown-dt);
 if(triggerHeld&&active&&!overview&&area.fire&&(area.canFire?.()??true)&&fireCooldown===0){
  fireCooldown=.11;
  const result=area.fire({origin:camera.position.clone(),dir:camera.getWorldDirection(new THREE.Vector3())});
  if(result?.hit){document.body.classList.add('hit');clearTimeout(frame.hitTimer);frame.hitTimer=setTimeout(()=>document.body.classList.remove('hit'),140);}
 }

 renderer.render(area.scene,camera);
 fpsFrames++;fpsElapsed+=frameSeconds;if(fpsElapsed>=.5){frame.fps=Math.round(fpsFrames/fpsElapsed);$('fps-counter').textContent='FPS '+frame.fps;fpsFrames=0;fpsElapsed=0;}
 if(now-diagnosticTime>250){diagnosticTime=now;const status=area.getStatus?.();$('scenario-status').hidden=!status;if(status){$('scenario-title').textContent=status.title+' / '+status.mode;$('scenario-detail').textContent=status.detail;$('scenario-stats').textContent=status.stats;}for(const [i,button] of [...$('area-tools').children].entries()){const selected=area.tools?.[i]?.isActive?.();if(selected!==undefined)button.setAttribute('aria-pressed',String(selected));}if(debugOpen){const p=camera.position,info=renderer.info;$('debug-output').textContent=[`FPS ${frame.fps??'—'} · ${(frameSeconds*1000).toFixed(1)} ms`,`Area ${manager.id}${overview?' (overview)':''}`,`Position x ${p.x.toFixed(2)}  y ${p.y.toFixed(2)}  z ${p.z.toFixed(2)}`,`Heading ${heading()} · pitch ${Math.round(pitch*180/Math.PI)}°`,`Weather ${weather}${paused?' · PAUSED':''}`,`Draw calls ${info.render.calls} · triangles ${info.render.triangles}`,`Geometries ${info.memory.geometries} · textures ${info.memory.textures}`,...(status?.stats?[status.stats]:[])].join('\n');}
  $('diagnostics-output').textContent=`Active: ${manager.id} · 1 scene\nGPU geometries: ${renderer.info.memory.geometries} · textures: ${renderer.info.memory.textures}\nDraw calls: ${renderer.info.render.calls}\nLast unload: ${manager.lastDisposed?JSON.stringify(manager.lastDisposed):'none'}\nPosition: ${walker.x.toFixed(1)}, ${walker.z.toFixed(1)}`;}
}
requestAnimationFrame(frame);
pollCity();
const at=params.get('at'),startView=params.get('view')||(at==='meeting'?'meeting-table':null);
if(at&&PLACES[at]){
 await travel(PLACES[at],undefined,{drone:at==='city'&&params.get('from')==='map'});
 if(!manager.current)await travel('outside');
 else if(at==='snowfield'){overview=false;setPose(manager.current.spawn);updateUI();}
 else if(at==='map')openSituationTerminal();
 else if(at==='trucks')openTrucks();
 if(startView)manager.current?.setView?.(startView,setPose);
 updateUI();
}else if(devParam&&devParam!=='menu'){
 await travel('dev/'+devParam);
 if(startView)manager.current?.setView?.(startView,setPose);
 // Unknown or broken scenario: fall back to the snowfield and show the menu.
 if(!manager.current){await travel('outside');$('error').hidden=true;openDevMenu();}
}else{await travel('outside');if(devParam!==null)openDevMenu();}
