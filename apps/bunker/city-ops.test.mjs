import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, applyLive, createOperation, summary } from './city-ops.mjs';

const MINUTE = 60_000, t0 = 1_700_000_000_000;

test('starts quiet, ambushes after a few minutes, and clears waves over time', () => {
  let op = createOperation(t0, 42);
  assert.equal(op.phase, 'quiet');
  op = advance(op, t0 + MINUTE);
  assert.equal(op.phase, 'quiet');
  op = advance(op, t0 + 1.5 * MINUTE);
  assert.equal(op.phase, 'contact'); assert.equal(op.wave, 1); assert.equal(op.active, 25); assert.equal(op.incoming, 20, 'four more groups of five behind the first');
  assert.match(op.log.at(-1).text, /Ambush/);
  op = advance(op, t0 + 60 * MINUTE);
  assert.ok(op.wave >= 2, 'more waves follow');
  assert.ok(op.totalDown >= 25);
});

test('catching up is deterministic and capped at six hours', () => {
  const a = advance(createOperation(t0, 7), t0 + 90 * MINUTE);
  const b = advance(advance(createOperation(t0, 7), t0 + 30 * MINUTE), t0 + 90 * MINUTE);
  assert.deepEqual(a, b);
  const far = advance(createOperation(t0, 7), t0 + 30 * 24 * 60 * MINUTE);
  assert.ok(far.tick <= 6 * 60 * 6 + 1);
});

test('the live scene owns the fight while the drone feed is open', () => {
  let op = advance(createOperation(t0, 3), t0 + 4 * MINUTE);
  const live = applyLive(op, { wave: 1, contact: true, active: 9, down: 3, vip: 'sheltering' }, t0 + 4 * MINUTE);
  assert.equal(live.active, 9); assert.equal(live.down, 3);
  // Off-screen ticks don't touch it for the next 15 s.
  assert.equal(advance(live, t0 + 4 * MINUTE + 10_000).active, 9);
  assert.match(summary(live, t0 + 4 * MINUTE), /CONTACT · wave 1 · group \d\/5 · 9 active/);
});

test('log stays bounded', () => {
  const op = advance(createOperation(t0, 11), t0 + 6 * 60 * MINUTE);
  assert.ok(op.log.length <= 30);
});

test('the command: 500 personnel, supplies run down, fights cost ammunition and med kits', () => {
  let op = createOperation(t0, 21);
  assert.equal(op.forces.total, 500); assert.equal(op.forces.deployed, 5); assert.equal(op.forces.atOutpost, 495);
  const start = structuredClone(op.supplies);
  op = advance(op, t0 + 6 * 60 * MINUTE);
  assert.ok(op.supplies.rations < start.rations && op.supplies.fuel < start.fuel);
  assert.ok(op.supplies.rifleAmmo < start.rifleAmmo, 'ammunition spent in contact');
  assert.equal(op.forces.wounded, op.soldiersWounded);
  assert.equal(op.forces.atOutpost, 495 - op.forces.wounded - op.forces.killed, 'each casualty is replaced from the outpost');
  assert.equal(op.forces.total, 500 - op.forces.killed);
});

test('the drone feed charges rounds it fired, once', () => {
  let op = advance(createOperation(t0, 3), t0 + 2 * MINUTE);
  const ammo = op.supplies.rifleAmmo;
  op = applyLive(op, { wave: 1, contact: true, active: 10, down: 2, vip: 'sheltering', rounds: 40, wounded: 0 }, t0 + 2 * MINUTE);
  op = applyLive(op, { wave: 1, contact: true, active: 9, down: 3, vip: 'sheltering', rounds: 70, wounded: 1 }, t0 + 2 * MINUTE + 2000);
  assert.equal(op.supplies.rifleAmmo, ammo - 70);
  assert.equal(op.forces.wounded, 1);
});

test('saves from before the command existed get it added', () => {
  const old = createOperation(t0, 1); delete old.forces; delete old.supplies;
  assert.equal(advance(old, t0 + MINUTE).forces.total, 500);
});

test('final live kills are saved once and active count clears',()=>{
 let op=advance(createOperation(t0,3),t0+2*MINUTE);
 const before=op.totalDown,oldDown=op.down;
 op=applyLive(op,{wave:op.wave,contact:false,active:0,down:12,vip:'safe',session:'a'},t0+2*MINUTE);
 assert.equal(op.active,0);assert.equal(op.down,12);assert.equal(op.totalDown,before+12-oldDown);assert.equal(op.phase,'lull');
 const repeated=applyLive(op,{wave:op.wave,contact:false,active:0,down:12,vip:'safe',session:'a'},t0+2*MINUTE+2000);
 assert.equal(repeated.totalDown,op.totalDown);assert.equal(repeated.phaseEnds,op.phaseEnds);
});
test('new sessions count their ammunition and wounds from zero',()=>{
 let op=createOperation(t0,1);const ammo=op.supplies.rifleAmmo;
 const report={wave:1,contact:true,active:10,down:2,vip:'sheltering'};
 op=applyLive(op,{...report,session:'a',rounds:30,wounded:2},t0);
 op=applyLive(op,{...report,session:'b',rounds:4,wounded:1},t0+2000);
 assert.equal(op.supplies.rifleAmmo,ammo-34);assert.equal(op.forces.wounded,3);
});
test('stale wave cannot roll a live operation back',()=>{
 let op=createOperation(t0,1);op.wave=3;op.phase='contact';op.active=7;
 assert.deepEqual(applyLive(op,{wave:1,contact:false,active:0,down:12},t0),op);
});
test('quiet heartbeats preserve scheduled attack time',()=>{
 let op=createOperation(t0,1),due=op.phaseEnds;
 for(let t=0;t<80000;t+=2000)op=applyLive(op,{session:'a',wave:0,contact:false,active:0,down:0,vip:'safe'},t0+t);
 assert.equal(op.phase,'quiet');assert.equal(op.phaseEnds,due);assert.equal(op.wave,0);
});

