import test from 'node:test';
import assert from 'node:assert/strict';
import { SITES } from './sector.js?v=room2';
import { createTrade, setRoute, advance, truckAt, runTime, canDepart, timers, EAT_EVERY, PRODUCE_EVERY, dispatchRescue, rescueStatus, newEvacuation, schedule, recruitSoldier, squadStatus, RECRUIT } from './trade.mjs';
import {routeTo} from './sector.js?v=room2';

test('the outpost makes cells while fed and eats food over time', () => {
  const s = advance(createTrade(0), 60_000);
  assert.equal(s.cells, 6 + 60_000 / PRODUCE_EVERY);
  assert.equal(s.food, 8 - 60_000 / EAT_EVERY);
});

test('with no food the generator stops making cells', () => {
  const s = advance({ ...createTrade(0), food: 0 }, 120_000);
  assert.equal(s.cells, 6);
  assert.equal(timers(s).cell, null);
});

test('trucks stay parked until they are given a route', () => {
  const s = advance(createTrade(0), 300_000);
  assert.ok(s.trucks.every(t => !t.run && !t.route));
  assert.match(truckAt(s.trucks[0], 300_000).status, /no route/);
});

test('a market route drives out, trades, brings food home and goes straight back out', () => {
  let s = setRoute(createTrade(0), 1, 'market', 0);
  assert.equal(s.trucks[0].run, 'market', 'an idle truck leaves at once');
  assert.equal(s.cells, 2, 'four cells loaded');
  const out = truckAt(s.trucks[0], runTime('market') * .25);
  assert.match(out.status, /To Kestrel Falls/);
  assert.ok(out.x > SITES.shelter.x, 'on the road, away from the outpost');
  assert.match(advance(s, runTime('market') * .6).log.at(-1).text, /traded for 6/);
  s = advance(s, runTime('market') + 1000);
  assert.ok(s.log.some(l => /back: \+6/.test(l.text)));
  assert.equal(s.trucks[0].run, 'market', 'back out on its route without being asked');
  assert.equal(s.trucks[0].departedAt, runTime('market'), 'leaves the moment it gets home');
});

test('a standing route keeps the outpost fed for hours with nobody touching it', () => {
  let s = setRoute(createTrade(0), 1, 'market', 0);
  s = setRoute(s, 2, 'loop', 0);
  s = advance(s, 2 * 60 * 60_000);
  assert.ok(s.food > 0, `still fed after two hours (food ${s.food})`);
  assert.ok(s.delivered > 100, `delivered ${s.delivered} food`);
});

test('the two-stop route salvages at Relay 03, then trades at Kestrel Falls without passing the bunker', () => {
  let s = setRoute(createTrade(0), 1, 'loop', 0);
  const total = runTime('loop'), shelter = [SITES.shelter.x, SITES.shelter.z];
  let near = 0;
  for (let t = total * .3; t < total * .6; t += 500) { const p = truckAt(s.trucks[0], t); if (Math.hypot(p.x - shelter[0], p.z - shelter[1]) < 4) near++; }
  assert.equal(near, 0);
  s = advance(s, total + 1000);
  const texts = s.log.map(l => l.text).join('\n');
  assert.match(texts, /Relay 03: salvaged 3/);
  assert.match(texts, /Kestrel Falls: traded for 9/, '4 loaded + 3 salvaged = 3 pairs → 9 food');
});

test('a market route waits at the outpost until there are cells to sell', () => {
  let s = setRoute({ ...createTrade(0), cells: 1 }, 1, 'market', 0);
  assert.equal(s.trucks[0].run, null);
  assert.match(truckAt(s.trucks[0], 0).status, /Waiting/);
  assert.equal(canDepart({ ...createTrade(0), cells: 1 }, 'loop'), true);
  s = advance(s, PRODUCE_EVERY + 1000);
  assert.equal(s.trucks[0].run, 'market', 'leaves once the second cell is made');
});

test('turning a route off parks the truck after its trip', () => {
  let s = setRoute(createTrade(0), 1, 'salvage', 0);
  s = setRoute(s, 1, null, 1000);
  assert.equal(s.trucks[0].run, 'salvage', 'finishes the trip under way');
  s = advance(s, runTime('salvage') + 2000);
  assert.equal(s.trucks[0].run, null);
  assert.equal(s.cells >= 9, true, 'salvage unloaded');
});

test('rescue reserves supplies once and counts people only after they reach the bunker',()=>{
  let s=dispatchRescue(createTrade(0),0);
  assert.equal(s.cells,4);assert.equal(s.food,4);assert.equal(s.trucks[0].run,'rescue');
  assert.deepEqual(dispatchRescue(s,0),s,'double tap cannot reserve another group');
  s=advance(s,runTime('rescue')*.65);
  assert.equal(s.evacuation.rescued,0);assert.equal(s.trucks[0].cargo.passengers,6);
  s=advance(s,runTime('rescue')+1000);
  assert.equal(s.evacuation.rescued,6);assert.equal(s.evacuation.stage,1);
});

