import { plan } from './city-paths.js';
import { INTERIOR_BLOCKS, VIP_HOME, VIP_REFUGE, ESCORT_REFUGE, SAFE_APPROACH, SAFE_INSIDE, inDoorway } from './store-layout.js';

const BRIEFING = [
  ['ENVOY VALE · VIP','The hospital has forty civilians waiting. We open the north corridor before dawn.',6],
  ['CAPTAIN REYES','My team can hold this block. The bridge is the uncertain part.',5],
  ['ENVOY VALE · VIP','Then send the first convoy through in darkness. Medical transport goes first.',6],
  ['LIAISON MORGAN','Outpost 07 has fuel and an ambulance ready. They need your authorization.',5],
  ['ENVOY VALE · VIP','Approved. No one leaves the hospital behind. Confirm that on the secure channel.',6],
  ['CAPTAIN REYES','Understood. One guard stays with you. The others hold the street.',5],
];

// Only the designated escort is accepted here; no other guard can receive a refuge route.
export function createMeetingDirector(vip,escort) {
  let phase='briefing',door=0,manualOpen=false,quiet=0,brief=0,delay=0;
  let queue=[],line={speaker:BRIEFING[0][0],text:BRIEFING[0][1]},remaining=BRIEFING[0][2];
  const say=(speaker,text,seconds=5)=>{line={speaker,text};remaining=seconds;};
  const announce=lines=>{queue=lines.slice(1);say(...lines[0]);};
  const pathToEntry=actor=>plan([actor.x,actor.z],SAFE_APPROACH,INTERIOR_BLOCKS,.28);
  const routeIn=(actor,end)=>actor.z< -7.4 ? [[...end]] : [...pathToEntry(actor),[...SAFE_INSIDE],[...end]];
  const routeOut=(actor,end)=>[...plan([actor.x,actor.z],SAFE_INSIDE,INTERIOR_BLOCKS,.28),[...SAFE_APPROACH],...plan(SAFE_APPROACH,end,INTERIOR_BLOCKS,.28)];
  function move(actor,dt,speed) {
    if(actor.state==='down'){actor.speed=0;return;}
    const next=actor.path?.[0];if(!next){actor.speed=0;return;}
    const [x,z]=next,dx=x-actor.x,dz=z-actor.z,d=Math.hypot(dx,dz);
    // Wait for the leaf to clear before crossing the threshold.
    if(door<.96 && ((actor.z>-6.5&&z<-7)||(actor.z<-7.35&&z>-6.6)) && Math.abs(actor.z+6.93)<1.1){actor.speed=0;return;}
    const step=Math.min(d,speed*dt);actor.speed=dt>0?step/dt:0;
    if(d>.001){actor.x+=dx/d*step;actor.z+=dz/d*step;actor.yaw=Math.atan2(dx,dz)+Math.PI;}
    if(d<=step+.02)actor.path.shift();
  }
  const director={
    get phase(){return phase;},get door(){return door;},get locked(){return phase==='evacuating'||phase==='secure';},
    get dialogue(){return line;},
    isEscort:g=>g===escort&&phase!=='briefing'&&g.state!=='down',
    ask(){if(phase==='briefing')announce([['ENVOY VALE · VIP','This meeting decides whether those families get out tonight. Keep this route open for us.',6],['CAPTAIN REYES','We have three approaches to cover. Stay clear of the windows when contact starts.',5]]);},
    toggleDoor(){if(director.locked){announce([['ESCORT · RADIO','The envoy is secured. The door stays locked until the street is clear.',5]]);return;}manualOpen=!manualOpen;},
    update(dt,{threat=false,occupants=[]}={}){
      if(dt<=0)return;remaining-=dt;
      if(vip.state==='down'){line=null;queue=[];}
      else if(remaining<=0){if(queue.length)say(...queue.shift());else if(phase==='briefing'&&brief<BRIEFING.length-1)say(...BRIEFING[++brief]);else line=null;}
      if(threat&&phase!=='evacuating'&&phase!=='secure'&&vip.state!=='down'){
        phase='evacuating';quiet=0;delay=.8;
        vip.state='to-shelter';vip.path=routeIn(vip,VIP_REFUGE);
        if(escort.state!=='down'){escort.state='escort';escort.spot=null;escort.foe=null;escort.path=routeIn(escort,ESCORT_REFUGE);}
        announce([['CAPTAIN REYES','Contact outside! Vale, to the safe room. Escort One, go with them.',4],['ENVOY VALE · VIP','Keep the evacuation channel open. The convoy is still our priority.',5]]);
      }
      if(phase==='evacuating'){
        move(vip,dt,2.7);delay=Math.max(0,delay-dt);if(delay===0)move(escort,dt,2.9);
        if((vip.state==='down'||!vip.path.length)&&(escort.state==='down'||!escort.path.length)){
          phase='secure';if(vip.state!=='down')vip.state='shelter';quiet=0;
          announce([[escort.state==='down'?'ENVOY VALE · VIP':'ESCORT · RADIO',escort.state==='down'?'I am inside the safe room. Keep that corridor open.':'Envoy secured. I am inside with them. Hold the storefront.',5]]);
        }
      }else if(phase==='secure'){
        vip.speed=escort.speed=0;quiet=threat?0:quiet+dt;
        if(quiet>8&&vip.state!=='down'){
          phase='returning';vip.state='return';vip.path=routeOut(vip,VIP_HOME);
          if(escort.state!=='down'){escort.state='escort';escort.path=routeOut(escort,[-5.55,-6.15]);}
          announce([['CAPTAIN REYES','Street is clear. Bring the envoy back to the table.',4],['ENVOY VALE · VIP','We finish the plan. Get me the hospital on the radio.',5]]);
        }
      }else if(phase==='returning'){
        move(vip,dt,1.25);move(escort,dt,1.35);
        if(!vip.path.length&&(escort.state==='down'||!escort.path.length)){
          phase='briefing';vip.state='meeting';vip.yaw=Math.PI;manualOpen=false;brief=2;
          if(escort.state!=='down'){escort.state='route';escort.dist=0;escort.wait=1;}
        }
      }
      let open=phase==='evacuating'||phase==='returning'||(phase==='briefing'&&manualOpen);
      // Never close through a person in the doorway (including the player).
      if(!open&&occupants.some(inDoorway))open=true;
      door=Math.max(0,Math.min(1,door+(open?1:-1)*dt*1.5));
    },
  };
  return director;
}
