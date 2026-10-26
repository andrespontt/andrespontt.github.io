import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeetingDirector} from './store-meeting.js';
import {safeDoorBounds,VIP_HOME,VIP_REFUGE,INTERIOR_BLOCKS} from './store-layout.js';
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
    const p={x:0,z:-6.2};moveThroughCity(p,0,-2,solids);
    assert.equal(p.z<-7.5,pass);
    const hit=firstObstruction({x:0,y:1.4,z:-6.2},{x:0,y:0,z:-1},2,solids);
    assert.equal(hit===2,pass);
  }
});
test('door waits for an occupant instead of closing through them',()=>{
  const {director}=setup();director.toggleDoor();director.update(1);assert.equal(director.door,1);
  director.toggleDoor();director.update(1,{occupants:[{x:0,z:-6.9}]});assert.equal(director.door,1);
  director.update(1,{occupants:[]});assert.equal(director.door,0);
});
test('escort evacuation paths avoid the new meeting table and chairs',()=>{
  for(const from of [[-5.55,-.9],[-.25,-.9],[-5.55,-6.15],[-5.55,-4.8],[-.25,-3.35],VIP_HOME]){
    const path=plan(from,[0,-6.15],INTERIOR_BLOCKS,.28);assert.ok(path.length);
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
