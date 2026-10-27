import test from 'node:test';
import assert from 'node:assert/strict';
import {approachSteps} from './city-exterior.js';
import {moveThroughCity,SOLIDS} from './city-space.js';
import {navigate} from './actor-motion.js';

test('both front flanks and side cordon gaps admit a full-width pedestrian',()=>{
  for(const x of [-2.2,2.2]){
    const p={x,z:19};moveThroughCity(p,0,-3);
    assert.ok(Math.abs(p.z-16)<.001,`front flank ${x} is blocked`);
  }
  for(const side of [-1,1]){
    const p={x:side*16,z:10};moveThroughCity(p,-side*1.5,0);
    assert.ok(Math.abs(p.x-side*14.5)<.001,`side gap ${side} is blocked`);
  }
  const middle={x:0,z:19};moveThroughCity(middle,0,-3);
  assert.ok(middle.z>18.2,'centre remains a solid defensive barrier');
});

test('all forty approach variants reach the shop through collision-safe street routes',()=>{
  const rects=SOLIDS.filter(b=>b[1]<1.7&&b[4]>.25).map(b=>[b[0],b[2],b[3],b[5]]);
  const flanks=new Set();
  for(let id=0;id<40;id++){
    const steps=approachSteps(id),p={x:steps[0][0],z:steps[0][1]};
    if(id%3===2)flanks.add(Math.sign(steps[3][0]));
    for(const [x,z] of steps.slice(1)){
      p.navigation=null;p.navArrived=false;
      for(let frame=0;frame<1600&&!p.navArrived;frame++){
        navigate(p,x,z,.1,.05,{move:moveThroughCity,rects:()=>rects});
        assert.ok(!rects.some(b=>p.x>b[0]&&p.x<b[2]&&p.z>b[1]&&p.z<b[3]),`intruder ${id} crossed geometry`);
        assert.ok(p.z>1.5||Math.abs(p.x)<.75,'approach enters through the shop door, not the rear');
      }
      assert.ok(p.navArrived,`intruder ${id} stalled at ${x},${z} from ${p.x},${p.z}`);
      assert.ok(Math.hypot(p.x-x,p.z-z)<.12,`intruder ${id} missed its opening ${x},${z} at ${p.x},${p.z}`);
    }
  }
  assert.equal(flanks.size,2,'south attackers use both flanks');
});
