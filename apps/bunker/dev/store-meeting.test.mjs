import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeetingDirector} from './store-meeting.js';
import {safeDoorBounds,VIP_HOME,VIP_REFUGE,INTERIOR_BLOCKS,SAFE_APPROACH,SAFE_WALL,SAFE_ROOM,STORE_FURNITURE,inSafeRoom} from './store-layout.js';
import {SOLIDS,firstObstruction,moveThroughCity} from './city-space.js';
import {plan} from './city-paths.js';

const setup=()=>{
  const vip={x:VIP_HOME[0],z:VIP_HOME[1],state:'meeting',path:[],speed:0};
  const escort={x:-5.55,z:-6.15,state:'route',path:[],speed:0};
  const guards=[escort,...Array.from({length:4},(_,i)=>({x:2+i,z:.6,state:'engage',path:[]}))];
  return {vip,escort,guards,director:createMeetingDirector(vip,escort)};
};
test('VIP and exactly one escort reach refuge; remaining guards keep their posts',()=>{
  const {vip,escort,guards,director}=setup(),others=structuredClone(guards.slice(1));
  for(let i=0;i<300;i++){
    director.update(.05,{threat:true,occupants:[vip,...guards]});
    for(const a of [vip,escort])assert.ok(!SOLIDS.some(b=>b[1]<1.7&&b[4]>.25&&a.x>b[0]&&a.x<b[3]&&a.z>b[2]&&a.z<b[5]),'actor must not walk through furniture or walls');
  }
  assert.equal(director.phase,'secure');assert.equal(director.door,0);
  assert.ok(Math.hypot(vip.x-VIP_REFUGE[0],vip.z-VIP_REFUGE[1])<.1);
  assert.equal(guards.filter(director.isEscort).length,1);
  assert.deepEqual(guards.slice(1),others);
  director.toggleDoor();assert.equal(director.locked,true);
});
test('meeting pauses with game time, alarm interrupts dialogue, and VIP waits for all-clear',()=>{
  const {vip,guards,director}=setup(),first=director.dialogue;
  director.update(0,{threat:true});assert.deepEqual(director.dialogue,first);assert.equal(director.phase,'briefing');
  director.update(.05,{threat:true});assert.match(director.dialogue.text,/safe room/);
  for(let i=0;i<400;i++)director.update(.05,{threat:true,occupants:[vip,...guards]});
  assert.equal(vip.state,'shelter');
  for(let i=0;i<500;i++)director.update(.05,{threat:false,occupants:[vip,...guards]});
  assert.equal(vip.state,'meeting');assert.equal(director.phase,'briefing');assert.equal(director.door,0);
});
test('door blocks walking and bullets when closed and clears the same opening when open',()=>{
  for(const [fraction,pass] of [[0,false],[1,true]]){
    const solids=[...SOLIDS,safeDoorBounds(fraction)];
    const p={x:3.6,z:-2.7};moveThroughCity(p,0,-2,solids);
    assert.equal(p.z<-4,pass);
    const hit=firstObstruction({x:3.6,y:1.4,z:-2.7},{x:0,y:0,z:-1},2,solids);
    assert.equal(hit===2,pass);
  }
});
test('door waits for an occupant instead of closing through them',()=>{
  const {director}=setup();director.toggleDoor();director.update(1);assert.equal(director.door,1);
  director.toggleDoor();director.update(1,{occupants:[{x:3.6,z:-3.4}]});assert.equal(director.door,1);
  director.update(1,{occupants:[]});assert.equal(director.door,0);
});
test('escort evacuation paths avoid the new meeting table and chairs',()=>{
  for(const from of [[-5.55,-.9],[-.22,-.9],[-5.55,-6.15],[-5.55,-4.8],[-.22,-3.35],[1.6,-.9],[4.75,-2.5],VIP_HOME]){
    const path=plan(from,SAFE_APPROACH,INTERIOR_BLOCKS,.28);assert.ok(path.length);
    let prev=from;
    for(const point of path){
      for(let i=1;i<=100;i++){
        const x=prev[0]+(point[0]-prev[0])*i/100,z=prev[1]+(point[1]-prev[1])*i/100;
        assert.ok(!SOLIDS.some(b=>b[1]<1.7&&b[4]>.25&&x>b[0]-.25&&x<b[3]+.25&&z>b[2]-.25&&z<b[5]+.25));
      }
      prev=point;
    }
  }
});
test('the safe room is a square, larger than the old 13.4 x 2.65 m strip, with its furniture inside',()=>{
  const w=SAFE_ROOM.x1-SAFE_ROOM.x0,d=SAFE_ROOM.z1-SAFE_ROOM.z0;
  assert.ok(Math.abs(w-d)<.01,'square');assert.ok(w*d>13.4*2.65);
  const inside=b=>b[0]>=SAFE_ROOM.x0&&b[3]<=SAFE_ROOM.x1&&b[2]>=SAFE_ROOM.z0&&b[5]<=SAFE_ROOM.z1;
  const overlaps=(a,b)=>a[0]<b[3]&&a[3]>b[0]&&a[2]<b[5]&&a[5]>b[2]&&a[1]<b[4]&&a[4]>b[1];
  for(const f of STORE_FURNITURE)for(const wall of SAFE_WALL)assert.ok(!overlaps(f,wall),'furniture clear of the safe-room walls');
  assert.ok(inSafeRoom({x:VIP_REFUGE[0],z:VIP_REFUGE[1]}));assert.ok(!inSafeRoom({x:VIP_HOME[0],z:VIP_HOME[1]}));
  assert.equal(STORE_FURNITURE.filter(inside).length,3,'radio, bench and supplies are inside');
});

