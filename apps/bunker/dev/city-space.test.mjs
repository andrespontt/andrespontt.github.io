import test from 'node:test';
import assert from 'node:assert/strict';
import { firstObstruction, sphereEntry, moveThroughCity } from './city-space.js';

test('store entrance and broken windows admit shots, but the sill and roof stop them',()=>{
  assert.equal(firstObstruction({x:0,y:1.5,z:3},{x:0,y:0,z:-1},4),4);
  assert.equal(firstObstruction({x:-4,y:1.5,z:3},{x:0,y:0,z:-1},2),2);
  assert.equal(firstObstruction({x:-4,y:.5,z:3},{x:0,y:0,z:-1},4),1.5);
  assert.equal(firstObstruction({x:-4,y:1.1,z:3},{x:0,y:0,z:-1},4),1.5);
  assert.equal(firstObstruction({x:-4,y:2.7,z:3},{x:0,y:0,z:-1},4),1.5);
  assert.equal(firstObstruction({x:-5.5,y:1.7,z:3},{x:0,y:0,z:-1},4),1.5);
  assert.ok(Math.abs(firstObstruction({x:0,y:10,z:0},{x:0,y:-1,z:0},20)-1.9)<1e-6);
});
test('slab intersections handle parallel rays and return the nearest surface',()=>{
  const boxes=[[2,0,0,3,2,2],[5,0,0,6,2,2]];
  assert.equal(firstObstruction({x:0,y:1,z:1},{x:1,y:0,z:0},20,boxes),2);
  assert.equal(firstObstruction({x:0,y:3,z:1},{x:1,y:0,z:0},20,boxes),20);
  assert.equal(firstObstruction({x:2.5,y:1,z:1},{x:1,y:0,z:0},20,boxes),0);
});
test('walking respects walls even with large steps but permits the front door',()=>{
  const door={x:0,z:3};moveThroughCity(door,0,-5);assert.ok(Math.abs(door.z+2)<1e-6);
  const wall={x:2,z:3};moveThroughCity(wall,0,-5);assert.ok(wall.z>=1.76&&wall.z<1.9);
  const side={x:6,z:-5};moveThroughCity(side,5,0);assert.ok(side.x<6.45);
});
test('walking slides along a wall instead of freezing both axes',()=>{
  const p={x:2,z:1.8};moveThroughCity(p,1,-1);assert.ok(p.x>2.9);assert.ok(p.z>=1.76);
});
test('sphere hit distance is at the surface and excludes targets behind the shooter',()=>{
  const o={x:0,y:0,z:0},d={x:0,y:0,z:1};
  assert.equal(sphereEntry(o,d,{x:0,y:0,z:5},1),4);
  assert.equal(sphereEntry(o,d,{x:0,y:0,z:-5},1),Infinity);
  assert.equal(sphereEntry(o,d,{x:2,y:0,z:5},1),Infinity);
});
