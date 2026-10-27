import { plan } from './city-paths.js';
import { followRoute, routeDistance } from './actor-motion.js';
import { moveThroughCity, SOLIDS } from './city-space.js';
import { INTERIOR_BLOCKS, VIP_HOME, VIP_REFUGE, ESCORT_REFUGE, SAFE_APPROACH, SAFE_INSIDE, SAFE_DOOR_X, SAFE_DOOR_Z, inDoorway, inSafeRoom, safeDoorBounds } from './store-layout.js';

const BRIEFING = [
  ['{ENVOY} · VIP','The hospital has forty civilians waiting. We open the north corridor before dawn.',6],
  ['CAPTAIN REYES','My team can hold this block. The bridge is the uncertain part.',5],
  ['{ENVOY} · VIP','Then send the first convoy through in darkness. Medical transport goes first.',6],
  ['LIAISON MORGAN','Outpost 07 has fuel and an ambulance ready. They need your authorization.',5],
  ['{ENVOY} · VIP','Approved. No one leaves the hospital behind. Confirm that on the secure channel.',6],
  ['CAPTAIN REYES','Understood. One guard stays with you. The others hold the street.',5],
];

// Hit, the envoy calls it out (one line each time, in turn).
const HURT = ['I am hit! Keep moving!','Still standing. Get me inside.','I can not take much more of this.'];
const ARRIVAL = [['{ENVOY} · VIP','The last envoy did not make it. I have the authority now, so we finish this plan.',6],['CAPTAIN REYES','Understood. Same rules: when contact starts, you go to the safe room.',5]];

