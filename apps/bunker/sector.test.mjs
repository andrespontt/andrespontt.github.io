import test from 'node:test';
import assert from 'node:assert/strict';
import {SITES,SECTOR,CITY,CITY_DISTRICTS,CITY_BUILDINGS,surveyPoint,elevation,routeTo} from './sector.js';
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
  for(const x of [-SECTOR.width/2,SECTOR.width/2])for(const z of [-SECTOR.depth/2,SECTOR.depth/2])for(const y of [-2,32]){
   const screenY=tilted?(y*75-z*120)/Math.hypot(120,75):-z;
   assert.ok(Math.abs(x)<span*aspect/2);assert.ok(Math.abs(screenY)<span/2);
  }
 }
});

test('eighteen city districts double the original nine neighborhoods inside the expanded survey',()=>{
 assert.equal(CITY_DISTRICTS.length,18);assert.equal(CITY_BUILDINGS.length,24*18);
 assert.equal(SECTOR.width*SECTOR.metersPerUnit,20000);assert.equal(SECTOR.depth*SECTOR.metersPerUnit,11000);
 for(const d of CITY_DISTRICTS){
  const buildings=CITY_BUILDINGS.filter(b=>b.district===d.id);assert.equal(buildings.length,24);
  for(const b of buildings){assert.ok(b.x-b.width/2>=d.x&&b.x+b.width/2<=d.x+d.width);assert.ok(b.z-b.depth/2>=d.z&&b.z+b.depth/2<=d.z+d.depth);}
  for(const [x,z] of [[d.x,d.z],[d.x+d.width,d.z+d.depth]]){const [px,py]=surveyPoint(x,z);assert.ok(px>=0&&px<=1600&&py>=0&&py<=1280);}
 }
 assert.ok(SITES.city.x>=CITY.x&&SITES.city.x<CITY.x+CITY.districtWidth,'existing operation stays in district 01');
 assert.deepEqual(surveyPoint(SECTOR.centerX,SECTOR.centerZ),[800,640]);
 assert.deepEqual(surveyPoint(SECTOR.centerX-SECTOR.width/2,SECTOR.centerZ-SECTOR.depth/2),[0,0]);
});

test('scale labels match their pixel lengths without CSS clipping',async()=>{
 const {surveyScale}=await import('./sector.js');
 for(const units of [.02,.1,.5,1,5,20,100]){
  const {meters,pixels}=surveyScale(units);assert.ok(pixels<=100);assert.ok(pixels>0);assert.ok(Math.abs(pixels*units-meters)<1e-8);
 }
});


test('all eight settlements have bounded map locations and complete roads', async () => {
  const { SETTLEMENTS } = await import('./protectorate.mjs');
  const { SETTLEMENT_SITES, SECTOR, roadPoint } = await import('./sector.js');
  for (const town of SETTLEMENTS) {
    const p = SETTLEMENT_SITES[town.id];
    assert.ok(p, town.name);
    assert.ok(Math.abs(p.x-SECTOR.centerX)<SECTOR.width/2 && Math.abs(p.z-SECTOR.centerZ)<SECTOR.depth/2);
    assert.deepEqual(roadPoint(p.road,0),[-25,-8]);
    const end=roadPoint(p.road,1);
    assert.ok(Math.hypot(end[0]-p.x,end[1]-p.z)<1e-8);
  }
});


test('river border keeps existing settlements west and enemy city and towns east; routes use bridges',async()=>{
 const {borderX,BRIDGES,ENEMY_TOWNS,ENEMY_BUILDINGS,SETTLEMENT_SITES}=await import('./sector.js');
 assert.equal(BRIDGES.length,3);assert.equal(ENEMY_TOWNS.length,4);assert.equal(ENEMY_BUILDINGS.length,432);
 for(const s of Object.values(SETTLEMENT_SITES))assert.ok(s.x<borderX(s.z)-5);
 for(const b of ENEMY_BUILDINGS)assert.ok(b.x>borderX(b.z)+10);
 for(const s of ENEMY_TOWNS){assert.ok(s.x>borderX(s.z)+10);const route=routeTo(s.id);assert.ok(BRIDGES.some(b=>route.some(p=>p[0]===b.x-10&&p[1]===b.z)&&route.some(p=>p[0]===b.x+10&&p[1]===b.z)));}
});

test('eastern capital reuses the existing city block pattern',async()=>{
 const {CITY_BUILDINGS,ENEMY_BUILDINGS,CITY,ENEMY_CITY}=await import('./sector.js');
 assert.deepEqual(ENEMY_BUILDINGS.map(b=>({...b,x:b.x-ENEMY_CITY.x,z:b.z-ENEMY_CITY.z})).map(b=>({...b,x:+b.x.toFixed(6),z:+b.z.toFixed(6)})),CITY_BUILDINGS.map(b=>({...b,x:+(b.x-CITY.x).toFixed(6),z:+(b.z-CITY.z).toFixed(6)})));
});