test('queued rescue finishes the current job and resumes the standing route afterward',()=>{
  let s={...createTrade(0),cells:24,food:30};
  s=setRoute(s,1,'market',0);s=setRoute(s,2,'salvage',0);
  s=dispatchRescue(s,1000);const id=rescueStatus(s).busy,t=s.trucks.find(t=>t.id===id),route=t.route;
  assert.ok(t.rescue);assert.notEqual(t.run,'rescue');
  s=advance(s,runTime(t.run)+runTime('rescue')+2500);
  assert.equal(s.evacuation.rescued,6);assert.equal(s.trucks.find(t=>t.id===id).route,route);
  assert.equal(s.trucks.find(t=>t.id===id).run,route);
});

test('a fresh player can complete all three rescue groups with the two-resource economy',()=>{
  let s=createTrade(0);
  s=setRoute(s,1,'market',0);s=setRoute(s,2,'loop',0);
  for(let now=1000;now<=10*60_000&&s.evacuation.finishedAt==null;now+=1000){
    s=advance(s,now);const request=rescueStatus(s).request;
    if(request)s=setRoute(s,1,s.food>=request.food+2&&s.cells<request.cells?'salvage':'market',now);
    if(rescueStatus(s).ready)s=dispatchRescue(s,now);
  }
  assert.equal(s.evacuation.rescued,24);assert.equal(s.evacuation.stage,3);
  assert.ok(s.evacuation.finishedAt<10*60_000);assert.ok(s.food>0);
  const restored=advance(JSON.parse(JSON.stringify(s)),s.at);
  assert.equal(restored.evacuation.rescued,24);
  const next=newEvacuation(restored,s.at);
  assert.equal(next.evacuation.rescued,0);assert.equal(next.cells,s.cells);assert.equal(next.food,s.food);
  assert.deepEqual(next.trucks,s.trucks);
});

test('an empty outpost recovers with Both without requiring a reset or free supplies',()=>{
  let s={...createTrade(0),food:0,cells:0};s=setRoute(s,1,'loop',0);
  s=advance(s,runTime('loop')+2000);assert.ok(s.food>0);assert.ok(s.delivered>=3);
});

test('combined truck routes use existing road edges rather than cutting across terrain',()=>{
  const roads=['city','relay'].flatMap(id=>{const p=routeTo(id);return p.slice(1).map((point,i)=>[p[i],point]);});
  for(const part of schedule('loop').filter(p=>p.path))for(let i=1;i<part.path.length;i++){
    const a=part.path[i-1],b=part.path[i];if(JSON.stringify(a)===JSON.stringify(b))continue;
    assert.ok(roads.some(([c,d])=>JSON.stringify([a,b])===JSON.stringify([c,d])||JSON.stringify([a,b])===JSON.stringify([d,c])));
  }
});

test('offline cap suspends truck clocks with production instead of replaying old trips rapidly',()=>{
  let s=setRoute(createTrade(0),1,'loop',0);
  const twoHours=advance(s,2*60*60_000),twoDays=advance(s,48*60*60_000);
  assert.equal(twoDays.delivered,twoHours.delivered);assert.equal(twoDays.food,twoHours.food);assert.equal(twoDays.cells,twoHours.cells);
});

test('recruiting reserves resources once, trains over time and survives a save',()=>{
  const start=createTrade(0),s=recruitSoldier(start,0);
  assert.equal(start.cells,6,'does not mutate the input');
  assert.equal(s.cells,6-RECRUIT.cells);assert.equal(s.food,8-RECRUIT.food);
  assert.deepEqual(recruitSoldier(s,0),s,'double tap does not charge twice');
  const halfway=advance(s,15_000);assert.equal(squadStatus(halfway).remaining,15);
  assert.equal(halfway.squad.soldiers,2);
  const done=advance(JSON.parse(JSON.stringify(halfway)),30_000);
  assert.equal(done.squad.soldiers,3);assert.equal(done.squad.training,null);
  assert.match(done.log.at(-1).text,/Soldier ready/);
});

test('recruitment rejects missing supplies and a full squad without spending anything',()=>{
  for(const change of [{cells:1},{food:2},{squad:{soldiers:RECRUIT.capacity,training:null}}]){
    const s={...createTrade(0),...change};
    assert.deepEqual(recruitSoldier(s,0),s);assert.equal(squadStatus(s).ready,false);
  }
});

test('training pauses without food and resumes without a second payment',()=>{
  let s=recruitSoldier({...createTrade(0),food:3},0);
  s=advance(s,60_000);assert.equal(squadStatus(s).remaining,30);assert.equal(s.squad.soldiers,2);
  s.food=4;s=advance(s,90_000);
  assert.equal(s.squad.soldiers,3);assert.equal(s.squad.training,null);
});

test('additional convoy soldiers increase actual salvage deliveries',()=>{
  const base=createTrade(0);base.squad.soldiers=6;
  let s=setRoute(base,1,'salvage',0);
  s=setRoute(s,1,null,1); // Park after the first trip so the delivery can be measured.
  const end=Math.ceil(runTime('salvage')/1000)*1000;
  const baseline=advance(base,end);s=advance(s,end);
  assert.equal(s.cells-baseline.cells,5,'three base cells plus two from the squad');
  assert.equal(squadStatus(s).bonus,2);
});

test('older saves gain the starting squad without losing routes or supplies',()=>{
  const old=setRoute(createTrade(0),1,'loop',0);delete old.squad;
  const migrated=advance(old,0);
  assert.equal(migrated.squad.soldiers,2);assert.equal(migrated.cells,old.cells);
  assert.deepEqual(migrated.trucks,old.trucks);assert.deepEqual(migrated.evacuation,old.evacuation);
});
