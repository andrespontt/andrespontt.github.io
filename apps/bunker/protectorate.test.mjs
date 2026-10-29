import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, advance, act, reason, military, battle, winChance, settlement, trainable, roadPosition, objective, DAY, STEP, RULES, restoreGame, SETTLEMENTS } from './protectorate.mjs';

const START = RULES.start.soldiers;
// Every soldier ever trained minus every soldier killed must be somewhere: bunker, garrison or road.
function assertAccounted(s) {
  const m = military(s);
  for (const v of [m.availableSoldiers, m.deployedSoldiers, m.soldiersInTransit, m.untrainedRecruits, m.recruitsInTraining]) assert.ok(Number.isInteger(v) && v >= 0, 'counts stay whole and non-negative');
  for (const x of s.settlements) assert.ok(x.assignedSoldiers >= 0 && x.enemyForces >= 0 && x.availableVolunteers >= 0);
  assert.equal(m.totalSoldiers, START + s.stats.trained - s.stats.killed, 'soldiers are never created or lost silently');
  for (const r of Object.values(s.resources)) assert.ok(r >= 0, 'resources never go negative');
}
const run = (s, ms) => advance(s, ms);
const until = (s, done, limit = 40 * DAY) => { for (let t = 0; t < limit && !done(s); t += STEP) s = advance(s, STEP); return s; };
// A game with no attacks, to test the economy in isolation.
const peaceful = seed => { const s = createGame(seed); s.firstAttackDone = true; s.settlements.forEach(x => x.attackChance = 0); return s; };

test('first scenario starts as specified', () => {
  const s = createGame(1), m = military(s);
  assert.equal(m.availableSoldiers, 500); assert.equal(m.deployedSoldiers, 0); assert.equal(m.untrainedRecruits, 0); assert.equal(m.trainingCapacity, 250);
  assert.deepEqual(s.resources, { food: 5000, metal: 2500, components: 1000, fuel: 5000 });
  assert.equal(s.settlements.length, 8);
  assert.equal(new Set(s.settlements.map(x => x.id)).size, 8);
  assert.deepEqual(s.settlements.map(x => x.availableVolunteers), [200,400,600,300,350,400,500,300]);
});

test('assigning leaves the pool at once, arrives after travel, and recall comes home after a delay', () => {
  let s = act(createGame(2), { type: 'assign', id: 'farm', count: 200 });
  assert.equal(s.available, 300); assert.equal(military(s).soldiersInTransit, 200); assert.equal(s.resources.fuel, 4900);
  assertAccounted(s);
  s = run(s, settlement(s, 'farm').travel);
  assert.equal(settlement(s, 'farm').assignedSoldiers, 200); assert.equal(military(s).soldiersInTransit, 0);
  s = act(s, { type: 'recall', id: 'farm', count: 150 });
  assert.equal(settlement(s, 'farm').assignedSoldiers, 50); assert.equal(s.available, 300, 'recalled soldiers are on the road, not home yet');
  s = run(s, settlement(s, 'farm').travel);
  assert.equal(s.available, 450); assertAccounted(s);
});

test('orders that would double-assign or go negative are refused', () => {
  const s = createGame(3);
  assert.ok(reason(s, { type: 'assign', id: 'farm', count: 550 }));
  assert.equal(act(s, { type: 'assign', id: 'farm', count: 550 }), s);
  assert.ok(reason(s, { type: 'recall', id: 'farm', count: 50 }));
  assert.ok(reason(s, { type: 'assign', id: 'farm', count: 0 }));
  assert.ok(reason(s, { type: 'assign', id: 'farm', count: 50.5 }));
  assert.ok(reason(s, { type: 'recruit', id: 'farm', count: 250 }), 'Millbrook has only 4 volunteers');
  assert.ok(reason(s, { type: 'liberate', id: 'mine', count: 150 }), 'not occupied');
  assert.ok(reason(s, { type: 'assign', id: 'works', count: 150 }), 'Ironford wants proof first');
  let t = act(s, { type: 'assign', id: 'farm', count: 300 });
  t = act(t, { type: 'assign', id: 'mine', count: 250 });
  assert.equal(t.available, 200, 'second order refused: only 4 left');
});