test('same session renewing an expired lease does not charge old counters twice',()=>{
 let op=createOperation(t0,1);const ammo=op.supplies.rifleAmmo;
 const live={session:'same',wave:1,contact:true,active:10,down:2,vip:'sheltering',rounds:40,wounded:1};
 op=applyLive(op,live,t0);op=applyLive(op,live,t0+20000);
 assert.equal(op.supplies.rifleAmmo,ammo-40);assert.equal(op.forces.wounded,1);
 op=applyLive(op,{...live,rounds:45,wounded:2},t0+22000);
 assert.equal(op.supplies.rifleAmmo,ammo-45);assert.equal(op.forces.wounded,2);
});

test('the live feed reports killed soldiers and a killed VIP, and the VIP stays dead', () => {
  let op = advance(createOperation(t0, 3), t0 + 2 * MINUTE);
  op = applyLive(op, { session: 'a', wave: 1, contact: true, active: 8, down: 4, vip: 'sheltering', rounds: 0, wounded: 1, killed: 2 }, t0 + 2 * MINUTE);
  assert.equal(op.forces.killed, 2); assert.equal(op.forces.wounded, 1); assert.equal(op.forces.total, 498);
  op = applyLive(op, { session: 'a', wave: 1, contact: true, active: 6, down: 6, vip: 'killed', rounds: 0, wounded: 1, killed: 2 }, t0 + 2 * MINUTE + 2000);
  assert.equal(op.vip, 'killed'); assert.equal(op.forces.killed, 2, 'repeat reports are not counted twice');
  op = applyLive(op, { session: 'a', wave: 1, contact: false, active: 0, down: 12, vip: 'safe', rounds: 0, wounded: 1, killed: 2 }, t0 + 2 * MINUTE + 4000);
  assert.equal(op.vip, 'killed');
  assert.ok(op.log.some(e => /VIP has been killed/.test(e.text)));
});

test('a wave comes as five groups in a row, each once the last is nearly stopped', () => {
  let op = advance(createOperation(t0, 5), t0 + 1.5 * MINUTE);
  assert.equal(op.group, 1);
  const groups = new Set([1]);
  for (let t = 1.5 * MINUTE; op.wave === 1 && op.phase === 'contact'; t += 10_000) {
    op = advance(op, t0 + t);
    groups.add(op.group);
    assert.ok(op.active - op.incoming >= 0);
  }
  assert.deepEqual([...groups], [1, 2, 3, 4, 5]);
  assert.equal(op.incoming, 0); assert.ok(op.log.some(e => /Group 5 of 5/.test(e.text)));
});

test('a killed envoy is replaced a minute after the wave ends, and old reports cannot kill the new one', () => {
  let op = advance(createOperation(t0, 3), t0 + 2 * MINUTE);
  op = applyLive(op, { session: 'a', wave: 1, contact: true, active: 6, down: 6, vip: 'killed', envoy: 1 }, t0 + 2 * MINUTE);
  op = applyLive(op, { session: 'a', wave: 1, contact: false, active: 0, down: 12, vip: 'killed', envoy: 1 }, t0 + 3 * MINUTE);
  assert.equal(op.vip, 'killed');
  op = applyLive(op, { session: 'a', wave: 1, contact: false, active: 0, down: 12, vip: 'killed', envoy: 1 }, t0 + 4 * MINUTE + 1000);
  assert.equal(op.vip, 'safe'); assert.equal(op.envoy, 2);
  assert.ok(op.log.some(e => /Envoy Okafor arrives/.test(e.text)));
  op = applyLive(op, { session: 'a', wave: 1, contact: false, active: 0, down: 12, vip: 'killed', envoy: 1 }, t0 + 4 * MINUTE + 3000);
  assert.equal(op.vip, 'safe', 'a late report about the old envoy is ignored');
  // Off-screen, a save that already lost its envoy gets one back between waves.
  const old = { ...createOperation(t0, 1), phase: 'lull', wave: 2, vip: 'killed', phaseEnds: t0 + 10 * MINUTE };
  const later = advance(old, t0 + 2 * MINUTE);
  assert.equal(later.vip, 'safe'); assert.equal(later.envoy, 2);
});
