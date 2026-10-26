import test from 'node:test';
import assert from 'node:assert/strict';
import {SITES,elevation,routeTo} from './sector.js';
test('mountain bunker overlooks nearby valley city on the same survey',()=>{
 const a=SITES.shelter,b=SITES.city;
 assert.ok(elevation(a.x,a.z)>elevation(b.x,b.z)+8);
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)*50<4000);
 assert.ok(b.x>a.x&&b.z>a.z);
 const route=routeTo('city');assert.deepEqual(route[0],[a.x,a.z]);assert.deepEqual(route.at(-1),[b.x,b.z]);
 assert.ok(route.every(([x,z])=>Math.abs(x)<=60&&Math.abs(z)<=45));
});

test('fit span contains terrain corners in portrait, square and landscape',async()=>{
 const {surveySpan}=await import('./sector.js');
 for(const aspect of [.46,1,1.8])for(const tilted of [false,true]){
  const span=surveySpan(aspect,tilted);
  for(const x of [-60,60])for(const z of [-45,45])for(const y of [-2,32]){
   const screenY=tilted?(y*75-z*120)/Math.hypot(120,75):-z;
   assert.ok(Math.abs(x)<span*aspect/2);assert.ok(Math.abs(screenY)<span/2);
  }
 }
});

test('scale labels match their pixel lengths without CSS clipping',async()=>{
 const {surveyScale}=await import('./sector.js');
 for(const units of [.02,.1,.5,1,5,20,100]){
  const {meters,pixels}=surveyScale(units);assert.ok(pixels<=100);assert.ok(pixels>0);assert.ok(Math.abs(pixels*units-meters)<1e-8);
 }
});