test('protected settlements deliver on their own; each delivery lands exactly once', () => {
  let s = peaceful(4);
  const farm = settlement(s, 'farm');
  s = until(s, s => s.convoys.length > 0);
  assert.equal(s.time, DAY / 2, 'first Millbrook truck leaves at noon on day 1');
  assert.equal(s.convoys[0].settlement, 'farm'); assert.equal(s.convoys[0].amount, 1500);
  const food = s.resources.food;
  s = run(s, farm.travel);
  assert.equal(s.resources.food, food + 1500);
  s = run(s, farm.travel - STEP);
  assert.equal(s.resources.food, food + 1500, 'the return leg does not deliver again');
  assert.equal(s.stats.delivered.food, 1500);
  s = run(s, 2 * DAY);
  assert.equal(s.stats.delivered.food, 3000, 'next truck two days later');
  assert.ok(s.stats.delivered.metal >= 20, 'Greyvein delivers metal too');
  assert.equal(s.stats.delivered.components, 0, 'Ironford is not protected yet');
});

test('chopping time differently gives the same game', () => {
  const orders = s => act(act(s, { type: 'assign', id: 'farm', count: 250 }), { type: 'assign', id: 'mine', count: 250 });
  let a = orders(createGame(5)), b = orders(createGame(5));
  a = run(a, 7 * DAY);
  for (let t = 0; t < 7 * DAY; t += 1337) b = run(b, Math.min(1337, 7 * DAY - t));
  assert.deepEqual(a, b);
});

test('recruiting draws on the volunteer pool; training costs equipment and food and finishes once after 3 days', () => {
  let s = peaceful(6);
  s = act(s, { type: 'recruit', id: 'farm', count: 200 });
  assert.equal(settlement(s, 'farm').availableVolunteers, 0); assert.equal(s.recruits, 200);
  s = act(s, { type: 'recruit', id: 'mine', count: 150 });
  assert.equal(s.recruits, 350);
  s = act(s, { type: 'train' });
  assert.equal(military(s).recruitsInTraining, 250, 'capacity 5'); assert.equal(s.recruits, 100);
  assert.equal(s.resources.metal, 2500 - 750); assert.equal(s.resources.components, 1000 - 250);
  assert.ok(reason(s, { type: 'train' }), 'center full');
  const food = s.resources.food;
  s = run(s, STEP);
  assert.equal(s.resources.food, food - 500, 'first training day: 2 food per recruit');
  s = run(s, 3 * DAY - 2 * STEP);
  assert.equal(s.available, 500, 'not done a step early');
  s = run(s, STEP);
  assert.equal(s.available, 750); assert.equal(s.stats.trained, 250); assert.equal(s.training.length, 0);
  s = run(s, DAY);
  assert.equal(s.available, 750, 'never counted twice'); assertAccounted(s);
});

test('training pauses without food and resumes when food arrives', () => {
  let s = peaceful(7);
  s = act(act(s, { type: 'recruit', id: 'farm', count: 200 }), { type: 'train' });
  s.resources.food = 0; s.settlements.forEach(x => x.nextDeliveryTick = null);
  s = run(s, 4 * DAY);
  assert.equal(s.stats.trained, 0); assert.ok(s.training[0].waiting);
  s.resources.food = 5000;
  s = run(s, 3 * DAY);
  assert.equal(s.stats.trained, 200);
});