// Only the designated escort is accepted here; no other guard can receive a refuge route.
export function createMeetingDirector(vip,escort,{moveBody}={}) {
  let phase='briefing',door=0,manualOpen=false,quiet=0,brief=0,delay=0,holdOpen=false;
  let queue=[],line=null,remaining=0;
  // vip.name is the current envoy (a replacement takes over when one is killed).
  const named=t=>t.replaceAll('{ENVOY}','ENVOY '+(vip.name||'Vale').toUpperCase()).replaceAll('{NAME}',vip.name||'Vale');
  let hurtLine=0,interactionCooldown=0,hurtCooldown=0;
  let nearby=[];
  const walk=moveBody||((p,dx,dz)=>moveThroughCity(p,dx,dz,[...SOLIDS,safeDoorBounds(door)]));
  const say=(speaker,text,seconds=5)=>{line={speaker:named(speaker),text:named(text)};remaining=seconds;};
  say(...BRIEFING[0]);
  const announce=lines=>{queue=lines.slice(1);say(...lines[0]);};
  const pathToEntry=actor=>actor.z>1.6?[[0,2.7],[0,-.7],...plan([0,-.7],SAFE_APPROACH,INTERIOR_BLOCKS,.28)]:plan([actor.x,actor.z],SAFE_APPROACH,INTERIOR_BLOCKS,.28);
  const routeIn=(actor,end)=>{if(inSafeRoom(actor))return plan([actor.x,actor.z],end,INTERIOR_BLOCKS,.28);const entry=pathToEntry(actor);return entry.length?[...entry,[...SAFE_INSIDE],...plan(SAFE_INSIDE,end,INTERIOR_BLOCKS,.28)]:[];};
  const routeOut=(actor,end)=>[...plan([actor.x,actor.z],SAFE_INSIDE,INTERIOR_BLOCKS,.28),[...SAFE_APPROACH],...plan(SAFE_APPROACH,end,INTERIOR_BLOCKS,.28)];
  const pace=()=>.55+.45*Math.max(0,vip.hp??100)/100; // a wounded envoy limps
  function move(actor,dt,speed) {
    if(actor.state==='down'){actor.speed=0;return;}
    const next=actor.path?.[0];if(!next){actor.speed=0;return;}
    const [x,z]=next,dx=x-actor.x,dz=z-actor.z,d=Math.hypot(dx,dz);
    // Wait for the leaf to clear before crossing the threshold.
    const front=SAFE_DOOR_Z+.43,back=SAFE_DOOR_Z-.43; // either side of the door leaf
    if(door<.96 && ((actor.z>front&&z<back)||(actor.z<back&&z>front)) && Math.abs(actor.z-SAFE_DOOR_Z)<1.1 && Math.abs(actor.x-SAFE_DOOR_X)<1.6){actor.speed=0;return;}
    followRoute(actor,dt,{speed,move:walk,peers:actor===escort?[vip,...nearby]:nearby});

  }
  const director={
    get phase(){return phase;},get door(){return door;},get locked(){return phase==='evacuating'||phase==='secure';},
    get dialogue(){return line;},
    // Test switch: the door stays open whatever happens (intruders can get into the safe room).
    get holdOpen(){return holdOpen;},set holdOpen(value){holdOpen=!!value;},
    // The opening briefing has been heard to the end (the standalone ambush waits for it).
    get briefed(){return phase!=='briefing'||(brief>=BRIEFING.length-1&&!line&&!queue.length);},
    isEscort:g=>g===escort&&phase!=='briefing'&&phase!=='arriving'&&g.state!=='down',
    // A new envoy walks in from the street along `path` and restarts the briefing at the table.
    arrive(path){phase='arriving';vip.state='arrive';vip.path=path;manualOpen=false;brief=0;quiet=0;queue=[];line=null;remaining=1.5;},
    radio(speaker,text,seconds=4){say(speaker,text,seconds);},
    hurt(){if(vip.state==='down'||hurtCooldown>0)return;hurtCooldown=3;say('{ENVOY} · VIP',HURT[hurtLine++%HURT.length],3);},
    ask(){if(phase==='briefing'&&interactionCooldown<=0){interactionCooldown=8;announce([['{ENVOY} · VIP','This meeting decides whether those families get out tonight. Keep this route open for us.',6],['CAPTAIN REYES','We have three approaches to cover. Stay clear of the windows when contact starts.',5]]);}},
    civilian(role,hidden){if(interactionCooldown>0)return false;interactionCooldown=7;announce([[role,hidden?'Understood. We will stay behind cover until the escort gives the all-clear.':role.startsWith('LIAISON')?'The hospital convoy is ready. I need the north route confirmed before I call them forward.':'The envoy needs the route protected. Watch the three street approaches; we will keep the medical channel open.',5]]);return true;},
    toggleDoor(){if(director.locked){announce([['ESCORT · RADIO','The envoy is secured. The door stays locked until the street is clear.',5]]);return;}manualOpen=!manualOpen;},
    update(dt,{threat=false,occupants=[]}={}){
      if(dt<=0)return;remaining-=dt;interactionCooldown=Math.max(0,interactionCooldown-dt);hurtCooldown=Math.max(0,hurtCooldown-dt);nearby=occupants.filter(p=>p!==vip&&p!==escort&&p.state!=='down');
      if(vip.state==='down'){line=null;queue=[];}
      else if(remaining<=0){if(queue.length)say(...queue.shift());else if(phase==='briefing'&&brief<BRIEFING.length-1)say(...BRIEFING[++brief]);else line=null;}
      if(threat&&phase!=='evacuating'&&phase!=='secure'&&vip.state!=='down'){
        phase='evacuating';quiet=0;delay=.8;
        vip.state='to-shelter';vip.path=routeIn(vip,VIP_REFUGE);
        if(escort.state!=='down'){escort.state='escort';escort.spot=null;escort.foe=null;escort.path=routeIn(escort,ESCORT_REFUGE);}
        announce([['CAPTAIN REYES','Contact outside! {NAME}, to the safe room. Escort One, go with them.',4],['{ENVOY} · VIP','Keep the evacuation channel open. The convoy is still our priority.',5]]);
      }
      if(phase==='evacuating'){
        move(vip,dt,2.7*pace());delay=Math.max(0,delay-dt);
        // Escort follows the envoy's pace, rather than sprinting away from an injured VIP.
        const ahead=routeDistance(escort)+.8<routeDistance(vip),separation=Math.hypot(vip.x-escort.x,vip.z-escort.z);
        if(delay===0)move(escort,dt,ahead&&separation>1.8?0:Math.min(2.9,2.7*pace()+.25));
        if((vip.state==='down'||(!vip.path.length&&inSafeRoom(vip)))&&(escort.state==='down'||(!escort.path.length&&inSafeRoom(escort)))){
          phase='secure';if(vip.state!=='down')vip.state='shelter';quiet=0;
          announce([[escort.state==='down'?'{ENVOY} · VIP':'ESCORT · RADIO',escort.state==='down'?'I am inside the safe room. Keep that corridor open.':'Envoy secured. I am inside with them. Hold the storefront.',5]]);
        }
      }else if(phase==='secure'){
        vip.speed=escort.speed=0;quiet=threat?0:quiet+dt;
        if(quiet>8&&vip.state!=='down'){
          phase='returning';vip.state='return';vip.path=routeOut(vip,VIP_HOME);
          if(escort.state!=='down'){escort.state='escort';escort.path=routeOut(escort,[-5.55,-6.15]);}
          announce([['CAPTAIN REYES','Street is clear. Bring the envoy back to the table.',4],['{ENVOY} · VIP','We finish the plan. Get me the hospital on the radio.',5]]);
        }
      }else if(phase==='arriving'){
        move(vip,dt,1.3);
        if(!vip.path.length){phase='briefing';vip.state='meeting';vip.yaw=Math.PI;announce(ARRIVAL);brief=0;}
      }else if(phase==='returning'){
        move(vip,dt,1.25*pace());move(escort,dt,1.35);
        if(!vip.path.length&&(escort.state==='down'||!escort.path.length)){
          phase='briefing';vip.state='meeting';vip.yaw=Math.PI;manualOpen=false;brief=2;
          if(escort.state!=='down'){escort.state='route';escort.dist=0;escort.wait=1;}
        }
      }
      let open=holdOpen||phase==='evacuating'||phase==='returning'||(phase==='briefing'&&manualOpen);
      // Never close through a person in the doorway (including the player).
      if(!open&&occupants.some(inDoorway))open=true;
      door=Math.max(0,Math.min(1,door+(open?1:-1)*dt*1.5));
    },
  };
  return director;
}
