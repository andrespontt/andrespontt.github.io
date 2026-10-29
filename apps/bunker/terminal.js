import * as THREE from 'three';
import { disposeScene } from './area-manager.mjs';
import { SITES, WEATHER, SECTOR, CITY, CITY_DISTRICTS, CITY_BUILDINGS, SETTLEMENT_SITES, elevation, routeTo, roadPoint, surveyCanvas, surveySpan, surveyScale } from './sector.js?v=room3';
import { summary } from './city-ops.mjs';
import { roadPosition, settlement } from './protectorate.mjs';
import { createCommandDesk, describeUnit } from './command.js';

// The situation terminal: the 3D sector map (terrain, Kestrel Falls, sites, settlements and the units moving
// between them) beside the command desk (command.js), where the protectorate game is played.
// game.js owns the game state: setGame() hands it in, onAction() sends orders back.
export function createTerminal(root,{onClose,onState,onDrone,onCommand,onAction,onReset}) {
  let state={selected:'shelter',route:null,scanned:false,weather:'blizzard'},active=false,renderer,scene,camera,terrain,routeMesh,storm;
  let zoom=1,tilted=true,weatherVisible=false,target=new THREE.Vector3(SECTOR.centerX,0,SECTOR.centerZ),width=1,height=1,scanTimer=null;
  const pointers=new Map(),ray=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  // Living map: effects built in init() and moved by animate() while the terminal is open (≤30 fps).
  // With reduced motion the map draws them once, still.
  let fx={},routeCurve=null,raf=0,lastFrame=0;const still=matchMedia('(prefers-reduced-motion: reduce)');
  root.innerHTML=`<div class="ops-shell">
    <div class="ops-top"><div class="ops-title"><span class="ops-live"></span><div><small>BLACK RIDGE / COMMAND</small><h2 id="terminal-title">Outpost 07</h2></div></div><div class="ops-weather" id="ops-weather"></div><button id="terminal-close" class="ops-close" aria-label="Return to situation room">Return to room <b>×</b></button></div>
    <div class="cmd-stock" id="cmd-stock" aria-label="Resources and game clock"></div>
    <div class="ops-workspace">
      <div id="ops-viewport"><canvas id="ops-map" tabindex="0" aria-label="Regional map. Drag to move, pinch or scroll to zoom. Arrow keys pan, plus and minus zoom, Home fits the sector."></canvas><div id="ops-markers"></div><div class="ops-north">N<span>↑</span></div>
        <div class="ops-tools"><button id="ops-command-toggle" aria-pressed="true" aria-controls="ops-command" aria-label="Command desk">▤ <span>Command</span></button><button id="ops-fit" title="Show the whole sector (Home)">⌖ <span>Fit sector</span></button><button id="ops-city-view" aria-label="Focus all nine city districts" title="Focus all nine city districts">▦ <span>City</span></button><button aria-label="Toggle terrain relief" id="ops-relief" aria-pressed="true">3D <span>Relief</span></button><button aria-label="Toggle weather overlay" id="ops-storm" aria-pressed="false">≋ <span>Weather</span></button></div>
        <div class="ops-zoom"><button id="ops-plus" aria-label="Zoom in">+</button><output id="ops-zoom-label">1.0×</output><button id="ops-minus" aria-label="Zoom out">−</button></div>
        <div class="ops-scale"><span id="ops-scale-bar"></span><b id="ops-scale-text">500 m</b></div><div id="ops-notice" role="status" hidden></div>
        <div id="ops-unit" role="status" hidden><div class="ops-unit-head"><b id="ops-unit-title"></b><button id="ops-unit-close" aria-label="Stop tracking">×</button></div><dl id="ops-unit-rows"></dl></div>
        <div class="ops-selection"><div class="ops-selection-heading"><div><small id="ops-type"></small><h3 id="ops-name"></h3></div><button id="ops-focus" aria-label="Center map on selected location">⌖</button></div><p id="ops-status"></p><p id="ops-description"></p><div class="ops-selection-actions"><button id="ops-route">Plot route</button><button id="ops-drone" hidden>▶ Drone feed</button><button id="ops-scan">Scan sector</button></div></div>
        <div class="ops-help">DRAG TO MOVE <span>·</span> PINCH / SCROLL TO ZOOM <span>·</span> TAP A SETTLEMENT</div>
      </div>
      <section id="ops-command" aria-label="Command desk"></section>
    </div>
    <div id="cmd-overlay" hidden></div></div>`;
  const $=id=>root.querySelector('#'+id),canvas=$('ops-map'),viewport=$('ops-viewport');
  let game=null,gameAt=0;
  // Game time between state updates, so units glide instead of jumping four times a second.
  const gameNow=()=>game?game.time+game.carry+Math.min(600,performance.now()-gameAt)*game.speed:0;
  const desk=createCommandDesk({stock:$('cmd-stock'),desk:$('ops-command'),overlay:$('cmd-overlay'),onAction:a=>onAction?.(a),onReset:()=>onReset?.(),onTrack:track});
  $('ops-city-view').onclick=()=>{
    target.set(CITY.x+CITY.districtWidth*1.5,0,CITY.z+CITY.districtDepth*1.5-5); // Leave room above the city for map controls.
    const aspect=width/height,vertical=tilted?CITY.districtDepth*3*120/Math.hypot(120,75)+8:CITY.districtDepth*3;
    zoom=Math.min(7,surveySpan(aspect,tilted)/(Math.max(vertical,CITY.districtWidth*3/aspect)*1.3));draw();
  };
  const markers={};for(const [id,s] of Object.entries(SITES)){
    const b=document.createElement('button');b.className='ops-marker';b.dataset.site=id;b.style.setProperty('--pin',s.color);b.innerHTML=`<i>${id==='shelter'?'⌂':id==='nomad'?'▰':id==='relay'?'⌁':id==='city'?'▣':'?'}</i><span>${s.short}</span>`;b.setAttribute('aria-label','Inspect '+s.short);b.onclick=()=>{state.selected=id;showCommand(false);update();};$('ops-markers').append(b);markers[id]=b;
  }
  // Protectorate settlements: their colour is their status; a tap opens their management card.
  const towns={};for(const [id,site] of Object.entries(SETTLEMENT_SITES)){
    const b=document.createElement('button');b.className='ops-marker ops-town';b.dataset.town=id;b.innerHTML=`<i>${id==='farm'?'❦':id==='mine'?'⛏':'⚙'}</i><span></span>`;
    b.onclick=()=>{showCommand(true);desk.select(id);};$('ops-markers').append(b);towns[id]=b;
  }
  const units=new Map();let tracked=null;
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
    // Settlements under attack get the same spreading rings in orange.
    fx.townPings=Object.fromEntries(Object.entries(SETTLEMENT_SITES).map(([id,site])=>[id,[0,1].map(()=>{const m=new THREE.Mesh(new THREE.RingGeometry(.92,1,64),new THREE.MeshBasicMaterial({color:'#ff9a4a',transparent:true,side:THREE.DoubleSide,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending}));m.rotation.x=-Math.PI/2;m.position.set(site.x,elevation(site.x,site.z)+1.5,site.z);m.renderOrder=3;m.visible=false;scene.add(m);return m;})]));
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
    for(const [id,rings] of Object.entries(fx.townPings)){const attacked=game&&settlement(game,id)?.status==='under_attack';rings.forEach((ring,i)=>{const k=(s*.6+i*.5)%1;ring.visible=!!attacked;ring.scale.setScalar(2.5+k*9);ring.material.opacity=(1-k)*.9;});}
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
  const place=(el,x,z)=>{const p=project(x,z);el.style.left=(p.x*.5+.5)*width+'px';el.style.top=(-p.y*.5+.5)*height+'px';return p;};
  function cameraUpdate(){
    // Frame the sector in its dedicated viewport at every screen size.
    const aspect=width/height,span=surveySpan(aspect,tilted)/zoom;
    camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;
    camera.up.set(0,1,0);camera.position.copy(target).add(tilted?new THREE.Vector3(0,120,75):new THREE.Vector3(0,150,.001));camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  function draw(){
    if(!active||!renderer)return;cameraUpdate();renderer.render(scene,camera);
    for(const [id,s] of Object.entries(SITES)){const b=markers[id],p=place(b,s.x,s.z);b.hidden=(id==='echo'&&!state.scanned)||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;b.classList.toggle('label-left',(p.x*.5+.5)*width>width*.68);b.setAttribute('aria-pressed',String(id===state.selected));}
    placeTowns();placeUnits();
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

  // ── Protectorate on the map ────────────────────────────────────────────────────────────────────
  const STATUS_LABEL={protected:'',under_attack:'ATTACK',occupied:'OCCUPIED',neutral:'NEUTRAL'};
  function placeTowns(){
    for(const [id,b] of Object.entries(towns)){
      const site=SETTLEMENT_SITES[id],x=game&&settlement(game,id),p=place(b,site.x,site.z);
      b.hidden=!x||Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;if(!x)continue;
      // Label under the icon only when it would run off the map (to the left it would cover Kestrel Falls).
      b.dataset.status=x.status;b.classList.toggle('label-below',(p.x*.5+.5)*width+30+b.querySelector('span').offsetWidth>width-6);b.setAttribute('aria-pressed',String(desk.selected===id&&root.classList.contains('command-mode')));
      const label=x.status==='protected'?`${x.name} · ${x.assignedSoldiers}/${x.recommendedGarrison}`:x.status==='under_attack'?`${x.name} · ATTACK`:`${x.name} · ${STATUS_LABEL[x.status]}`;
      const span=b.querySelector('span');if(span.textContent!==label){span.textContent=label;b.setAttribute('aria-label',`${x.name}, ${x.kind}, ${x.status.replace('_',' ')}. Open its management card.`);}
    }
  }
  const TRUCK='<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 2h13v10H1zM14 5h5l4 4v3h-9z"/><circle cx="6" cy="13" r="2.2"/><circle cx="18" cy="13" r="2.2"/></svg>';
  const TROOPS='<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M3 9l9-6 9 6-2.5 2L12 6.6 5.5 11z"/><path d="M3 14l9-6 9 6-2.5 2L12 11.6 5.5 16z" opacity=".6"/></svg>';
  function placeUnits(){
    if(!game)return;
    const now=gameNow(),live=new Set();
    const list=[...game.convoys.map(c=>({u:c,id:c.id,cls:'convoy cargo-'+c.cargo,html:TRUCK,count:now<c.arriveAt?c.amount:''})),...game.movements.map(m=>({u:m,id:m.id,cls:'troops kind-'+m.kind,html:TROOPS,count:m.soldiers}))];
    for(const {u,id,cls,html,count} of list){
      const site=SETTLEMENT_SITES[u.settlement];if(!site)continue;live.add(id);
      let el=units.get(id);
      if(!el){el=document.createElement('button');el.className='ops-unit '+cls;el.innerHTML=html+'<b></b>';el.onclick=()=>track({unit:id});$('ops-markers').append(el);units.set(id,el);}
      const [x,z]=roadPoint(site.road,roadPosition(u,now)),p=place(el,x,z);
      el.hidden=Math.abs(p.x)>1.1||Math.abs(p.y)>1.1;
      el.querySelector('b').textContent=count;el.classList.toggle('tracked',tracked?.unit===id);
      const name=settlement(game,u.settlement).name,label=u.cargo?`Supply truck, ${name}`:`${u.soldiers} soldiers, ${u.outbound?'to':'from'} ${name}`;
      if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
    }
    for(const [id,el] of units)if(!live.has(id)){el.remove();units.delete(id);}
    renderUnitCard(now);
  }
  function renderUnitCard(now){
    const card=$('ops-unit');
    if(!tracked?.unit){card.hidden=true;return;}
    const info=describeUnit(game,tracked.unit,now);
    if(!info){card.hidden=true;tracked=null;return;}
    card.hidden=false;$('ops-unit-title').textContent=info.title;
    const html=info.rows.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('');
    if($('ops-unit-rows').innerHTML!==html)$('ops-unit-rows').innerHTML=html;
  }
  // Follow a unit (truck or troops) or centre a settlement on the map.
  function track(what){
    if(what.settlement){const site=SETTLEMENT_SITES[what.settlement];target.set(site.x,0,site.z);zoom=Math.max(zoom,1.8);constrain();draw();return;}
    tracked=what;
    const u=game&&[...game.convoys,...game.movements].find(o=>o.id===what.unit),site=u&&SETTLEMENT_SITES[u.settlement];
    if(site){const [x,z]=roadPoint(site.road,roadPosition(u,gameNow()));target.set(x,0,z);constrain();}
    draw();
  }
  $('ops-unit-close').onclick=()=>{tracked=null;draw();};

  function cityStatus(){return cityOp?summary(cityOp,Date.now()):SITES.city.status+' · Sleet · 1 °C';}
  function cityLog(){if(!cityOp)return SITES.city.description;const clock=at=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});return cityOp.log.slice(-3).reverse().map(e=>clock(e.at)+'  '+e.text).join('\n');}
  function update(){const s=SITES[state.selected]||SITES.shelter;const city=state.selected==='city';const distance=Math.hypot(s.x-SITES.shelter.x,s.z-SITES.shelter.z)*50;
    $('ops-type').textContent=s.type;$('ops-name').textContent=s.name;$('ops-status').textContent=city?cityStatus():s.status+(distance?' · '+(distance/1000).toFixed(1)+' km':'');$('ops-description').textContent=city?cityLog():s.description;$('ops-description').classList.toggle('ops-log',city);
    $('ops-route').hidden=false;$('ops-drone').hidden=!city;
    $('ops-route').disabled=state.selected==='shelter';$('ops-route').textContent=state.route===state.selected?'Clear route':'Plot route';
    const [,vis]=WEATHER[state.weather]||WEATHER.blizzard;$('ops-weather').textContent='RIDGE: '+state.weather.toUpperCase()+' / '+vis+' m · CITY: SLEET / +1 °C';
    updateRoute();draw();onState?.({...state});
  }
  function showCommand(open){
    if(open===root.classList.contains('command-mode'))return;
    root.classList.toggle('command-mode',open);$('ops-command-toggle').setAttribute('aria-pressed',String(open));onCommand?.(open);draw();
  }
  root.classList.add('command-mode');
  $('ops-command-toggle').onclick=()=>showCommand(!root.classList.contains('command-mode'));
  $('terminal-close').onclick=onClose;$('ops-drone').onclick=()=>onDrone?.();$('ops-fit').onclick=fit;$('ops-plus').onclick=()=>zoomAt(zoom*1.3);$('ops-minus').onclick=()=>zoomAt(zoom/1.3);
  $('ops-relief').onclick=()=>{tilted=!tilted;$('ops-relief').setAttribute('aria-pressed',String(tilted));draw();};
  $('ops-storm').onclick=()=>{weatherVisible=!weatherVisible;storm.visible=weatherVisible;$('ops-storm').setAttribute('aria-pressed',String(weatherVisible));draw();};
  $('ops-focus').onclick=()=>{const s=SITES[state.selected]||SITES.shelter;target.set(s.x,elevation(s.x,s.z),s.z);draw();};
  $('ops-route').onclick=()=>{state.route=state.route===state.selected?null:state.selected;update();notify(state.route?'Route plotted to '+SITES[state.route].short:'Route cleared');};
  $('ops-scan').onclick=()=>{if(scanTimer)return;$('ops-scan').disabled=true;$('ops-scan').textContent='Scanning…';root.classList.add('ops-scanning');notify('Sweeping eastern sector…');scanTimer=setTimeout(()=>{scanTimer=null;state.scanned=true;state.selected='echo';$('ops-scan').disabled=false;$('ops-scan').textContent='Rescan sector';root.classList.remove('ops-scanning');fit();update();notify('Thermal contact acquired · eastern ravine');},1400);};
  const trapFocus=e=>{if(e.key!=='Tab')return;const els=[...root.querySelectorAll('button:not([disabled]),canvas')].filter(el=>el.tabIndex>=0&&!el.hidden&&el.getClientRects().length);const scope=$('cmd-overlay').hidden?els:els.filter(el=>$('cmd-overlay').contains(el));const i=scope.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();scope.at(-1)?.focus();}else if(!e.shiftKey&&i===scope.length-1){e.preventDefault();scope[0]?.focus();}};
  root.addEventListener('keydown',trapFocus);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();notify('Map graphics interrupted. Waiting for the display to recover.');});canvas.addEventListener('webglcontextrestored',()=>{resize();});
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(viewport);
  return {
    // Live operation state for the Kestrel Falls card; the marker only pulses during contact.
    setCity(op){cityOp=op;markers.city?.classList.toggle('ops-alert',op?.phase==='contact');markers.city.querySelector('span').textContent=op?.phase==='contact'?'Kestrel Falls · CONTACT':'Kestrel Falls · Cordon';const ring=scene?.getObjectByName('conflict-ring');if(ring)ring.material.color.set(op?.phase==='contact'?'#ff694c':'#94bcb2');if(state.selected==='city')update();else draw();},
    open(next){state={...state,...next};if(!SITES[state.selected])state.selected='shelter';if(state.route&&!SITES[state.route])state.route=null;root.hidden=false;active=true;init();resize();update();startLoop();canvas.focus({preventScroll:true});},
    close(){active=false;cancelAnimationFrame(raf);raf=0;root.hidden=true;pointers.clear();clearTimeout(scanTimer);scanTimer=null;root.classList.remove('ops-scanning');$('ops-scan').disabled=false;$('ops-scan').textContent=state.scanned?'Rescan sector':'Scan sector';},
    snapshot(){return {...state};},
    showCommand,
    selectSettlement(id){showCommand(true);desk.select(id);},
    get commandOpen(){return root.classList.contains('command-mode');},
    setGame(next){game=next;gameAt=performance.now();if(!active)return;desk.set(game,gameNow());draw();},
    setWeather(weather){state.weather=weather;if(active)update();},
    dispose(){root.removeEventListener('keydown',trapFocus);active=false;cancelAnimationFrame(raf);raf=0;clearTimeout(scanTimer);clearTimeout(notify.timer);resizeObserver.disconnect();if(scene){scene.traverse(n=>{if(n.isInstancedMesh)n.dispose();});disposeScene(scene);}renderer?.dispose();root.replaceChildren();},
  };
}