test('combat: overwhelming numbers usually win, a slightly weaker side sometimes, and losers are not wiped out', () => {
  const s = createGame(8);
  let strongWins = 0, underdogWins = 0, loserSurvivors = 0, winnerLosses = 0;
  for (let i = 0; i < 400; i++) {
    const a = battle(s, 6, 15); if (a.defenderWins) strongWins++;
    assert.ok(a.defendersLost <= 14 && a.attackersLost <= 6);
    const b = battle(s, 10, 7);  // 7 dug in ≈ 8.75 against 10
    if (b.defenderWins) underdogWins++;
    const loser = b.defenderWins ? 10 - b.attackersLost : 7 - b.defendersLost;
    if (loser > 0) loserSurvivors++;
    winnerLosses += b.defenderWins ? b.defendersLost : b.attackersLost;
  }
  assert.ok(strongWins > 390, 'overwhelming defenders hold');
  assert.ok(underdogWins > 60 && underdogWins < 340, 'close fights can go either way');
  assert.ok(loserSurvivors > 300, 'survivors fall back');
  assert.ok(winnerLosses > 0, 'victors take casualties too');
  assert.ok(winChance(15, 6) > .99 && winChance(6, 15) < .01 && Math.abs(winChance(10, 8) - .5) < .05);
});

test('the first raid hits Greyvein on day 5; holding with no garrison loses it and its deliveries stop', () => {
  let s = act(createGame(9), { type: 'assign', id: 'farm', count: 250 });
  s = until(s, s => settlement(s, 'mine').status === 'under_attack');
  const mine = settlement(s, 'mine');
  assert.equal(Math.floor(s.time / DAY) + 1, 5); assert.equal(mine.enemyForces, 450); assert.equal(mine.attack.seen, false);
  s = act(s, { type: 'hold', id: 'mine' });
  s = run(s, RULES.attackWindow);
  assert.equal(settlement(s, 'mine').status, 'occupied');
  assert.equal(s.reports.at(-1).outcome, 'DEFEAT'); assert.equal(s.stats.killed, 0, 'nobody to lose');
  const metal = s.stats.delivered.metal;
  s = run(s, 6 * DAY);
  assert.equal(s.stats.delivered.metal, metal, 'occupied settlements send nothing');
  assert.ok(reason(s, { type: 'recruit', id: 'mine', count: 50 }), 'no recruiting there');
  assertAccounted(s);
});

test('a truck already on the road finishes its trip when its settlement falls', () => {
  let s = createGame(10);
  const mine = settlement(s, 'mine');
  mine.nextDeliveryTick = 4 * DAY - 5000;  // the only truck: leaves 5 s before the day-5 raid
  s = until(s, s => settlement(s, 'mine').status === 'under_attack');
  assert.equal(s.convoys.filter(c => c.settlement === 'mine' && !c.delivered).length, 1);
  s = act(s, { type: 'retreat', id: 'mine' });
  assert.equal(settlement(s, 'mine').status, 'occupied');
  s = run(s, mine.travel);
  assert.equal(s.stats.delivered.metal, 1000, 'the truck on the road still arrives');
  s = run(s, 4 * DAY);
  assert.equal(s.stats.delivered.metal, 1000, 'and no truck after it');
});

test('reinforcements count only if they arrive before the fight', () => {
  let s = act(createGame(11), { type: 'assign', id: 'mine', count: 100 });
  s = until(s, s => settlement(s, 'mine').status === 'under_attack');
  s = act(s, { type: 'assign', id: 'mine', count: 400 });
  assert.equal(settlement(s, 'mine').attack.seen, true);
  s = run(s, RULES.attackWindow - STEP);
  assert.equal(settlement(s, 'mine').assignedSoldiers, 500, 'reinforcements joined before the fight');
  s = run(s, STEP);
  const r = s.reports.at(-1);
  assert.equal(r.friendly, 500); assertAccounted(s);
});

