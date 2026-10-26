// Shared fictional survey: one coordinate system for the terminal and wall screen.
export const SECTOR = { width: 120, depth: 90, metersPerUnit: 50 };
export const SITES = {
  shelter: { name: 'OUTPOST 07', short: 'Outpost 07', x: -25, z: 17, color: '#f1ba68', type: 'YOUR LOCATION', status: 'Sealed · power online', description: 'Situation room and emergency shelter. Your point of return.' },
  nomad: { name: 'NOMAD', short: 'Nomad', x: -3, z: -9, color: '#b7e5e2', type: 'EXPEDITION CARRIER', status: 'Parked · intermittent radio', description: 'The carrier is sheltered below the western ridge. Follow the access road north.' },
  relay: { name: 'RELAY 03', short: 'Relay 03', x: 31, z: -26, color: '#b7e5e2', type: 'WEATHER STATION', status: 'Battery 18% · transmitting', description: 'A remote weather relay on the high ground. The eastern crossing is exposed to wind.' },
  echo: { name: 'UNKNOWN CONTACT', short: 'Echo 03', x: 22, z: 11, color: '#ff8e72', type: 'THERMAL RETURN', status: 'Three pulses · motion detected', description: 'An intermittent heat signature in the eastern ravine. Its source is unresolved.' },
};
export const WEATHER = { flurries: [5,160], snowfall: [24,90], blizzard: [78,35], whiteout: [120,12] };
export function elevation(x,z) {
  const ridge=(cx,cz,sx,sz,h)=>h*Math.exp(-((x-cx)**2/sx**2+(z-cz)**2/sz**2));
  return 1.2 + ridge(-33,-22,14,32,10)+ridge(35,-6,19,23,8)+ridge(7,35,30,13,5)
    + .65*Math.sin(x*.29+z*.13)*Math.cos(z*.23)+.24*Math.sin(x*.91+z*.48);
}
export function routeTo(id) {
  const a=SITES.shelter,b=SITES[id]; if(!b||id==='shelter')return [];
  return id==='nomad'?[[a.x,a.z],[-22,7],[-17,-1],[b.x,b.z]]:
    id==='relay'?[[a.x,a.z],[-22,7],[-17,-1],[-3,-9],[11,-14],[19,-23],[b.x,b.z]]:
    [[a.x,a.z],[-13,19],[0,16],[11,14],[b.x,b.z]];
}
let base;
export function surveyCanvas() {
  if(base)return base;
  const c=document.createElement('canvas');c.width=1200;c.height=900;const ctx=c.getContext('2d');
  const im=ctx.createImageData(c.width,c.height);
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const wx=x/10-60,wz=y/10-45,h=elevation(wx,wz);
    const dx=elevation(wx+.2,wz)-h,dz=elevation(wx,wz+.2)-h;
    const shade=Math.max(0,Math.min(1,.69-dx*.95-dz*.65));
    const contour=(h*1.8)%1<.08?-.18:0;
    const snow=Math.min(1,h/12),v=shade+contour;
    const i=(y*c.width+x)*4;
    im.data[i]=67+v*80+snow*85;im.data[i+1]=89+v*78+snow*64;im.data[i+2]=100+v*77+snow*55;im.data[i+3]=255;
  }ctx.putImageData(im,0,0);
  const project=([x,z])=>[(x+60)*10,(z+45)*10];
  function line(points,color,width,dash=[]){ctx.beginPath();points.map(project).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  const river=[];for(let z=-45;z<=45;z+=1)river.push([8+Math.sin(z*.09)*5+Math.sin(z*.2)*1.6,z]);
  line(river,'#526f7b',16);line(river,'#b3d0d6',9);line(river,'#e0edf0',2);
  const road=[[-38,45],[-31,32],[-25,17],[-22,7],[-17,-1],[-3,-9],[11,-14],[19,-23],[31,-26],[45,-35]];
  line(road,'#657170',8);line(road,'#c4b9a0',4);line(road,'#f3e0b6',1,[9,7]);
  ctx.strokeStyle='#253f4028';ctx.lineWidth=1;for(let x=0;x<=1200;x+=100){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,900);ctx.stroke();}for(let y=0;y<=900;y+=100){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1200,y);ctx.stroke();}
  ctx.fillStyle='#304c53';ctx.font='600 20px monospace';ctx.fillText('BLACK RIDGE',120,170);ctx.fillText('EASTERN CUT',850,540);ctx.fillText('FROZEN BASIN',450,765);
  ctx.font='14px monospace';ctx.fillText('1840 m',150,199);ctx.fillText('1280 m',875,568);
  base=c;return c;
}
export function wallSurvey(state={}) {
  const c=document.createElement('canvas');c.width=1200;c.height=900;const ctx=c.getContext('2d');ctx.drawImage(surveyCanvas(),0,0);
  const route=routeTo(state.route);if(route.length){ctx.strokeStyle='#ffcb70';ctx.lineWidth=7;ctx.setLineDash([14,10]);ctx.beginPath();route.forEach(([x,z],i)=>i?ctx.lineTo((x+60)*10,(z+45)*10):ctx.moveTo((x+60)*10,(z+45)*10));ctx.stroke();ctx.setLineDash([]);}
  for(const [id,s] of Object.entries(SITES)){if(id==='echo'&&!state.scanned)continue;const x=(s.x+60)*10,y=(s.z+45)*10;ctx.fillStyle='#12222c';ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle=s.color;ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#12222c';ctx.fillRect(x+20,y-18,200,36);ctx.fillStyle=s.color;ctx.font='bold 19px monospace';ctx.fillText(s.short.toUpperCase(),x+28,y+7);}
  return c;
}