test('a replacement envoy walks to the table under their own name and restarts the meeting',()=>{
  const {vip,escort,director}=setup();
  Object.assign(vip,{name:'Okafor',x:0,z:2.7});
  director.arrive([[0,-.7],...plan([0,-.7],VIP_HOME,INTERIOR_BLOCKS,.28)]);
  assert.equal(director.phase,'arriving');assert.equal(director.isEscort(escort),false);
  for(let i=0;i<400&&director.phase==='arriving';i++)director.update(.05);
  assert.equal(director.phase,'briefing');assert.equal(vip.state,'meeting');
  assert.ok(Math.hypot(vip.x-VIP_HOME[0],vip.z-VIP_HOME[1])<.05);
  assert.equal(director.dialogue.speaker,'ENVOY OKAFOR · VIP');
});
test('a wounded envoy is slower on the way to the safe room',()=>{
  const time=hp=>{const {vip,escort,director}=setup();vip.hp=hp;let t=0;
    while(director.phase==='briefing'||director.phase==='evacuating'){director.update(.05,{threat:true,occupants:[vip,escort]});t+=.05;if(t>60)break;}
    return t;};
  assert.ok(time(20)>time(100)*1.2);
});
test('test switch: the safe-room door stays open even while the envoy is locked in',()=>{
  const {vip,escort,director}=setup();
  director.holdOpen=true;
  for(let i=0;i<400;i++)director.update(.05,{threat:true,occupants:[vip,escort]});
  assert.equal(director.phase,'secure');assert.equal(director.door,1);
  director.holdOpen=false;for(let i=0;i<40;i++)director.update(.05,{threat:true,occupants:[]});
  assert.equal(director.door,0);
});

test('blocked VIP does not walk through people or falsely declare the refuge secure',()=>{
  const {vip,escort}=setup(),director=createMeetingDirector(vip,escort,{moveBody(){}});
  for(let i=0;i<600;i++)director.update(.05,{threat:true});
  assert.equal(director.phase,'evacuating');assert.equal(vip.speed,0);
  assert.equal(inSafeRoom(vip),false);
});

test('wounded VIP keeps the escort nearby along the evacuation route',()=>{
  const {vip,escort,director}=setup();vip.hp=15;
  for(let i=0;i<1000&&director.phase!=='secure';i++){
    director.update(.05,{threat:true,occupants:[vip,escort]});
    if(vip.z>-3.2&&escort.x>0)assert.ok(Math.hypot(escort.x-vip.x,escort.z-vip.z)<3,'escort must not abandon the envoy at the door');
  }
  assert.equal(director.phase,'secure');
});

test('civilian conversations are contextual and cannot restart every tap',()=>{
  const {director}=setup();assert.equal(director.civilian('LIAISON MORGAN',false),true);
  assert.match(director.dialogue.text,/hospital convoy/);
  assert.equal(director.civilian('CAPTAIN REYES',true),false);
  for(let i=0;i<145;i++)director.update(.05);
  assert.equal(director.civilian('CAPTAIN REYES',true),true);assert.match(director.dialogue.text,/behind cover/);
});