test('retreat gives up the settlement but brings most of the garrison home', () => {
  let s = act(createGame(12), { type: 'assign', id: 'mine', count: 300 });
  s = until(s, s => settlement(s, 'mine').status === 'under_attack');
  s = act(s, { type: 'retreat', id: 'mine' });
  const mine = settlement(s, 'mine'), r = s.reports.at(-1);
  assert.equal(mine.status, 'occupied'); assert.equal(mine.assignedSoldiers, 0); assert.equal(mine.enemyForces, 450);
  assert.equal(r.lost + r.surviving, 300); assert.ok(r.surviving >= 150);
  s = run(s, mine.travel);
  assert.equal(s.available, 200 + r.surviving); assertAccounted(s);
});

test('liberation: success restores protection with the survivors as garrison; failure leaves it occupied', () => {
  const lost = (seed = 13) => { let s = createGame(seed); s = until(s, s => settlement(s, 'mine').status === 'under_attack'); return run(act(s, { type: 'hold', id: 'mine' }), RULES.attackWindow); };
  // Fifteen (ten plus a trained class) against the nine raiders who took it unopposed.
  let wins = 0, s, r, mine;
  for (const seed of [13, 14, 15, 16, 17, 18]) {
    s = lost(seed); s.available += 250; s.stats.trained += 250;
    const enemies = settlement(s, 'mine').enemyForces;
    assert.equal(enemies, 450, 'no garrison: no enemy losses');
    s = act(s, { type: 'liberate', id: 'mine', count: 750 });
    assert.equal(s.available, 0); assert.ok(reason(s, { type: 'assign', id: 'farm', count: 50 }), 'liberation force is committed');
    s = run(s, settlement(s, 'mine').travel);
    r = s.reports.at(-1); mine = settlement(s, 'mine');
    assert.equal(r.type, 'liberation'); assert.equal(r.enemy, enemies); assertAccounted(s);
    if (r.outcome !== 'LIBERATED') continue;
    wins++;
    assert.equal(mine.status, 'protected'); assert.equal(mine.assignedSoldiers, r.surviving); assert.equal(mine.enemyForces, 0);
    assert.ok(mine.nextDeliveryTick > s.time, 'deliveries scheduled for the next cycle');
    const metal = s.stats.delivered.metal;
    s = run(s, mine.deliveryInterval + mine.travel);
    assert.equal(s.stats.delivered.metal, metal + 1000, 'deliveries resume on the next cycle');
    assert.equal(reason(s, { type: 'recruit', id: 'mine', count: 50 }), '');
  }
  assert.ok(wins >= 4, 'fifteen against nine dug in usually wins');
  // Two against the same garrison: hopeless; the survivors come home and it stays occupied.
  s = lost();
  s = run(act(s, { type: 'liberate', id: 'mine', count: 100 }), settlement(s, 'mine').travel);
  r = s.reports.at(-1); mine = settlement(s, 'mine');
  assert.equal(r.outcome, 'FAILED'); assert.equal(mine.status, 'occupied'); assert.ok(mine.enemyForces >= 1);
  assert.ok(reason(s, { type: 'liberate', id: 'mine', count: 50 }) === '', 'another attempt can be launched');
  assertAccounted(s);
});

test('Ironford signs an agreement once the outpost has proven itself', () => {
  let s = peaceful(14);
  assert.ok(reason(s, { type: 'assign', id: 'works', count: 150 }));
  s.proven = true;
  assert.ok(reason(s, { type: 'assign', id: 'works', count: 100 }), 'needs an escort of 3');
  s = act(s, { type: 'assign', id: 'works', count: 150 });
  s = run(s, settlement(s, 'works').travel);
  const works = settlement(s, 'works');
  assert.equal(works.status, 'protected'); assert.equal(works.assignedSoldiers, 150);
  s = run(s, DAY / 2 + works.travel);
  assert.equal(s.stats.delivered.components, 750);
});

