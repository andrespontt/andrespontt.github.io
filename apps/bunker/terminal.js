import * as THREE from 'three';
import { disposeScene } from './area-manager.mjs';
import { SITES, WEATHER, SECTOR, CITY, CITY_DISTRICTS, CITY_BUILDINGS, elevation, routeTo, surveyCanvas, surveySpan, surveyScale } from './sector.js?v=room2';
import { commandLines, summary } from './city-ops.mjs';
import { RUNS, truckAt, runTime, timers, rescueStatus, squadStatus, RECRUIT } from './trade.mjs';

export function createTerminal(root,{onClose,onState,onDrone,onRoute,onTrade,onRescue,onNewEvacuation,onRecruit}) {
  let state={selected:'shelter',route:null,scanned:false,weather:'blizzard'},active=false,renderer,scene,camera,terrain,routeMesh,storm;
  let zoom=1,tilted=true,weatherVisible=false,target=new THREE.Vector3(SECTOR.centerX,0,SECTOR.centerZ),width=1,height=1,scanTimer=null;
  const pointers=new Map(),ray=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  // Living map: effects built in init() and moved by animate() while the terminal is open (≤30 fps).
  // With reduced motion the map draws them once, still.
  let fx={},routeCurve=null,raf=0,lastFrame=0;const still=matchMedia('(prefers-reduced-motion: reduce)');
  root.innerHTML=`<div class="ops-shell">
    <div class="ops-top"><div class="ops-title"><span class="ops-live"></span><div><small>OUTPOST 07 / OPERATIONS</small><h2 id="terminal-title">Black Ridge / Kestrel Valley</h2></div></div><div class="ops-weather" id="ops-weather"></div><button id="terminal-close" class="ops-close" aria-label="Return to situation room">Return to room <b>×</b></button></div>
    <div id="ops-viewport"><canvas id="ops-map" tabindex="0" aria-label="Sector map. Drag to move, pinch or scroll to zoom. Arrow keys pan, plus and minus zoom, Home fits the sector."></canvas><div id="ops-markers"></div><div class="ops-coordinate">62°14′ N &nbsp; 148°33′ W<br><span>SECTOR 07-K · OFFLINE SURVEY</span></div><div class="ops-north">N<span>↑</span></div>
    <div class="ops-tools"><button aria-label="Truck runs" id="ops-trucks-toggle" aria-pressed="true" aria-controls="ops-trade">🚚 <span>Trucks</span></button><button id="ops-fit" title="Show the whole sector (Home)">⌖ <span>Fit sector</span></button><button aria-label="Toggle terrain relief" id="ops-relief" aria-pressed="true">3D <span>Relief</span></button><button aria-label="Toggle weather overlay" id="ops-storm" aria-pressed="false">≋ <span>Weather</span></button><button aria-label="Show forces and supplies" id="ops-forces-toggle" aria-pressed="false" aria-controls="ops-forces">▤ <span>Forces</span></button></div>
    <section id="ops-trade" aria-label="Truck runs"><div class="trade-stock"><div class="trade-res"><b id="trade-cells"></b><small>Power cells · we make</small><span id="trade-cells-note"></span></div><div class="trade-res"><b id="trade-food"></b><small>Food · we need</small><span id="trade-food-note"></span></div></div><section class="trade-mission" aria-label="Evacuation objective"><div><strong id="rescue-title"></strong><b id="rescue-count"></b></div><progress id="rescue-progress" max="24" value="0" aria-label="Civilians rescued"></progress><p id="rescue-detail"></p><button id="rescue-dispatch"></button></section><p id="trade-status" role="status"></p><div id="trade-trucks"></div><details class="trade-help"><summary>Route guide</summary><p id="trade-legend"></p></details></section><section id="ops-forces" aria-label="Forces and supplies" hidden><h3>OUTPOST 07 COMMAND</h3><dl id="ops-forces-list"></dl></section>
    <div class="ops-zoom"><button id="ops-plus" aria-label="Zoom in">+</button><output id="ops-zoom-label">1.0×</output><button id="ops-minus" aria-label="Zoom out">−</button></div>
    <div class="ops-scale"><span id="ops-scale-bar"></span><b id="ops-scale-text">500 m</b></div><div id="ops-notice" role="status" hidden></div>
    <div class="ops-selection"><div class="ops-selection-heading"><div><small id="ops-type"></small><h3 id="ops-name"></h3></div><button id="ops-focus" aria-label="Center map on selected location">⌖</button></div><p id="ops-status"></p><p id="ops-description"></p><div class="ops-selection-actions"><button id="ops-route">Plot route</button><button id="ops-drone" hidden>▶ Drone feed</button><button id="ops-scan">Scan sector</button></div></div>
    <div class="ops-help">DRAG TO MOVE <span>·</span> PINCH / SCROLL TO ZOOM <span>·</span> TAP A LOCATION</div></div></div>`;
  const $=id=>root.querySelector('#'+id),canvas=$('ops-map'),viewport=$('ops-viewport');
  $('ops-trade').querySelector('.trade-stock').insertAdjacentHTML('afterend',`<details class="trade-recruit"><summary><strong id="squad-count"></strong><span id="squad-summary"></span></summary><p id="squad-benefit"></p><progress id="recruit-progress" max="${RECRUIT.duration}" value="0" aria-label="Recruit training progress" hidden></progress><p id="recruit-detail" role="status"></p><button id="recruit-soldier">Recruit soldier</button></details>`);
  // Give the map its own viewport; command controls never cover its terrain.
  const shell=root.querySelector('.ops-shell'),workspace=document.createElement('div');
  workspace.className='ops-workspace';shell.append(workspace);workspace.append(viewport,$('ops-trade'));
  const stock=root.querySelector('.trade-stock');stock.classList.add('ops-stockbar');shell.insertBefore(stock,workspace);
  stock.insertAdjacentHTML('beforeend','<button class="trade-res squad-stat" id="squad-shortcut" aria-label="Manage soldiers"><small>Convoy soldiers</small><b id="dashboard-soldiers"></b><span id="dashboard-squad-state"></span></button>');
  for(const card of stock.querySelectorAll('.trade-res:not(button)'))card.prepend(card.querySelector('small'));
  stock.querySelector('#trade-cells').previousElementSibling.textContent='Power cells';
  stock.querySelector('#trade-food').previousElementSibling.textContent='Food reserves';
  $('ops-trade').setAttribute('aria-label','Command dashboard');
  $('ops-trade').insertAdjacentHTML('afterbegin','<div class="command-heading"><div><small>OUTPOST MANAGEMENT</small><h3>Command desk</h3></div><span class="command-live">● LIVE</span></div><div class="command-tabs" role="tablist" aria-label="Command sections"><button id="tab-mission" role="tab" aria-controls="command-mission" data-section="mission">Mission</button><button id="tab-convoys" role="tab" aria-controls="command-convoys" data-section="convoys">Convoys</button><button id="tab-soldiers" role="tab" aria-controls="command-soldiers" data-section="soldiers">Soldiers</button></div>');
  const panels={};
  for(const name of ['mission','convoys','soldiers']){
    const panel=document.createElement('section');panel.id='command-'+name;panel.className='command-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','tab-'+name);$('ops-trade').append(panel);panels[name]=panel;
  }
  panels.mission.append(root.querySelector('.trade-mission'));
  panels.mission.insertAdjacentHTML('beforeend','<div class="mission-steps"><span>01 · Prepare supplies</span><span>02 · Dispatch rescue</span><span>03 · Bring everyone home</span></div>');
  panels.convoys.insertAdjacentHTML('beforeend','<p class="command-intro">Two trucks. One lifeline.<span>Choose a standing route. Trucks finish their current trip before switching.</span></p>');
  panels.convoys.append($('trade-trucks'),root.querySelector('.trade-help'));
  const oldRecruitment=root.querySelector('.trade-recruit'),recruitment=document.createElement('section');recruitment.className='trade-recruit';
  const rosterHeading=document.createElement('div');rosterHeading.className='roster-heading';rosterHeading.append(...oldRecruitment.querySelector('summary').childNodes);oldRecruitment.querySelector('summary').remove();recruitment.append(rosterHeading,...oldRecruitment.childNodes);oldRecruitment.replaceWith(recruitment);
  panels.soldiers.insertAdjacentHTML('beforeend','<div class="squad-formation" aria-label="Convoy squad positions">'+Array.from({length:8},(_,i)=>`<span data-slot="${i}"><svg viewBox="0 0 24 28" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M5 25v-9q0-5 7-5t7 5v9h-5v-8h-4v8z"/></svg></span>`).join('')+'</div>');
  panels.soldiers.append(recruitment);$('ops-trade').append($('trade-status'));
  function selectSection(name){
    for(const [key,panel] of Object.entries(panels)){panel.hidden=key!==name;const tab=$('tab-'+key);tab.setAttribute('aria-selected',String(key===name));tab.tabIndex=key===name?0:-1;}
  }
  for(const tab of root.querySelectorAll('.command-tabs button')){
    tab.onclick=()=>selectSection(tab.dataset.section);
    tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...root.querySelectorAll('.command-tabs button')],i=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;tabs[next].click();tabs[next].focus();};
  }
  selectSection('mission');
  $('squad-shortcut').onclick=()=>{showTrade(true);selectSection('soldiers');};
  $('ops-trucks-toggle').innerHTML='▤ <span>Command</span>';$('ops-trucks-toggle').setAttribute('aria-label','Command dashboard');
  $('ops-fit').insertAdjacentHTML('afterend','<button id="ops-city-view" aria-label="Focus all nine city districts" title="Focus all nine city districts">▦ <span>City</span></button>');
  $('ops-city-view').onclick=()=>{
    target.set(CITY.x+CITY.districtWidth*1.5,0,CITY.z+CITY.districtDepth*1.5-5); // Leave room above the city for map controls.
    const aspect=width/height,vertical=tilted?CITY.districtDepth*3*120/Math.hypot(120,75)+8:CITY.districtDepth*3;
    zoom=Math.min(7,surveySpan(aspect,tilted)/(Math.max(vertical,CITY.districtWidth*3/aspect)*1.3));draw();
  };
  $('terminal-title').textContent='Outpost 07';
  root.querySelector('.ops-title small').textContent='BLACK RIDGE / COMMAND';
  const markers={};for(const [id,s] of Object.entries(SITES)){
    const b=document.createElement('button');b.className='ops-marker';b.style.setProperty('--pin',s.color);b.innerHTML=`<i>${id==='shelter'?'⌂':id==='nomad'?'▰':id==='relay'?'⌁':id==='city'?'▣':'?'}</i><span>${s.short}</span>`;b.setAttribute('aria-label','Inspect '+s.short);b.onclick=()=>{state.selected=id;showTrade(false);update();};$('ops-markers').append(b);markers[id]=b;
  }
  function init(){
    if(renderer)return;
    renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.setClearColor('#16242b');
    scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-60,60,45,-45,.1,500);
    const geo=new THREE.PlaneGeometry(SECTOR.width,SECTOR.depth,200,160);geo.rotateX(-Math.PI/2);geo.translate(SECTOR.centerX,0,SECTOR.centerZ);const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,elevation(p.getX(i),p.getZ(i)));geo.computeVertexNormals();
    const tex=new THREE.CanvasTexture(surveyCanvas());tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    terrain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({map:tex,roughness:1}));scene.add(terrain);
    const base=new THREE.Mesh(new THREE.BoxGeometry(SECTOR.width,2,SECTOR.depth),new THREE.MeshBasicMaterial({color:'#253c45'}));base.position.set(SECTOR.centerX,-1,SECTOR.centerZ);scene.add(base);
    const cube=new THREE.BoxGeometry(1,1,1),cityMaterial=new THREE.MeshStandardMaterial({color:'#595e56',roughness:.55});
    scene.add(new THREE.HemisphereLight('#d9eff2','#33414b',2));
    const sun=new THREE.DirectionalLight('#fff1ce',2.2);sun.position.set(-40,70,30);scene.add(sun);
    // All 216 city blocks share one draw call, keeping the larger survey light on phones.
    const blocks=new THREE.InstancedMesh(cube,cityMaterial,CITY_BUILDINGS.length),transform=new THREE.Object3D();
    for(const [i,b] of CITY_BUILDINGS.entries()){
      transform.scale.set(b.width,b.height,b.depth);transform.position.set(b.x,elevation(b.x,b.z)+b.height/2,b.z);transform.updateMatrix();blocks.setMatrixAt(i,transform.matrix);
    }
    blocks.instanceMatrix.needsUpdate=true;blocks.computeBoundingSphere();scene.add(blocks);
    for(const d of CITY_DISTRICTS){
      const label=document.createElement('canvas');label.width=512;label.height=64;const ctx=label.getContext('2d');
      ctx.fillStyle='#15272fed';ctx.fillRect(0,0,512,64);ctx.fillStyle='#e5ce98';ctx.font='bold 28px monospace';ctx.textAlign='center';ctx.fillText(String(d.id).padStart(2,'0')+' / '+d.name.toUpperCase(),256,42);
      const texture=new THREE.CanvasTexture(label);texture.colorSpace=THREE.SRGBColorSpace;
      const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));tag.scale.set(22,2.75,1);tag.position.set(d.x+d.width/2,elevation(d.x+d.width/2,d.z)+4,d.z+1);tag.renderOrder=2;scene.add(tag);
    }
    const bunker=new THREE.Mesh(cube,new THREE.MeshStandardMaterial({color:'#d9b67d',roughness:.8}));
    bunker.scale.set(3.4,1.6,2.4);bunker.position.set(SITES.shelter.x,elevation(SITES.shelter.x,SITES.shelter.z)+.3,SITES.shelter.z);scene.add(bunker);
    const entrance=new THREE.Mesh(cube,new THREE.MeshBasicMaterial({color:'#16242b'}));entrance.scale.set(1.8,1.2,.1);entrance.position.copy(bunker.position).add(new THREE.Vector3(0,0,1.25));scene.add(entrance);
    const ring=new THREE.Mesh(new THREE.RingGeometry(3.4,3.7,48),new THREE.MeshBasicMaterial({color:'#ff926c',side:THREE.DoubleSide,depthTest:false}));ring.rotation.x=-Math.PI/2;ring.position.set(SITES.city.x,elevation(SITES.city.x,SITES.city.z)+2,SITES.city.z);ring.renderOrder=3;ring.name='conflict-ring';scene.add(ring);
    const wc=document.createElement('canvas');wc.width=600;wc.height=450;const ctx=wc.getContext('2d');ctx.fillStyle='#d4e8ee10';ctx.fillRect(0,0,600,450);ctx.strokeStyle='#d5e8ef66';ctx.lineWidth=2;for(let x=-400;x<800;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+230,450);ctx.stroke();}ctx.fillStyle='#d5e8ef';ctx.font='22px monospace';for(let y=70;y<450;y+=110)for(let x=60;x<600;x+=120)ctx.fillText('↘',x,y);
    storm=new THREE.Mesh(geo.clone().translate(0,.8,0),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(wc),transparent:true,depthWrite:false,opacity:.6}));storm.visible=false;scene.add(storm);
    storm.material.map.wrapS=storm.material.map.wrapT=THREE.RepeatWrapping; // so the wind can drift it
    // Soft round glow shared by every light on the map.
    const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=64;
    const gc=glowCanvas.getContext('2d'),gg=gc.createRadialGradient(32,32,0,32,32,32);
    gg.addColorStop(0,'rgba(255,255,255,1)');gg.addColorStop(.35,'rgba(255,255,255,.45)');gg.addColorStop(1,'rgba(255,255,255,0)');gc.fillStyle=gg;gc.fillRect(0,0,64,64);
    const glowMap=new THREE.CanvasTexture(glowCanvas);
    const glow=(color,size,blending=THREE.AdditiveBlending)=>{const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,color,transparent:true,blending,depthWrite:false,depthTest:false}));sprite.scale.setScalar(size);sprite.renderOrder=4;scene.add(sprite);return sprite;};
    const cityY=elevation(SITES.city.x,SITES.city.z),bunkerTop=bunker.position.y+.9;
    // Kestrel Falls: a warm halo that breathes, turning red and pulsing during contact.
    fx.cityGlow=glow('#ffb35a',15);fx.cityGlow.position.set(SITES.city.x,cityY+2.5,SITES.city.z);
    // Contact pings: rings that spread out from the city and fade, only while it is under attack.
    fx.pings=[0,1].map(()=>{const m=new THREE.Mesh(new THREE.RingGeometry(.92,1,64),new THREE.MeshBasicMaterial({color:'#ff694c',transparent:true,side:THREE.DoubleSide,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.set(SITES.city.x,cityY+2.1,SITES.city.z);m.renderOrder=3;m.visible=false;scene.add(m);return m;});
    // Outpost 07: a blinking beacon on the bunker (normal blending so it reads against the snow)
    // and a faint radar wedge sweeping round it.
    fx.beacon=glow('#ffb347',3.2,THREE.NormalBlending);fx.beacon.position.set(SITES.shelter.x,bunkerTop+.5,SITES.shelter.z);
    fx.sweep=new THREE.Mesh(new THREE.CircleGeometry(30,48,0,.42),new THREE.MeshBasicMaterial({color:'#7fe3c4',transparent:true,opacity:.06,side:THREE.DoubleSide,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));
    fx.sweep.rotation.x=-Math.PI/2;fx.sweep.position.set(SITES.shelter.x,bunkerTop+3,SITES.shelter.z);fx.sweep.renderOrder=2;scene.add(fx.sweep);
    // The drone on station: a bright dot circling the block on a dashed orbit.
    fx.droneHeight=cityY+7;fx.drone=glow('#bff7ff',2.4);
    const orbit=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;orbit.push(new THREE.Vector3(SITES.city.x+Math.cos(a)*6,fx.droneHeight,SITES.city.z+Math.sin(a)*6));}
    fx.orbit=new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbit),new THREE.LineDashedMaterial({color:'#bff7ff',transparent:true,opacity:.4,dashSize:.6,gapSize:.5,depthTest:false}));
    fx.orbit.computeLineDistances();fx.orbit.renderOrder=3;scene.add(fx.orbit);
    // City windows glow and flicker a little.
    cityMaterial.emissive=new THREE.Color('#3b2c14');fx.cityMaterial=cityMaterial;
    // Lights that run along a plotted route.
    fx.routeDots=[0,1,2,3].map(()=>{const dot=glow('#ffd68a',1.5);dot.visible=false;return dot;});
  }
  function animate(t){
    if(!fx.cityGlow)return;
    const s=t/1000,contact=cityOp?.phase==='contact',beat=Math.abs(Math.sin(s*3.2));
    fx.cityGlow.material.color.set(contact?'#ff6a3c':'#ffb35a');
    fx.cityGlow.material.opacity=contact?.5+.4*beat:.32+.08*Math.sin(s*1.3);
    fx.cityGlow.scale.setScalar(contact?16+beat*4:15+Math.sin(s*1.3)*.6);
    fx.pings.forEach((ring,i)=>{const k=(s*.5+i*.5)%1;ring.visible=contact;ring.scale.setScalar(3.6+k*10);ring.material.opacity=(1-k)*.85;});
    fx.beacon.material.opacity=(s*1.1)%1<.14?1:.28;
    fx.sweep.rotation.z=-s*.6;
    const a=s*.45;fx.drone.position.set(SITES.city.x+Math.cos(a)*6,fx.droneHeight,SITES.city.z+Math.sin(a)*6);
    fx.cityMaterial.emissiveIntensity=.85+Math.sin(s*6.7)*.08+Math.sin(s*2.3)*.15;
    if(storm.visible)storm.material.map.offset.set(-s*.035%1,-s*.02%1);
    fx.routeDots.forEach((dot,i)=>{dot.visible=!!routeCurve;if(routeCurve){dot.position.copy(routeCurve.getPointAt((s*.1+i/4)%1));dot.position.y+=.3;}});
  }
  function tick(t){
    if(!active){raf=0;return;}
    raf=requestAnimationFrame(tick);
    if(t-lastFrame<33)return; // ~30 fps is plenty for a map
    lastFrame=t;animate(t);draw();
  }
  function startLoop(){if(still.matches){animate(performance.now());draw();return;}if(!raf)raf=requestAnimationFrame(tick);}
  function project(x,z){return new THREE.Vector3(x,elevation(x,z)+.5,z).project(camera);}
  function coveredBottom(){
    return 0; // Dashboard is beside/below the map, never over it.
  }
  function cameraUpdate(){
    // Frame the sector in its dedicated viewport at every screen size.
    const cover=coveredBottom(),visible=Math.max(1,height-cover),aspect=width/height;
    const span=surveySpan(width/visible,tilted)/zoom*height/visible,shift=cover/2*span/height;
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2-shift;camera.bottom=-span/2-shift;
    camera.up.set(0,1,0);camera.position.copy(target).add(tilted?new THREE.Vector3(0,120,75):new THREE.Vector3(0,150,.001));camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  function draw(){
    if(!active||!renderer)return;cameraUpdate();renderer.render(scene,camera);
    for(const [id,s] of Object.entries(SITES)){const p=project(s.x,s.z),b=markers[id];b.hidden=(id==='echo'&&!state.scanned)||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;b.style.left=(p.x*.5+.5)*width+'px';b.style.top=(-p.y*.5+.5)*height+'px';b.classList.toggle('label-left',(p.x*.5+.5)*width>width*.68);b.setAttribute('aria-pressed',String(id===state.selected));}
    placeTrucks();renderTrade();
    $('ops-zoom-label').textContent=zoom.toFixed(1)+'×';
    const units=(camera.right-camera.left)/width,{meters,pixels}=surveyScale(units*50);
    $('ops-scale-bar').style.width=pixels+'px';$('ops-scale-text').textContent=meters>=1000?(meters/1000)+' km':meters+' m';
  }
  function resize(){if(!active||!renderer)return;const r=viewport.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);renderer.setSize(width,height,false);draw();}
  function groundAt(x,y){const r=canvas.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((x-r.left)/width*2-1,1-(y-r.top)/height*2),camera);return ray.ray.intersectPlane(ground,new THREE.Vector3());}
  function constrain(){target.x=THREE.MathUtils.clamp(target.x,SECTOR.centerX-SECTOR.width/2,SECTOR.centerX+SECTOR.width/2);target.z=THREE.MathUtils.clamp(target.z,SECTOR.centerZ-SECTOR.depth/2,SECTOR.centerZ+SECTOR.depth/2);}
  function zoomAt(next,x=width/2+canvas.getBoundingClientRect().left,y=height/2+canvas.getBoundingClientRect().top){const before=groundAt(x,y);zoom=THREE.MathUtils.clamp(next,.7,7);cameraUpdate();const after=groundAt(x,y);if(before&&after)target.add(before.sub(after));constrain();draw();}
  function gesture(){const a=[...pointers.values()];if(!a.length)return null;return {x:a.reduce((s,p)=>s+p.x,0)/a.length,y:a.reduce((s,p)=>s+p.y,0)/a.length,d:a.length>1?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0};}
  canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.focus({preventScroll:true});pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);canvas.classList.add('dragging');});
  canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();const old=gesture();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=gesture();const a=groundAt(old.x,old.y),b=groundAt(next.x,next.y);if(a&&b)target.add(a.sub(b));constrain();cameraUpdate();if(old.d&&next.d)zoomAt(zoom*next.d/old.d,next.x,next.y);else draw();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{pointers.delete(e.pointerId);if(!pointers.size)canvas.classList.remove('dragging');});
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(zoom*Math.exp(-e.deltaY*.0015),e.clientX,e.clientY);},{passive:false});
  canvas.addEventListener('dblclick',e=>zoomAt(zoom*1.6,e.clientX,e.clientY));
  canvas.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','=','-','Home'].includes(e.key)){e.preventDefault();e.stopPropagation();if(e.key==='Home')fit();else if(e.key==='+'||e.key==='=')zoomAt(zoom*1.3);else if(e.key==='-')zoomAt(zoom/1.3);else{const step=5/zoom;target.x+=(e.key==='ArrowRight'?step:0)-(e.key==='ArrowLeft'?step:0);target.z+=(e.key==='ArrowDown'?step:0)-(e.key==='ArrowUp'?step:0);constrain();draw();}}});
  function fit(){target.set(SECTOR.centerX,0,SECTOR.centerZ);zoom=1;draw();}
  function notify(text){$('ops-notice').hidden=false;$('ops-notice').textContent=text;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('ops-notice').hidden=true,3500);}
  let routeKey;
  function updateRoute(){if(!scene||routeKey===state.route)return;routeKey=state.route;routeCurve=null;if(routeMesh){scene.remove(routeMesh);routeMesh.geometry.dispose();routeMesh.material.dispose();routeMesh=null;}const points=routeTo(state.route);if(points.length<2)return;const sampled=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i];for(let t=0;t<1;t+=.04){const x=THREE.MathUtils.lerp(a[0],b[0],t),z=THREE.MathUtils.lerp(a[1],b[1],t);sampled.push(new THREE.Vector3(x,elevation(x,z)+.35,z));}}const end=points.at(-1);sampled.push(new THREE.Vector3(end[0],elevation(...end)+.35,end[1]));routeCurve=new THREE.CatmullRomCurve3(sampled);routeMesh=new THREE.Mesh(new THREE.TubeGeometry(routeCurve,160,.19,5,false),new THREE.MeshBasicMaterial({color:'#ffca6b'}));scene.add(routeMesh);}
  // The city's line comes from the running operation (city-ops.mjs), with its last few log entries.
  let cityOp=null;
  // Forces and supplies (from the operation state): personnel, casualties, ammunition, fuel, rations…
  function drawForces(){const list=$('ops-forces-list');list.replaceChildren(...commandLines(cityOp).flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;return [dt,dd];}));}
  $('ops-forces-toggle').onclick=()=>{const open=$('ops-forces').hidden;if(open)showTrade(false);$('ops-forces').hidden=!open;root.classList.toggle('forces-open',open);$('ops-forces-toggle').setAttribute('aria-pressed',String(open));drawForces();};
  // Truck runs (trade.mjs): the outpost's stock, the trucks on the map and the runs you can send them on.
  // The shell owns the state (setTrade); a route chip asks it to assign that truck's standing route (onRoute).
  let trade=null;const truckMarks=[],truckRows=[];
  const make=(tag,cls,html='')=>{const e=document.createElement(tag);if(cls)e.className=cls;e.innerHTML=html;return e;};
  for(let i=0;i<2;i++){
    const mark=make('div','ops-truck','<i>🚚</i><span></span>');mark.hidden=true;$('ops-markers').append(mark);truckMarks.push(mark);
    const row=make('div','trade-truck','<b></b><span></span><i><u></u></i><div class="trade-routes" role="group"></div>');$('trade-trucks').append(row);truckRows.push(row);
    row.querySelector('.trade-routes').setAttribute('aria-label','Route for truck '+(i+1));
    for(const route of [null,...Object.keys(RUNS)]){
      const chip=make('button','trade-route',route?RUNS[route].short:'Off');chip.dataset.route=route||'';
      chip.onclick=()=>onRoute?.(i+1,route);row.querySelector('.trade-routes').append(chip);
    }
  }
  $('trade-legend').textContent=Object.values(RUNS).map(r=>r.short+': '+r.label+', '+r.deal).join(' · ')+' · Off: park after the trip';
  function showTrade(open){
    if(open===root.classList.contains('trade-mode'))return;
    if(open&&!$('ops-forces').hidden)$('ops-forces-toggle').click();
    root.classList.toggle('trade-mode',open);$('ops-trucks-toggle').setAttribute('aria-pressed',String(open));onTrade?.(open);draw();
  }
  root.classList.add('trade-mode');
  $('ops-trucks-toggle').onclick=()=>showTrade(!root.classList.contains('trade-mode'));
  $('rescue-dispatch').onclick=()=>{if(trade?.evacuation?.finishedAt!=null)onNewEvacuation?.();else onRescue?.();};
  $('recruit-soldier').onclick=()=>onRecruit?.();
  function renderTrade(){
    if(!trade)return;
    const squad=squadStatus(trade),full=squad.soldiers>=RECRUIT.capacity;
    $('squad-count').textContent=`Soldiers · ${squad.soldiers}/${RECRUIT.capacity}`;
    $('dashboard-soldiers').textContent=squad.soldiers+' / '+RECRUIT.capacity;
    $('dashboard-squad-state').textContent=squad.training?`Recruit training · ${squad.remaining}s`:'Manage squad →';
    for(const slot of root.querySelectorAll('[data-slot]')){const i=Number(slot.dataset.slot);slot.classList.toggle('filled',i<squad.soldiers);slot.classList.toggle('training',i===squad.soldiers&&!!squad.training);}
    $('squad-summary').textContent=squad.training?(trade.food?`Training · ${squad.remaining}s`:'Training paused'):full?'Squad complete':'Recruit +';
    $('squad-benefit').textContent=`Convoy squad · +${squad.bonus} cells per relay visit. Every 2 extra soldiers add +1 salvage cell.`;
    $('recruit-progress').hidden=!squad.training;
    $('recruit-progress').value=squad.training?RECRUIT.duration-squad.training.remaining:0;
    $('recruit-detail').textContent=squad.training?(trade.food?'Supplies reserved. Training continues while the crew has food.':'Out of food. Training resumes when a delivery arrives.'):full?'All eight convoy positions are filled.':`Train one soldier in ${RECRUIT.duration/1000}s. Keep a food route running.`;
    $('recruit-soldier').disabled=!squad.ready;
    $('recruit-soldier').textContent=squad.training?`Training · ${squad.remaining}s remaining`:full?'Squad at capacity':`Recruit 1 · ${RECRUIT.cells} ⚡ + ${RECRUIT.food} 🥫`;
    const now=Date.now(),clock=timers(trade),mission=rescueStatus(trade),request=mission.request;
    $('rescue-title').textContent=mission.finishedAt!=null?'All civilians safe':'Hospital evacuation';
    $('rescue-count').textContent=mission.rescued+'/24';$('rescue-progress').value=mission.rescued;
    const rescueButton=$('rescue-dispatch');
    rescueButton.disabled=mission.finishedAt==null&&!mission.ready;
    rescueButton.textContent=mission.finishedAt!=null?'Accept next evacuation':mission.busy?'Truck '+mission.busy+' assigned':request?'Rescue '+request.people+' · '+request.cells+' ⚡ + '+request.food+' 🥫':'Complete';
    const supplyHint=request&&trade.food>=request.food&&trade.cells<request.cells?'Food is ready. Switch a truck to Salvage to save cells for the rescue.':'Use Both to salvage cells and trade for food, even when stores are empty.';
    $('rescue-detail').textContent=mission.finishedAt!=null?'Three runs complete. Your supply routes continue.':mission.busy?'Supplies reserved. The assigned truck collects the group and brings them home, then resumes its route.':mission.ready?'Supplies ready. Keep a food route running while one truck handles the rescue.':supplyHint+' Rescue '+(mission.stage+1)+'/3 needs '+request.cells+' cells and '+request.food+' food.';
    $('trade-cells').textContent=trade.cells;$('trade-food').textContent=trade.food;
    $('trade-cells-note').textContent=clock.cell==null?'Generator stopped':'+1 in '+clock.cell+' s';
    $('trade-food-note').textContent=trade.food?'−1 in '+clock.meal+' s':'Empty';
    $('trade-food').parentElement.classList.toggle('warn',trade.food<=3);
    $('trade-status').textContent=trade.food?(trade.log.at(-1)?.text||'Give a truck a route: it keeps running it on its own.'):'No food: assign Both to a truck. It can salvage cells and trade them for food even from zero.';
    trade.trucks.forEach((truck,i)=>{
      const where=truckAt(truck,now),row=truckRows[i];
      row.querySelector('b').textContent='Truck '+truck.id;
      const load=truck.cargo?[truck.cargo.cells&&truck.cargo.cells+' ⚡',truck.cargo.food&&truck.cargo.food+' 🥫'].filter(Boolean).join(' '):'';
      row.querySelector('span').textContent=truck.run?where.status+(load?' · '+load:'')+' · '+Math.max(0,Math.ceil((truck.departedAt+runTime(truck.run)-now)/1000))+'s home':where.status;
      row.querySelector('u').style.width=(truck.run?where.progress*100:0)+'%';row.classList.toggle('out',!!truck.run);
      if(truck.rescue)row.querySelector('span').textContent+=' · rescue next';
      else if(truck.run&&truck.run!==truck.route&&truck.run!=='rescue')row.querySelector('span').textContent+=' · '+(truck.route?RUNS[truck.route].short:'park')+' next';
      for(const chip of row.querySelectorAll('.trade-route'))chip.setAttribute('aria-pressed',String((truck.route||'')===chip.dataset.route));
    });
  }
  function placeTrucks(){
    if(!trade)return;const now=Date.now();
    trade.trucks.forEach((truck,i)=>{
      const mark=truckMarks[i];mark.hidden=!truck.run;if(!truck.run)return;
      const where=truckAt(truck,now),p=project(where.x,where.z);
      mark.style.left=(p.x*.5+.5)*width+'px';mark.style.top=(-p.y*.5+.5)*height+'px';
      mark.querySelector('span').textContent=truck.id;mark.classList.toggle('rescue',truck.run==='rescue');mark.querySelector('i').textContent=truck.run==='rescue'?'✚':'🚚';
    });
  }
  function cityStatus(){return cityOp?summary(cityOp,Date.now()):SITES.city.status+' · Sleet · 1 °C';}
  function cityLog(){if(!cityOp)return SITES.city.description;const clock=at=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});return cityOp.log.slice(-3).reverse().map(e=>clock(e.at)+'  '+e.text).join('\n');}
  function update(){const s=SITES[state.selected]||SITES.shelter;const city=state.selected==='city';const distance=Math.hypot(s.x-SITES.shelter.x,s.z-SITES.shelter.z)*50;
    $('ops-type').textContent=s.type;$('ops-name').textContent=s.name;$('ops-status').textContent=city?cityStatus():s.status+(distance?' · '+(distance/1000).toFixed(1)+' km':'');$('ops-description').textContent=city?cityLog():s.description;$('ops-description').classList.toggle('ops-log',city);
    $('ops-route').hidden=false;$('ops-drone').hidden=!city;
    $('ops-route').disabled=state.selected==='shelter';$('ops-route').textContent=state.route===state.selected?'Clear route':'Plot route';
    const [wind,vis]=WEATHER[state.weather]||WEATHER.blizzard;$('ops-weather').textContent='RIDGE: '+state.weather.toUpperCase()+' / '+vis+' m · CITY: SLEET / +1 °C';
    updateRoute();draw();onState?.({...state});
  }
  $('terminal-close').onclick=onClose;$('ops-drone').onclick=()=>onDrone?.();$('ops-fit').onclick=fit;$('ops-plus').onclick=()=>zoomAt(zoom*1.3);$('ops-minus').onclick=()=>zoomAt(zoom/1.3);
  $('ops-relief').onclick=()=>{tilted=!tilted;$('ops-relief').setAttribute('aria-pressed',String(tilted));draw();};
  $('ops-storm').onclick=()=>{weatherVisible=!weatherVisible;storm.visible=weatherVisible;$('ops-storm').setAttribute('aria-pressed',String(weatherVisible));draw();};
  $('ops-focus').onclick=()=>{const s=SITES[state.selected]||SITES.shelter;target.set(s.x,elevation(s.x,s.z),s.z);draw();};
  $('ops-route').onclick=()=>{state.route=state.route===state.selected?null:state.selected;update();notify(state.route?'Route plotted to '+SITES[state.route].short:'Route cleared');};
  $('ops-scan').onclick=()=>{if(scanTimer)return;$('ops-scan').disabled=true;$('ops-scan').textContent='Scanning…';root.classList.add('ops-scanning');notify('Sweeping eastern sector…');scanTimer=setTimeout(()=>{scanTimer=null;state.scanned=true;state.selected='echo';$('ops-scan').disabled=false;$('ops-scan').textContent='Rescan sector';root.classList.remove('ops-scanning');fit();update();notify('Thermal contact acquired · eastern ravine');},1400);};
  const trapFocus=e=>{if(e.key!=='Tab')return;const els=[...root.querySelectorAll('button:not([disabled]),canvas,summary')].filter(el=>el.tabIndex>=0&&!el.hidden&&el.getClientRects().length);const i=els.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();els.at(-1)?.focus();}else if(!e.shiftKey&&i===els.length-1){e.preventDefault();els[0]?.focus();}};
  root.addEventListener('keydown',trapFocus);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();notify('Map graphics interrupted. Waiting for the display to recover.');});canvas.addEventListener('webglcontextrestored',()=>{resize();});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
  return {
    // Live operation state for the Kestrel Falls card; the marker only pulses during contact.
    setCity(op){cityOp=op;drawForces();markers.city?.classList.toggle('ops-alert',op?.phase==='contact');markers.city.querySelector('span').textContent=op?.phase==='contact'?'Kestrel Falls · CONTACT':'Kestrel Falls · Cordon';const ring=scene?.getObjectByName('conflict-ring');if(ring)ring.material.color.set(op?.phase==='contact'?'#ff694c':'#94bcb2');if(state.selected==='city')update();else draw();},
    open(next){state={...state,...next};if(!SITES[state.selected])state.selected='shelter';if(state.route&&!SITES[state.route])state.route=null;root.hidden=false;active=true;init();resize();update();startLoop();canvas.focus({preventScroll:true});},
    close(){active=false;cancelAnimationFrame(raf);raf=0;root.hidden=true;pointers.clear();clearTimeout(scanTimer);scanTimer=null;root.classList.remove('ops-scanning');$('ops-scan').disabled=false;$('ops-scan').textContent=state.scanned?'Rescan sector':'Scan sector';},
    snapshot(){return {...state};},
    showTrade,
    get tradeOpen(){return root.classList.contains('trade-mode');},
    setTrade(next){trade=next;renderTrade();draw();},
    setWeather(weather){state.weather=weather;if(active)update();},
    dispose(){root.removeEventListener('keydown',trapFocus);active=false;cancelAnimationFrame(raf);raf=0;clearTimeout(scanTimer);clearTimeout(notify.timer);resizeObserver.disconnect();if(scene){scene.traverse(n=>{if(n.isInstancedMesh)n.dispose();});disposeScene(scene);}renderer?.dispose();root.replaceChildren();},
  };
}
