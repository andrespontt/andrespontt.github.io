import test from 'node:test';
import assert from 'node:assert/strict';
import {followRoute,navigate,friendlyInLine} from './actor-motion.js';
import {moveThroughCity,SOLIDS} from './city-space.js';
import {plan} from './city-paths.js';
import {INTERIOR_BLOCKS} from './store-layout.js';

test('empty or physically blocked routes never report arrival or run in place',()=>{
  const a={x:0,z:0,path:[],speed:2};
  assert.equal(followRoute(a,.05,{speed:2,move:()=>{}}),false);assert.equal(a.speed,0);
  a.path=[[3,0]];
  for(let i=0;i<30;i++)assert.equal(followRoute(a,.05,{speed:2,move:()=>{}}),false);
  assert.equal(a.x,0);assert.equal(a.speed,0);assert.ok(a.blockedFor>1);
});
test('both civilians walk to cover and back without intersecting furniture',()=>{
  for(const [home,hide] of [[[-3,-1.4],[-6.15,-9.15]],[[-4.75,-4.1],[-3.95,-9.15]]]){
    const a={x:home[0],z:home[1],yaw:0,speed:0};
    for(const goal of [hide,home]){
      a.path=plan([a.x,a.z],goal,INTERIOR_BLOCKS,.28);let arrived=false;
      for(let i=0;i<1000&&!arrived;i++){
        arrived=followRoute(a,.05,{speed:2.6,move:moveThroughCity});
        assert.ok(!SOLIDS.some(b=>b[1]<1.7&&b[4]>.25&&a.x>b[0]&&a.x<b[3]&&a.z>b[2]&&a.z<b[5]));
      }
      assert.ok(arrived);assert.ok(Math.hypot(a.x-goal[0],a.z-goal[1])<.06);assert.equal(a.speed,0);
    }
  }
});
test('a pedestrian yields to someone in their way, then continues when the gap clears',()=>{
  const a={x:0,z:0,path:[[0,3]]},peer={x:0,z:.7,state:'meeting'};
  for(let i=0;i<40;i++)followRoute(a,.05,{speed:2,move:moveThroughCity,peers:[peer]});
  assert.ok(a.z<.1);peer.x=3;
  let arrived=false;for(let i=0;i<60&&!arrived;i++)arrived=followRoute(a,.05,{speed:2,move:moveThroughCity,peers:[peer]});
  assert.ok(arrived);
});
test('intruder keeps a long detour even when the first leg moves away from the destination',()=>{
  const rects=[[0,-3,4,3]],boxes=rects.map(([a,b,c,d])=>[a,0,b,c,3,d]);
  const a={x:-1,z:0};let queries=0;
  for(let i=0;i<1000&&!a.navArrived;i++)navigate(a,5,0,.1,.05,{move:(p,x,z)=>moveThroughCity(p,x,z,boxes),rects:()=>{queries++;return rects;}});
  assert.ok(a.navArrived);assert.ok(Math.hypot(a.x-5,a.z)<.1);assert.ok(queries<=2,`unnecessary replans: ${queries}`);
});
test('intruder can finish at a corrected endpoint instead of retrying an obstructed goal forever',()=>{
  const rects=[[0,0,2,2]],boxes=[[0,0,0,2,2,2]],a={x:-2,z:1};
  for(let i=0;i<500&&!a.navArrived;i++)navigate(a,1,1,.1,.05,{move:(p,x,z)=>moveThroughCity(p,x,z,boxes),rects:()=>rects});
  assert.ok(a.navArrived);assert.ok(a.x<-.26||a.x>2.26||a.z<-.26||a.z>2.26);
});
test('firing lanes ignore friendlies behind the target but hold fire for a friendly in front',()=>{
  const shooter={x:0,z:0},target={x:0,z:10};
  assert.equal(friendlyInLine(shooter,target,[shooter,{x:.15,z:3}]),true);
  assert.equal(friendlyInLine(shooter,target,[{x:0,z:11},{x:0,z:-2},{x:1,z:3},{x:0,z:2,state:'down'}]),false);
});

test('intruder retries an unavailable route after the security door opens',()=>{
  let door=true,queries=0;
  const room=[[-3,-3,3,-2.8],[-3,-3,-2.8,3],[2.8,-3,3,3],[-3,2.8,-1,3],[1,2.8,3,3]];
  const rects=()=>[...room,...(door?[[-1,2.8,1,3]]:[])];
  const a={x:0,z:4};
  const options={move:(p,x,z)=>moveThroughCity(p,x,z,rects().map(([a,b,c,d])=>[a,0,b,c,3,d])),rects:()=>{queries++;return rects();}};
  for(let i=0;i<100;i++)navigate(a,0,0,.1,.05,options);
  assert.ok(a.z>3.25);assert.ok(queries<8,'closed door should not cause per-frame graph searches');
  door=false;for(let i=0;i<300&&!a.navArrived;i++)navigate(a,0,0,.1,.05,options);
  assert.ok(a.navArrived);assert.ok(Math.hypot(a.x,a.z)<.1);
});