test('units move along their road: 0 at the bunker, 1 at the settlement', () => {
  const m = { outbound: true, departAt: 0, arriveAt: 100 }, c = { cargo: 'food', departAt: 0, arriveAt: 100, returnAt: 200 };
  assert.equal(roadPosition(m, 0), 0); assert.equal(roadPosition(m, 50), .5); assert.equal(roadPosition({ ...m, outbound: false }, 100), 0);
  assert.equal(roadPosition(c, 0), 1); assert.equal(roadPosition(c, 100), 0); assert.equal(roadPosition(c, 150), .5);
});

test('soldier totals stay consistent through a long game of random orders', () => {
  for (const seed of [21, 22, 23]) {
    let s = createGame(seed), pick = seed;
    const roll = n => (pick = (pick * 1103515245 + 12345) >>> 0) % n;
    for (let i = 0; i < 1500; i++) {
      const x = s.settlements[roll(s.settlements.length)], count = 50 * (1 + roll(6));
      const order = [{ type: 'assign', id: x.id, count }, { type: 'recall', id: x.id, count }, { type: 'recruit', id: x.id, count }, { type: 'train' }, { type: 'retreat', id: x.id }, { type: 'liberate', id: x.id, count: count + 200 }, { type: 'hold', id: x.id }][roll(7)];
      if (roll(4) === 0) s = act(s, order);
      if (s.reports.length) s = act(s, { type: 'ack', report: s.reports[0].id });
      s = advance(s, 4000);
      assertAccounted(s);
    }
    assert.ok(s.stats.repelled + s.stats.lost > 0, 'attacks happened');
  }
});

test('the whole loop can be played from the first garrison to Ironford', () => {
  let s = createGame(31);
  const step = (ms = DAY / 4) => { s = advance(s, ms); for (const r of s.reports) s = act(s, { type: 'ack', report: r.id }); };
  s = act(s, { type: 'assign', id: 'farm', count: 200 });
  s = act(s, { type: 'assign', id: 'mine', count: 150 });
  step();
  assert.match(objective(s), /supply trucks|Recruit/);
  s = act(s, { type: 'recruit', id: 'farm', count: 200 });
  s = act(s, { type: 'train' });
  for (let i = 0; i < 40 && settlement(s, 'mine').status !== 'under_attack'; i++) step();
  assert.equal(settlement(s, 'mine').status, 'under_attack');
  assert.match(objective(s), /under attack/);
  s = act(s, { type: 'hold', id: 'mine' });
  step(RULES.attackWindow);
  // Like a player would: wait for the trained class, recall a garrison if needed, attack with clear odds.
  for (let attempt = 0; attempt < 5 && settlement(s, 'mine').status === 'occupied'; attempt++) {
    for (let i = 0; i < 40 && (s.training.length || military(s).soldiersInTransit); i++) step();
    if (s.available < settlement(s, 'mine').enemyForces * 1.6) { s = act(s, { type: 'recall', id: 'farm', count: settlement(s, 'farm').assignedSoldiers }); step(); }
    s = act(s, { type: 'liberate', id: 'mine', count: s.available });
    for (let i = 0; i < 4; i++) step();
  }
  assert.ok(s.proven, 'repelled or liberated');
  // Free up an escort for the talks from the biggest garrison.
  const biggest = [...s.settlements].filter(x => x.status === 'protected').sort((a, b) => b.assignedSoldiers - a.assignedSoldiers)[0];
  if (s.available < 150) s = act(s, { type: 'recall', id: biggest.id, count: 150 - s.available });
  for (let i = 0; i < 10 && s.available < 150; i++) step();
  s = act(s, { type: 'assign', id: 'works', count: 150 });
  for (let i = 0; i < 4; i++) step();
  assert.equal(settlement(s, 'works').status, 'protected');
  assertAccounted(s);
});

test('saved games survive a JSON round trip', () => {
  let s = run(act(createGame(41), { type: 'assign', id: 'farm', count: 150 }), DAY);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(run(copy, 3 * DAY), run(s, 3 * DAY));
  assert.ok(trainable(copy) === 0);
});


