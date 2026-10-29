// Shared fictional survey: one coordinate system for the terminal and wall screen.
export const SECTOR = { width: 200, depth: 160, centerX:20, centerZ:20, metersPerUnit: 50 };
export const CITY = { x:15, z:13, districtWidth:24.6, districtDepth:19, columns:3, rows:3 };
const districtNames=['Market Ward','North Quarter','Eastgate','Riverside','Civic Center','Foundry','Southbank','Rail Quarter','Southgate'];
export const CITY_DISTRICTS=districtNames.map((name,i)=>({id:i+1,name,x:CITY.x+(i%3)*CITY.districtWidth,z:CITY.z+Math.floor(i/3)*CITY.districtDepth,width:CITY.districtWidth,depth:CITY.districtDepth}));
export const CITY_BUILDINGS=CITY_DISTRICTS.flatMap(d=>Array.from({length:24},(_,i)=>({district:d.id,x:d.x+2.45+(i%6)*3.9,z:d.z+2.6+Math.floor(i/6)*4.5,width:2.6,depth:2.8,height:1.1+(i%6+Math.floor(i/6)+d.id-1)%3*.6})));
export function surveyPoint(x,z,width=1600,height=1280){return [(x-SECTOR.centerX+SECTOR.width/2)/SECTOR.width*width,(z-SECTOR.centerZ+SECTOR.depth/2)/SECTOR.depth*height];}
export function surveyScale(metersPerPixel, maxPixels = 100) {
  const limit=metersPerPixel*maxPixels, power=10**Math.floor(Math.log10(limit));
  const meters=[5,2,1].map(n=>n*power).find(n=>n<=limit) || power;
  return {meters,pixels:meters/metersPerPixel};
}
export function surveySpan(aspect, tilted, maxHeight = 32) {
  const length = Math.hypot(120,75);
  const vertical = tilted ? SECTOR.depth*120/length + maxHeight*2*75/length : SECTOR.depth;
  return Math.max(vertical, SECTOR.width/Math.max(.01,aspect))*1.12;
}
export const SITES = {
  shelter: { name: 'OUTPOST 07', short: 'Outpost 07', x: -25, z: -8, color: '#f1ba68', type: 'YOUR LOCATION', status: 'Sealed · power online', description: 'A hardened command bunker cut into Black Ridge. The access tunnel emerges on the eastern mountainside above the valley road.' },
  nomad: { name: 'NOMAD', short: 'Nomad', x: -3, z: -9, color: '#b7e5e2', type: 'EXPEDITION CARRIER', status: 'Parked · intermittent radio', description: 'The carrier is sheltered below the western ridge. Follow the access road north.' },
  relay: { name: 'RELAY 03', short: 'Relay 03', x: 31, z: -26, color: '#b7e5e2', type: 'WEATHER STATION', status: 'Battery 18% · transmitting', description: 'A remote weather relay on the high ground. The eastern crossing is exposed to wind.' },
  // Nearby valley city, on the same geographic survey as the mountain bunker.
  city: { name: 'KESTREL FALLS', short: 'Kestrel Falls', x: 26, z: 23, color: '#ff8e72', type: 'VALLEY CITY · 9 DISTRICTS', distanceKm: 3, status: 'Army cordon · Corner Market 24', description: 'Nine districts spread across the eastern valley. The original market ward lies three kilometres down the mountain road. Soldiers hold Corner Market 24 in district 01; the drone and conflict marker remain over that block.' },
  echo: { name: 'UNKNOWN CONTACT', short: 'Echo 03', x: 22, z: 11, color: '#ff8e72', type: 'THERMAL RETURN', status: 'Three pulses · motion detected', description: 'An intermittent heat signature in the eastern ravine. Its source is unresolved.' },
};
export const WEATHER = { flurries: [5,160], snowfall: [24,90], blizzard: [78,35], whiteout: [120,12] };
export function elevation(x,z) {
  const ridge=(cx,cz,sx,sz,h)=>h*Math.exp(-((x-cx)**2/sx**2+(z-cz)**2/sz**2));
  return 1.2 + ridge(-34,-17,16,26,23)+ridge(-17,-32,19,14,12)+ridge(42,-27,16,16,9)
    + .65*Math.sin(x*.29+z*.13)*Math.cos(z*.23)+.24*Math.sin(x*.91+z*.48);
}
export function routeTo(id) {
  const a=SITES.shelter,b=SITES[id]; if(!b||id==='shelter')return [];
  return id==='city'?[[a.x,a.z],[-18,2],[-12,12],[0,19],[18,23],[b.x,b.z]]:id==='nomad'?[[a.x,a.z],[-18,2],[-17,-1],[b.x,b.z]]:
    id==='relay'?[[a.x,a.z],[-18,2],[-3,-9],[11,-14],[b.x,b.z]]:
    [[a.x,a.z],[-13,19],[0,16],[11,14],[b.x,b.z]];
}
let base;
export function surveyCanvas() {
  if(base)return base;
  const c=document.createElement('canvas');c.width=1600;c.height=1280;const ctx=c.getContext('2d');
  const im=ctx.createImageData(c.width,c.height);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const wx=x/c.width*SECTOR.width+SECTOR.centerX-SECTOR.width/2,wz=y/c.height*SECTOR.depth+SECTOR.centerZ-SECTOR.depth/2,h=elevation(wx,wz);
    const dx=elevation(wx+.2,wz)-h,dz=elevation(wx,wz+.2)-h;
    const shade=Math.max(0,Math.min(1,.69-dx*.95-dz*.65));
    const contour=(h*1.8)%1<.08?-.18:0;
    // A distinct snow line: exposed olive/brown valley, rocky transition, white high country.
    const t=Math.max(0,Math.min(1,(h-5.5)/6)),snow=t*t*(3-2*t);
    const rock=Math.max(0,Math.min(1,(h-2.5)/4));
    const valley=[76+rock*25,83+rock*17,64+rock*40],peak=[225,235,239];
    const v=.72+shade*.42+contour*.45;
    const i=(y*c.width+x)*4;
    for(let channel=0;channel<3;channel++)im.data[i+channel]=(valley[channel]*(1-snow)+peak[channel]*snow)*v;
    im.data[i+3]=255;
  }ctx.putImageData(im,0,0);
  const project=([x,z])=>surveyPoint(x,z,c.width,c.height);
  function line(points,color,width,dash=[]){ctx.beginPath();points.map(project).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  const river=[];for(let z=SECTOR.centerZ-SECTOR.depth/2;z<=SECTOR.centerZ+SECTOR.depth/2;z+=1)river.push([8+Math.sin(z*.09)*5+Math.sin(z*.2)*1.6,z]);
  line(river,'#344f54',16);line(river,'#597c82',9);line(river,'#88a9ad',2);
  const road=[[-25,-8],[-18,2],[-12,12],[0,19],[18,23],[26,23],[44,23],[90,23],[120,31]];
  line([[-18,2],[-3,-9],[11,-14],[31,-26]],'#8c998f',5);
  line(road,'#657170',8);line(road,'#c4b9a0',4);line(road,'#f3e0b6',1,[9,7]);
  ctx.strokeStyle='#253f4028';ctx.lineWidth=1;for(let x=0;x<=c.width;x+=80){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,c.height);ctx.stroke();}for(let y=0;y<=c.height;y+=80){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(c.width,y);ctx.stroke();}
  function label(text,x,z,color='#d4ddc7',size=17){ctx.fillStyle=color;ctx.font='600 '+size+'px monospace';ctx.fillText(text,...project([x,z]));}
  label('BLACK RIDGE',-48,-33,'#304c53',20);label('SUMMIT / 2180 m',-48,-29,'#304c53',13);
  label('KESTREL VALLEY',-5,83);label('EASTERN CUT',28,-43);label('VALLEY ACCESS ROAD',-31,27,'#d4ddc7',13);
  // Wet asphalt throughout the city grid, with no snow on the streets or roofs.
  const [cityX,cityY]=project([CITY.x,CITY.z]),scale=c.width/SECTOR.width;
  ctx.fillStyle='#343c3b';ctx.fillRect(cityX,cityY,CITY.districtWidth*3*scale,CITY.districtDepth*3*scale);
  ctx.fillStyle='#d3d9c4';ctx.font='600 17px monospace';ctx.fillText('KESTREL FALLS / 9 DISTRICTS / SLEET +1°C',cityX,cityY+CITY.districtDepth*3*scale+30);
  label('HIGH COUNTRY / SNOW −24°C',-65,-44,'#324a53',14);
  for(const d of CITY_DISTRICTS){
    const [px,py]=project([d.x,d.z]);ctx.strokeStyle='#c4b9a0';ctx.lineWidth=3;ctx.strokeRect(px,py,d.width*scale,d.depth*scale);
  }
  for(const b of CITY_BUILDINGS){
    const [px,py]=project([b.x-b.width/2,b.z-b.depth/2]);ctx.fillStyle=b.district%2?'#405351':'#4b5350';ctx.fillRect(px,py,b.width*scale,b.depth*scale);
    ctx.strokeStyle='#91aaa4';ctx.lineWidth=1;ctx.strokeRect(px,py,b.width*scale,b.depth*scale);
  }
  const [mx,my]=project([26,23]);ctx.fillStyle='#d99a68';ctx.fillRect(mx-12,my-12,24,24);
  ctx.strokeStyle='#e7af7e';ctx.setLineDash([8,5]);ctx.lineWidth=3;ctx.strokeRect(mx-34,my-32,68,64);ctx.setLineDash([]);
  const [bx,by]=project([-25,-8]);ctx.strokeStyle='#17272c';ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(bx-70,by-42);ctx.lineTo(bx,by);ctx.stroke();
  ctx.strokeStyle='#dfbd7b';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#dfbd7b';ctx.fillRect(bx-9,by-9,18,18);
  ctx.fillStyle='#223c40';ctx.font='bold 16px monospace';ctx.fillText('MOUNTAIN BUNKER',bx-95,by-60);
  base=c;return c;
}
// Optional city detail plan: river, street grid,
// lit blocks, Corner Market 24 inside the army cordon and, during contact, red dots for intruders still active.
// op: { phase, active, wave } from city-ops.mjs (or null).
export function drawCityPlan(ctx,x,y,w,h,op=null){
  const contact=op?.phase==='contact',s=h/300;let seed=7;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  ctx.save();ctx.translate(x,y);
  ctx.fillStyle='#101c22';ctx.fillRect(0,0,w,h);
  // Valley floor and the river running through town.
  ctx.fillStyle='#1d2b32';ctx.fillRect(4*s,44*s,w-8*s,h-48*s);
  ctx.strokeStyle='#3f6270';ctx.lineWidth=14*s;ctx.beginPath();ctx.moveTo(w*.08,h);ctx.bezierCurveTo(w*.2,h*.62,w*.12,h*.4,w*.32,h*.16);ctx.stroke();
  // Street grid: blocks with lit windows.
  const left=w*.3,top=56*s,cols=18,rows=12,bw=(w-left-14*s)/cols,bh=(h-top-14*s)/rows,gap=7*s;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
   const bx=left+c*bw+gap/2,by=top+r*bh+gap/2,market=r===1&&c===3;
   ctx.fillStyle=market?(contact?'#ff5a3c':'#d9b47a'):'#34444d';ctx.fillRect(bx,by,bw-gap,bh-gap);
   if(!market)for(let i=0;i<5;i++){if(rnd()<.5)continue;ctx.fillStyle=rnd()<.6?'#d9b47a':'#8fb4c0';ctx.fillRect(bx+2*s+rnd()*(bw-gap-6*s),by+2*s+rnd()*(bh-gap-6*s),3*s,3*s);}
  }
  // The cordon around the market block.
  const mx=left+3*bw,my=top+bh;ctx.setLineDash([6*s,4*s]);ctx.strokeStyle=contact?'#ff8e72':'#b7e5e2';ctx.lineWidth=2*s;ctx.strokeRect(mx-gap*.8,my-gap*.8,bw+gap*.6,bh+gap*.6);ctx.setLineDash([]);
  // Intruders still in the fight, around the cordon.
  if(contact)for(let i=0;i<Math.min(24,op.active||0);i++){const a=rnd()*Math.PI*2,d=(.75+rnd()*.6)*bw;ctx.fillStyle='#ff5a3c';ctx.beginPath();ctx.arc(mx+bw/2+Math.cos(a)*d,my+bh/2+Math.sin(a)*d*.7,2.6*s,0,Math.PI*2);ctx.fill();}
  // Title and frame.
  ctx.fillStyle='#e3c69a';ctx.font='bold '+Math.round(16*s)+'px monospace';ctx.fillText('KESTREL FALLS',10*s,22*s);
  ctx.fillStyle='#9fb3b4';ctx.font=Math.round(11*s)+'px monospace';ctx.fillText(contact?'CONTACT · wave '+op.wave+' · '+op.active+' active':'Valley city · 3 km SE',10*s,38*s);
  ctx.fillStyle=contact?'#ffb39f':'#d9b47a';ctx.fillText('CORNER MARKET 24',Math.max(left,mx-bw*1.4),h-8*s);
  ctx.strokeStyle=contact?'#ff8e72':'#9bb4c3';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
  ctx.restore();
}
export function wallSurvey(state={}) {
  const c=document.createElement('canvas');c.width=1600;c.height=1280;const ctx=c.getContext('2d');ctx.drawImage(surveyCanvas(),0,0);
  for(const d of CITY_DISTRICTS){const [x,y]=surveyPoint(d.x+.8,d.z+.2);ctx.fillStyle='#17282ee8';ctx.fillRect(x,y,182,22);ctx.fillStyle='#e4cf9e';ctx.font='bold 13px monospace';ctx.fillText(String(d.id).padStart(2,'0')+' / '+d.name.toUpperCase(),x+5,y+16);}
  const route=routeTo(state.route);if(route.length){ctx.strokeStyle='#ffcb70';ctx.lineWidth=7;ctx.setLineDash([14,10]);ctx.beginPath();route.forEach(([x,z],i)=>i?ctx.lineTo(...surveyPoint(x,z)):ctx.moveTo(...surveyPoint(x,z)));ctx.stroke();ctx.setLineDash([]);}
  // Kestrel Falls under attack: a red ring and a CONTACT tag on the wall map.
  if(state.cityContact){const [x,y]=surveyPoint(SITES.city.x,SITES.city.z);ctx.strokeStyle='#ff5a3c';ctx.lineWidth=6;for(const r of [26,40])ctx.beginPath(),ctx.arc(x,y,r,0,Math.PI*2),ctx.stroke();ctx.fillStyle='#ff5a3c';ctx.font='bold 22px monospace';ctx.fillText('CONTACT',x+28,y-26);}
  for(const [id,s] of Object.entries(SITES)){if(id==='echo'&&!state.scanned)continue;const [x,y]=surveyPoint(s.x,s.z);ctx.fillStyle='#12222c';ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle=s.color;ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#12222c';ctx.fillRect(x+20,y-18,200,36);ctx.fillStyle=s.color;ctx.font='bold 19px monospace';ctx.fillText(s.short.toUpperCase(),x+28,y+7);}
  // Kestrel Falls inset (bottom right) and a reminder that this survey is the high country.
  ctx.fillStyle='#182a31e8';ctx.fillRect(750,55,420,84);ctx.fillStyle=state.cityContact?'#ffad8e':'#c3dacf';ctx.font='bold 18px monospace';ctx.fillText(state.cityContact?'KESTREL FALLS / ACTIVE CONTACT':'KESTREL FALLS / CORDON',770,87);ctx.font='16px monospace';ctx.fillText('3 km SE · linked by valley road',770,118);
  ctx.fillStyle='#304c53';ctx.font='600 18px monospace';ctx.fillText('HIGH COUNTRY · 1,300–1,900 m',40,40);
  return c;
}