test('old campaign migration preserves deployments, training, routes and upgrades only once', () => {
  const old = createGame(77); old.version = 1; old.available = 6; old.recruits = 2; old.trainingCapacity = 5;
  old.settlements = old.settlements.slice(0,3);
  for (const x of old.settlements) {
    for (const k of ['population','resourceAmount','recommendedGarrison','availableVolunteers','volunteerCap']) x[k] /= 50;
    x.raid = x.raid.map(n => n / 50);
  }
  old.resources = {food:100,metal:50,components:20,fuel:100};
  old.movements = [{ id: 90, settlement: 'farm', soldiers: 4, outbound: true, departAt: 15000, arriveAt: 27000 }];
  old.training = [{ id:91, count:3, elapsed:500, paidDays:1, waiting:false }];
  old.convoys = [{ id:92, settlement:'mine', amount:20, cargo:'metal', departAt:0, arriveAt:30000, returnAt:50000 }];
  old.stats.trained = 2; old.stats.killed = 1;
  const upgraded = restoreGame(old);
  assert.equal(old.available, 6, 'input untouched');
  assert.equal(upgraded.available, 300); assert.equal(upgraded.movements[0].soldiers,200);
  assert.equal(upgraded.training[0].count,150); assert.equal(upgraded.training[0].elapsed,500);
  assert.equal(upgraded.convoys[0].amount,1000); assert.equal(upgraded.movements[0].arriveAt,27000);
  assert.equal(upgraded.resources.food,5000); assert.equal(upgraded.settlements[0].availableVolunteers,200);
  assert.equal(upgraded.settlements.length,8); assert.equal(upgraded.stats.trained,100);
  assert.deepEqual(restoreGame(upgraded),upgraded);
});

test('all five new towns accept agreements and replenish bulk volunteers; refinery delivers fuel', () => {
  let s = peaceful(80); s.proven = true; s.available = 2000;
  for (const d of SETTLEMENTS.slice(3)) s = act(s,{type:'assign',id:d.id,count:150});
  s = advance(s,30000);
  for (const d of SETTLEMENTS.slice(3)) {
    assert.equal(settlement(s,d.id).status,'protected');
    s = act(s,{type:'recruit',id:d.id,count:d.volunteers});
    assert.equal(settlement(s,d.id).availableVolunteers,0);
  }
  const fuel=s.resources.fuel;
  s=advance(s,2*DAY);
  assert.ok(s.resources.fuel>fuel); assert.ok(Number.isFinite(s.stats.delivered.fuel));
  for(const d of SETTLEMENTS.slice(3)) assert.equal(settlement(s,d.id).availableVolunteers,50);
});


test('bunker recruitment continues with every town occupied, caps and can be enlisted once', () => {
  let s = peaceful(95);
  s.settlements.forEach(x => { x.status='occupied'; x.nextDeliveryTick=null; });
  assert.equal(s.bunkerVolunteers,25);
  s=advance(s,DAY);
  assert.equal(s.bunkerVolunteers,35);
  const order={type:'recruit-bunker',count:35};
  const before=s;
  s=act(s,order);
  assert.equal(before.bunkerVolunteers,35);
  assert.equal(s.bunkerVolunteers,0); assert.equal(s.recruits,35);
  assert.equal(act(s,order),s);
  s=act(s,{type:'train'});
  assert.equal(military(s).recruitsInTraining,35);
  s=advance(s,3*DAY);
  assert.equal(s.stats.trained,35); assert.equal(s.bunkerVolunteers,30);
  s=advance(s,20*DAY); assert.equal(s.bunkerVolunteers,100);
  const saved=JSON.parse(JSON.stringify(s)); delete saved.bunkerVolunteers;
  const restored=restoreGame(saved); assert.equal(restored.bunkerVolunteers,25);
  assert.deepEqual(restoreGame(restored),restored);
});
