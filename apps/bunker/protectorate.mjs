// Protectorate: Outpost 07's strategic loop. Nearby settlements accept the bunker's protection; in return their own
// trucks bring food, metal and components, and their volunteers can be trained as soldiers. Raiders attack
// settlements; a lost settlement stays occupied until a liberation force takes it back.
//
// One plain state object holds everything. It changes only through advance() (game time passes) and act()
// (a player order), both pure: they return a new state and never touch the old one. Random events use a
// seeded generator kept in the state, so the same orders at the same times always play out the same way.
// game.js saves the state and drives the clock; terminal.js and command.js only read it.

export const VERSION = 2;
export const DAY = 60_000;        // one game day = 60 s of real time at 1×
export const STEP = 250;          // simulation step, in game ms
export const SPEEDS = [0, 1, 3];  // pause, normal, fast
const LOG_SIZE = 60, HISTORY_SIZE = 12;

// Balancing constants. Times are game ms unless they say days.
export const RULES = {
  start: { time: DAY / 4, soldiers: 500, trainingCapacity: 250, resources: { food: 5000, metal: 2500, components: 1000, fuel: 5000 } },
  bunkerRecruitment: { initial: 50, batch: 50, everyDays: 3, capacity: 150 },  // drifters who reach the bunker on their own
  trainingDays: 3,
  trainingFood: 2,                         // food per recruit per training day
  equipment: { metal: 3, components: 1 },  // issued per recruit when training starts
  upkeep: .5,                              // food per soldier per day, charged at midnight
  sortieFuel: 100,                           // fuel for each departure from the bunker
  noFuelSlowdown: 1.5,                     // with empty tanks the soldiers march
  deliveryDays: 2,
  volunteerBatch: 50,
  volunteerDays: 2,                        // +50 volunteers this often (every day when confidence ≥ 70)
  attackWindow: 40_000,                    // from the alert to the fight
  firstAttack: { day: 5, settlement: 'mine', enemies: 450 },
  randomAttacksFrom: 7,                    // day
  attackGapDays: 2,                        // between any two attacks
  settlementCooldownDays: 4,               // between two attacks on the same settlement
  defenseBonus: 1.25,                      // whoever holds the settlement fights from cover
  noise: [.8, 1.2],
  retreatLoss: .2,
  occupationGrowthDays: 3, occupationGrowth: 50, occupationCap: 1200,   // occupiers dig in and send for more
  raidGrowth: { everyDays: 8, enemies: 50 },  // random raids grow stronger as the campaign goes on
  agreementEscort: 150,                      // soldiers that go to sign a new agreement and stay as its garrison
};

export const RESOURCES = { food: 'Food', metal: 'Metal', components: 'Components', fuel: 'Fuel' };

// The eight settlements of the first scenario. travel: one-way trip from the bunker (game ms at 1×).
export const SETTLEMENTS = [
  { id: 'farm', name: 'Millbrook', kind: 'Farming village', population: 7500, resourceType: 'food', resourceAmount: 1500, recommendedGarrison: 250, volunteers: 200, volunteerCap: 400, travel: 12_000, attackChance: .10, raid: [150, 350], status: 'protected', firstDelivery: DAY / 2 },
  { id: 'mine', name: 'Greyvein', kind: 'Mining town', population: 20000, resourceType: 'metal', resourceAmount: 1000, recommendedGarrison: 300, volunteers: 400, volunteerCap: 500, travel: 20_000, attackChance: .14, raid: [200, 450], status: 'protected', firstDelivery: DAY },
  { id: 'works', name: 'Ironford', kind: 'Industrial city', population: 45000, resourceType: 'components', resourceAmount: 750, recommendedGarrison: 400, volunteers: 600, volunteerCap: 700, travel: 26_000, attackChance: .12, raid: [300, 550], status: 'neutral', firstDelivery: null },
  { id: 'orchard', name: 'Greenhaven', kind: 'Agricultural town', population: 12000, resourceType: 'food', resourceAmount: 1800, recommendedGarrison: 200, volunteers: 300, volunteerCap: 600, travel: 18000, attackChance: .12, raid: [150, 350], status: 'neutral', firstDelivery: null },
  { id: 'quarry', name: 'Stonebridge', kind: 'Quarry settlement', population: 18000, resourceType: 'metal', resourceAmount: 1200, recommendedGarrison: 250, volunteers: 350, volunteerCap: 650, travel: 22000, attackChance: .12, raid: [200, 400], status: 'neutral', firstDelivery: null },
  { id: 'refinery', name: 'Ember Junction', kind: 'Refinery town', population: 24000, resourceType: 'fuel', resourceAmount: 1000, recommendedGarrison: 300, volunteers: 400, volunteerCap: 750, travel: 30000, attackChance: .12, raid: [250, 450], status: 'neutral', firstDelivery: null },
  { id: 'depot', name: 'Westhaven', kind: 'Logistics hub', population: 32000, resourceType: 'components', resourceAmount: 900, recommendedGarrison: 350, volunteers: 500, volunteerCap: 850, travel: 24000, attackChance: .12, raid: [300, 500], status: 'neutral', firstDelivery: null },
  { id: 'lakeside', name: 'Lakewatch', kind: 'Lakeside township', population: 16000, resourceType: 'food', resourceAmount: 1500, recommendedGarrison: 250, volunteers: 300, volunteerCap: 600, travel: 28000, attackChance: .12, raid: [200, 400], status: 'neutral', firstDelivery: null },
];

// ── Random numbers (mulberry32, state kept in s.seed) ───────────────────────────────────────────────
function random(s) {
  let t = (s.seed = (s.seed + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (s, [a, b]) => a + (b - a) * random(s);
const integer = (s, a, b) => a + Math.floor(random(s) * (b - a + 1));
const roundRandom = (s, x) => Math.floor(x + random(s));   // 2.3 → 2 or 3, 3 with 30 % chance
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const troops = n => plural(n, 'soldier');

// ── State ───────────────────────────────────────────────────────────────────────────────────────────
export function createGame(seed = Math.floor(Math.random() * 2 ** 32)) {
  const s = {
    version: VERSION, seed: seed >>> 0, time: RULES.start.time, carry: 0, speed: 1, nextId: 1,
    resources: { ...RULES.start.resources },
    available: RULES.start.soldiers, bunkerVolunteers: RULES.bunkerRecruitment.initial, recruits: 0, training: [], trainingCapacity: RULES.start.trainingCapacity,
    settlements: SETTLEMENTS.map(d => ({
      id: d.id, name: d.name, kind: d.kind, population: d.population, status: d.status,
      resourceType: d.resourceType, resourceAmount: d.resourceAmount,
      assignedSoldiers: 0, recommendedGarrison: d.recommendedGarrison,
      availableVolunteers: d.volunteers, volunteerCap: d.volunteerCap, volunteerDays: 0,
      confidence: d.status === 'protected' ? 55 : 30, enemyForces: 0,
      deliveryInterval: RULES.deliveryDays * DAY, nextDeliveryTick: d.firstDelivery,
      travel: d.travel, attackChance: d.attackChance, raid: d.raid,
      attack: null, lastAttackAt: null, daysOccupied: 0,
    })),
    movements: [], convoys: [], reports: [], history: [], log: [],
    stats: { trained: 0, killed: 0, repelled: 0, lost: 0, liberated: 0, deliveries: 0, delivered: { food: 0, metal: 0, components: 0, fuel: 0 } },
    lastAttackAt: null, firstAttackDone: false, proven: false,
  };
  note(s, 'info', 'Outpost 07 command online. Millbrook and Greyvein are under our protection: send them garrisons.');
  return s;
}

// Preserve campaign progress and active orders when upgrading the original small-unit save.
export function restoreGame(saved) {
  if (!saved || ![1, VERSION].includes(saved.version)) return null;
  const s = structuredClone(saved);
  if (s.version === 1) {
    const scale = (o, keys) => { for (const k of keys) if (typeof o[k] === 'number') o[k] *= 50; };
    scale(s, ['available', 'recruits', 'trainingCapacity']);
    scale(s.resources, Object.keys(RESOURCES));
    for (const x of s.settlements) {
      scale(x, ['population', 'resourceAmount', 'assignedSoldiers', 'recommendedGarrison', 'availableVolunteers', 'volunteerCap', 'enemyForces']);
      x.raid = x.raid.map(n => n * 50);
    }
    for (const m of s.movements) scale(m, ['soldiers']);
    for (const b of s.training) scale(b, ['count']);
    for (const c of s.convoys) scale(c, ['amount']);
    for (const r of new Set([...s.reports, ...s.history])) scale(r, ['friendly', 'enemy', 'lost', 'surviving', 'enemyLost']);
    scale(s.stats, ['trained', 'killed']);
    scale(s.stats.delivered, Object.keys(RESOURCES));
    s.version = VERSION;
    note(s, 'info', 'Regional command expanded: troop and supply quantities scaled 50 times. Five new settlements await agreements. Earlier logs retain original figures.');
  }
  s.bunkerVolunteers ??= RULES.bunkerRecruitment.initial;
  s.stats.delivered.fuel ??= 0;
  for (const x of createGame(s.seed).settlements) if (!s.settlements.some(old => old.id === x.id)) s.settlements.push(x);
  return s;
}

export const settlement = (s, id) => s.settlements.find(x => x.id === id);
export const day = time => Math.floor(time / DAY) + 1;

// Every soldier is in exactly one place: the bunker, a garrison or on the road. Recruits are not soldiers yet.
export function military(s) {
  const deployedSoldiers = s.settlements.reduce((n, x) => n + x.assignedSoldiers, 0);
  const soldiersInTransit = s.movements.reduce((n, m) => n + m.soldiers, 0);
  const recruitsInTraining = s.training.reduce((n, b) => n + b.count, 0);
  return {
    availableSoldiers: s.available, deployedSoldiers, soldiersInTransit,
    untrainedRecruits: s.recruits, recruitsInTraining, trainingCapacity: s.trainingCapacity,
    totalSoldiers: s.available + deployedSoldiers + soldiersInTransit,
  };
}

function note(s, kind, text) {
  s.log.push({ id: s.nextId++, at: s.time, kind, text });
  if (s.log.length > LOG_SIZE) s.log.shift();
}
function report(s, r) {
  const full = { id: s.nextId++, at: s.time, ...r };
  s.reports.push(full); s.history.push(full);
  if (s.history.length > HISTORY_SIZE) s.history.shift();
}

// ── Combat ──────────────────────────────────────────────────────────────────────────────────────────
// Each side's power is its head count times a ±20 % roll; whoever holds the settlement fights from cover.
// The winner loses more the closer the fight; the loser loses 30–70 % and the rest fall back.
export function battle(s, attackers, defenders, bonus = RULES.defenseBonus) {
  if (defenders <= 0) return { defenderWins: false, attackersLost: 0, defendersLost: 0 };
  if (attackers <= 0) return { defenderWins: true, attackersLost: 0, defendersLost: 0 };
  const attack = attackers * between(s, RULES.noise), defense = defenders * bonus * between(s, RULES.noise);
  const defenderWins = defense >= attack, ratio = defenderWins ? attack / defense : defense / attack;
  const losses = (count, fraction, keep) => clamp(roundRandom(s, count * fraction), 0, count - keep);
  const winnerLoss = .35 * ratio * ratio, loserLoss = .3 + .4 * (1 - ratio);
  return defenderWins
    ? { defenderWins, defendersLost: losses(defenders, winnerLoss, 1), attackersLost: losses(attackers, loserLoss, 0) }
    : { defenderWins, attackersLost: losses(attackers, winnerLoss, 1), defendersLost: losses(defenders, loserLoss, 0) };
}

// Chance that `attackers` beat `defenders` dug in (exact for the uniform rolls, integrated numerically).
export function winChance(attackers, defenders, bonus = RULES.defenseBonus) {
  if (defenders <= 0) return 1;
  if (attackers <= 0) return 0;
  const [lo, hi] = RULES.noise, n = 200;
  let p = 0;
  for (let i = 0; i < n; i++) {
    const need = defenders * bonus * (lo + (hi - lo) * (i + .5) / n) / attackers;
    p += clamp((hi - need) / (hi - lo), 0, 1);
  }
  return p / n;
}
export const riskLabel = chance => chance >= .85 ? 'LOW' : chance >= .6 ? 'MODERATE' : chance >= .35 ? 'HIGH' : 'EXTREME';

export function security(x) {
  if (x.status !== 'protected' && x.status !== 'under_attack') return x.status === 'occupied' ? 'HOSTILE' : 'NO AGREEMENT';
  const g = x.assignedSoldiers, rec = x.recommendedGarrison;
  return g >= rec ? 'SECURE' : g >= Math.ceil(rec * .6) ? 'VULNERABLE' : g > 0 ? 'CRITICAL' : 'UNDEFENDED';
}

// The attack on x as the defenders see it: who is there, who arrives in time, and the odds.
export function siege(s, x) {
  if (!x.attack) return null;
  const inbound = s.movements.filter(m => m.settlement === x.id && m.outbound);
  const inTime = inbound.filter(m => m.arriveAt <= x.attack.resolvesAt).reduce((n, m) => n + m.soldiers, 0);
  const late = inbound.reduce((n, m) => n + m.soldiers, 0) - inTime;
  const holdChance = 1 - winChance(x.enemyForces, x.assignedSoldiers + inTime);
  return { enemies: x.enemyForces, defenders: x.assignedSoldiers, inTime, late, holdChance, threat: riskLabel(holdChance), left: Math.max(0, x.attack.resolvesAt - s.time) };
}

// How long a unit sent now would take to reach x (marching when the tanks are dry).
export const travelTime = (s, x) => Math.round(x.travel * (s.resources.fuel >= RULES.sortieFuel ? 1 : RULES.noFuelSlowdown));

// How many recruits could start training right now.
export function trainable(s) {
  const room = s.trainingCapacity - military(s).recruitsInTraining;
  return Math.max(0, Math.min(s.recruits, room, Math.floor(s.resources.metal / RULES.equipment.metal), Math.floor(s.resources.components / RULES.equipment.components)));
}

// ── Player orders ───────────────────────────────────────────────────────────────────────────────────
// Why an order cannot be given now ('' when it can). The interface uses it to disable buttons.
export function reason(s, a) {
  const x = a.id ? settlement(s, a.id) : null, n = a.count;
  if (a.id && !x) return 'Unknown settlement.';
  const needCount = () => !Number.isInteger(n) || n < 1 ? 'Choose how many.' : '';
  switch (a.type) {
    case 'speed': return SPEEDS.includes(a.speed) ? '' : 'Unknown speed.';
    case 'assign':
      if (needCount()) return needCount();
      if (n > s.available) return `Only ${troops(s.available)} available.`;
      if (x.status === 'occupied') return 'Occupied: launch a liberation operation.';
      if (x.status === 'neutral') {
        if (!s.proven) return `${x.name} wants proof first: repel an attack or liberate a settlement.`;
        if (n < RULES.agreementEscort && !s.movements.some(m => m.settlement === x.id)) return `Send at least ${troops(RULES.agreementEscort)} to sign the agreement.`;
      }
      return '';
    case 'recall':
      if (needCount()) return needCount();
      if (x.status !== 'protected') return x.status === 'under_attack' ? 'Under attack: hold or order a retreat.' : 'No garrison to recall.';
      return n > x.assignedSoldiers ? `Only ${troops(x.assignedSoldiers)} stationed there.` : '';
    case 'recruit-bunker':
      if (needCount()) return needCount();
      return n > (s.bunkerVolunteers ?? RULES.bunkerRecruitment.initial) ? 'Not enough bunker volunteers yet.' : '';
    case 'recruit':
      if (needCount()) return needCount();
      if (x.status !== 'protected') return 'Recruiting only in protected settlements.';
      return n > x.availableVolunteers ? `Only ${plural(x.availableVolunteers, 'volunteer')}.` : '';
    case 'train': {
      if (!s.recruits) return 'No untrained recruits.';
      if (military(s).recruitsInTraining >= s.trainingCapacity) return 'Training center full.';
      return trainable(s) ? '' : `Each recruit needs ${RULES.equipment.metal} metal and ${RULES.equipment.components} component.`;
    }
    case 'hold': return x.status !== 'under_attack' ? 'No attack there.' : x.attack.seen ? 'Orders already given.' : '';
    case 'retreat': return x.status === 'under_attack' ? '' : 'No attack there.';
    case 'liberate':
      if (needCount()) return needCount();
      if (x.status !== 'occupied') return 'Not occupied.';
      return n > s.available ? `Only ${troops(s.available)} available.` : '';
    case 'ack': return s.reports.some(r => r.id === a.report) ? '' : 'Already acknowledged.';
    default: return 'Unknown order.';
  }
}

export function act(state, a) {
  if (reason(state, a)) return state;
  const s = structuredClone(state), x = a.id ? settlement(s, a.id) : null, n = a.count;
  switch (a.type) {
    case 'speed': s.speed = a.speed; break;
    case 'assign': {
      const kind = x.status === 'neutral' ? 'agreement' : x.status === 'under_attack' ? 'reinforce' : 'deploy';
      const m = depart(s, x, n, kind);
      if (x.attack) x.attack.seen = true;
      note(s, 'order', kind === 'agreement' ? `${troops(n)} left to sign a protection agreement with ${x.name}. ETA ${clock(m.arriveAt - s.time)}.`
        : kind === 'reinforce' ? `${n} reinforcements left for ${x.name}. ETA ${clock(m.arriveAt - s.time)}${m.arriveAt <= x.attack.resolvesAt ? ', before the fight' : ', after the fight starts'}.`
        : `${troops(n)} left for ${x.name}. ETA ${clock(m.arriveAt - s.time)}.`);
      break;
    }
    case 'recall':
      x.assignedSoldiers -= n; sendHome(s, x, n);
      note(s, 'order', `${troops(n)} recalled from ${x.name}. Back in ${clock(x.travel)}.`);
      break;
    case 'recruit-bunker':
      s.bunkerVolunteers = (s.bunkerVolunteers ?? RULES.bunkerRecruitment.initial) - n;
      s.recruits += n;
      note(s, 'recruit', `${plural(n, 'volunteer')} enlisted through the bunker recruitment desk. Ready for training.`);
      break;
    case 'recruit':
      x.availableVolunteers -= n; s.recruits += n;
      note(s, 'recruit', `${plural(n, 'volunteer')} from ${x.name} joined as recruits.`);
      break;
    case 'train': {
      const count = trainable(s);
      s.recruits -= count;
      s.resources.metal -= count * RULES.equipment.metal; s.resources.components -= count * RULES.equipment.components;
      s.training.push({ id: s.nextId++, count, elapsed: 0, paidDays: 0, waiting: false });
      note(s, 'recruit', `${plural(count, 'recruit')} started basic training (${RULES.trainingDays} days).`);
      break;
    }
    case 'hold': x.attack.seen = true; note(s, 'order', `${x.name}: hold position.`); break;
    case 'retreat': {
      const lost = clamp(roundRandom(s, x.assignedSoldiers * RULES.retreatLoss), 0, x.assignedSoldiers), back = x.assignedSoldiers - lost;
      s.stats.killed += lost; s.stats.lost++;
      report(s, { type: 'retreat', settlement: x.id, title: x.name, outcome: 'WITHDRAWN', friendly: x.assignedSoldiers, enemy: x.enemyForces, lost, surviving: back, status: 'OCCUPIED', income: `−${x.resourceAmount} ${RESOURCES[x.resourceType].toLowerCase()} per delivery` });
      x.assignedSoldiers = 0; if (back) sendHome(s, x, back);
      occupy(s, x, x.enemyForces);
      note(s, 'loss', `${x.name} abandoned. ${lost ? troops(lost) + ' lost covering the withdrawal; ' : ''}${back} falling back to Outpost 07.`);
      break;
    }
    case 'liberate': {
      const m = depart(s, x, n, 'liberate');
      note(s, 'order', `Liberation force of ${n} left for ${x.name}. ETA ${clock(m.arriveAt - s.time)}.`);
      break;
    }
    case 'ack': s.reports = s.reports.filter(r => r.id !== a.report); break;
  }
  return s;
}

function depart(s, x, count, kind) {
  const time = travelTime(s, x);
  if (s.resources.fuel >= RULES.sortieFuel) s.resources.fuel -= RULES.sortieFuel;
  s.available -= count;
  const m = { id: s.nextId++, kind, settlement: x.id, soldiers: count, outbound: true, departAt: s.time, arriveAt: s.time + time };
  s.movements.push(m); return m;
}
function sendHome(s, x, count) {
  s.movements.push({ id: s.nextId++, kind: 'return', settlement: x.id, soldiers: count, outbound: false, departAt: s.time, arriveAt: s.time + x.travel });
}
function occupy(s, x, enemies) {
  Object.assign(x, { status: 'occupied', enemyForces: Math.max(1, enemies), attack: null, assignedSoldiers: 0, confidence: 20, nextDeliveryTick: null, daysOccupied: 0 });
}

// ── Time ────────────────────────────────────────────────────────────────────────────────────────────
// Advance by `dt` game ms in fixed steps (the remainder carries over, so the result does not depend on how
// the time is chopped up). The shell passes real ms × speed.
export function advance(state, dt) {
  if (!(dt > 0)) return state;
  const s = structuredClone(state);
  s.carry += dt;
  for (let guard = 0; s.carry >= STEP && guard < 100_000; guard++) { s.carry -= STEP; step(s); }
  return s;
}

function step(s) {
  const before = s.time;
  s.time += STEP;
  if (Math.floor(s.time / DAY) > Math.floor(before / DAY)) midnight(s);
  for (const m of s.movements.filter(m => m.arriveAt <= s.time).sort((a, b) => a.arriveAt - b.arriveAt || a.id - b.id)) arrive(s, m);
  for (const c of s.convoys) if (!c.delivered && c.arriveAt <= s.time) {
    c.delivered = true; s.resources[c.cargo] += c.amount; s.stats.deliveries++; s.stats.delivered[c.cargo] += c.amount;
    note(s, 'delivery', `Supply truck from ${settlement(s, c.settlement).name} unloaded ${c.amount} ${RESOURCES[c.cargo].toLowerCase()}.`);
  }
  s.convoys = s.convoys.filter(c => c.returnAt > s.time);
  for (const x of s.settlements) {
    if (x.attack && x.attack.resolvesAt <= s.time) fight(s, x);
    if (x.status === 'protected' && x.nextDeliveryTick != null && x.nextDeliveryTick <= s.time) dispatchConvoy(s, x);
  }
  train(s);
}

function dispatchConvoy(s, x) {
  s.convoys.push({ id: s.nextId++, settlement: x.id, cargo: x.resourceType, amount: x.resourceAmount, departAt: s.time, arriveAt: s.time + x.travel, returnAt: s.time + 2 * x.travel, delivered: false });
  while (x.nextDeliveryTick <= s.time) x.nextDeliveryTick += x.deliveryInterval;
  note(s, 'convoy', `Supply truck left ${x.name}: ${x.resourceAmount} ${RESOURCES[x.resourceType].toLowerCase()}, ETA ${clock(x.travel)}.`);
}

function train(s) {
  for (const b of s.training) {
    if (b.elapsed >= b.paidDays * DAY) {          // a new training day starts: its rations first
      const cost = b.count * RULES.trainingFood;
      if (s.resources.food < cost) {
        if (!b.waiting) note(s, 'warn', `Training paused: ${cost} food needed for the next day.`);
        b.waiting = true; continue;
      }
      s.resources.food -= cost; b.paidDays++;
      if (b.waiting) note(s, 'recruit', 'Training resumed.');
      b.waiting = false;
    }
    b.elapsed += STEP;
    if (b.elapsed >= RULES.trainingDays * DAY) {
      b.done = true; s.available += b.count; s.stats.trained += b.count;
      note(s, 'recruit', `${plural(b.count, 'recruit')} completed training and joined the available soldiers.`);
    }
  }
  s.training = s.training.filter(b => !b.done);
}

// When the next group of volunteers reaches the bunker (game ms): every few days, at midnight.
export function nextBunkerIntake(s) {
  const every = RULES.bunkerRecruitment.everyDays * DAY;
  return (Math.floor(s.time / every) + 1) * every;
}

function midnight(s) {
  const today = day(s.time), forces = military(s).totalSoldiers, need = Math.ceil(forces * RULES.upkeep);
  const intake = RULES.bunkerRecruitment, pool = s.bunkerVolunteers ?? intake.initial;
  if ((today - 1) % intake.everyDays === 0 && pool < intake.capacity) {
    s.bunkerVolunteers = Math.min(intake.capacity, pool + intake.batch);
    note(s, 'recruit', `${s.bunkerVolunteers - pool} volunteers reached the bunker. Recruitment pool: ${s.bunkerVolunteers}.`);
  }
  if (need) {
    if (s.resources.food >= need) s.resources.food -= need;
    else { s.resources.food = 0; note(s, 'warn', `Rations short: ${troops(forces)} on half meals. Keep the food trucks coming.`); }
  }
  for (const x of s.settlements) {
    if (x.status === 'protected') {
      x.confidence = clamp(x.confidence + (x.assignedSoldiers >= x.recommendedGarrison ? 3 : x.assignedSoldiers ? -1 : -3), 0, 100);
      x.volunteerDays++;
      if (x.volunteerDays >= (x.confidence >= 70 ? 1 : RULES.volunteerDays)) {
        x.volunteerDays = 0;
        if (x.availableVolunteers < x.volunteerCap) x.availableVolunteers = Math.min(x.volunteerCap, x.availableVolunteers + RULES.volunteerBatch);
      }
    } else if (x.status === 'occupied') {
      x.daysOccupied++;
      if (x.daysOccupied % RULES.occupationGrowthDays === 0 && x.enemyForces < RULES.occupationCap) {
        x.enemyForces = Math.min(RULES.occupationCap, x.enemyForces + RULES.occupationGrowth); note(s, 'warn', `Hostiles in ${x.name} reinforced: about ${x.enemyForces} now.`);
      }
    }
  }
  scheduleAttacks(s, today);
}

function scheduleAttacks(s, today) {
  if (s.settlements.some(x => x.attack)) return;
  const first = RULES.firstAttack;
  if (!s.firstAttackDone && today >= first.day) {
    s.firstAttackDone = true;
    const x = settlement(s, first.settlement);
    if (x.status === 'protected') { startAttack(s, x, first.enemies); return; }
  }
  if (!s.firstAttackDone || today < RULES.randomAttacksFrom) return;
  const since = s.lastAttackAt == null ? Infinity : (s.time - s.lastAttackAt) / DAY;
  if (since < RULES.attackGapDays) return;
  const pressure = Math.max(0, Math.min(since, 10) - 4) * .03;
  for (const x of s.settlements) {
    if (x.status !== 'protected') continue;
    if (x.lastAttackAt != null && (s.time - x.lastAttackAt) / DAY < RULES.settlementCooldownDays) continue;
    const g = x.assignedSoldiers, rec = x.recommendedGarrison;
    const weakness = g >= rec ? .6 : 1 + (1 - g / rec);
    if (random(s) < Math.min(.6, x.attackChance * weakness + pressure)) {
      startAttack(s, x, integer(s, ...x.raid) + Math.floor(today / RULES.raidGrowth.everyDays) * RULES.raidGrowth.enemies); return;
    }
  }
}

function startAttack(s, x, enemies) {
  x.status = 'under_attack'; x.enemyForces = enemies;
  x.attack = { startedAt: s.time, resolvesAt: s.time + RULES.attackWindow, seen: false };
  x.lastAttackAt = s.lastAttackAt = s.time;
  if (s.speed > 1) s.speed = 1;   // give the commander time to decide
  note(s, 'alert', `PRIORITY ALERT · ${x.name} under attack: ${enemies} hostiles against ${x.assignedSoldiers} defenders.`);
}

function fight(s, x) {
  const defenders = x.assignedSoldiers, enemies = x.enemyForces, r = battle(s, enemies, defenders);
  const surviving = defenders - r.defendersLost;
  s.stats.killed += r.defendersLost;
  if (r.defenderWins) {
    Object.assign(x, { status: 'protected', enemyForces: 0, attack: null, assignedSoldiers: surviving, confidence: clamp(x.confidence + 10, 0, 100) });
    s.proven = true; s.stats.repelled++;
    report(s, { type: 'defense', settlement: x.id, title: x.name, outcome: 'VICTORY', friendly: defenders, enemy: enemies, lost: r.defendersLost, surviving, enemyLost: r.attackersLost, status: 'SECURED' });
    note(s, 'combat', `${x.name} held: ${enemies} hostiles driven off. ${troops(r.defendersLost)} lost, ${surviving} still on station.`);
  } else {
    if (surviving) sendHome(s, x, surviving);
    s.stats.lost++;
    report(s, { type: 'defense', settlement: x.id, title: x.name, outcome: 'DEFEAT', friendly: defenders, enemy: enemies, lost: r.defendersLost, surviving, enemyLost: r.attackersLost, status: 'OCCUPIED', income: `−${x.resourceAmount} ${RESOURCES[x.resourceType].toLowerCase()} per delivery` });
    occupy(s, x, enemies - r.attackersLost);
    note(s, 'loss', defenders ? `${x.name} fell. ${troops(r.defendersLost)} killed; ${surviving} falling back to Outpost 07.` : `${x.name} fell without a fight: no garrison.`);
  }
}

function arrive(s, m) {
  s.movements = s.movements.filter(o => o.id !== m.id);
  const x = settlement(s, m.settlement);
  if (!m.outbound) { s.available += m.soldiers; note(s, 'order', `${troops(m.soldiers)} back at Outpost 07 from ${x.name}.`); return; }
  if (x.status === 'occupied' && m.kind === 'liberate') { liberate(s, x, m.soldiers); return; }
  if (x.status === 'occupied') { sendHome(s, x, m.soldiers); note(s, 'warn', `${troops(m.soldiers)} found ${x.name} occupied and turned back.`); return; }
  if (x.status === 'neutral') {
    Object.assign(x, { status: 'protected', assignedSoldiers: m.soldiers, confidence: 50, nextDeliveryTick: s.time + DAY / 2 });
    report(s, { type: 'agreement', settlement: x.id, title: x.name, outcome: 'AGREEMENT SIGNED', friendly: m.soldiers, status: 'PROTECTED', income: `+${x.resourceAmount} ${RESOURCES[x.resourceType].toLowerCase()} per delivery` });
    note(s, 'liberation', `Protection agreement signed with ${x.name}. Garrison: ${troops(m.soldiers)}.`);
    return;
  }
  x.assignedSoldiers += m.soldiers;
  note(s, 'order', `${troops(m.soldiers)} reached ${x.name}${x.status === 'under_attack' ? ' and joined the defense' : ''}. Garrison ${x.assignedSoldiers}.`);
}

function liberate(s, x, force) {
  const enemies = x.enemyForces, r = battle(s, force, enemies), surviving = force - r.attackersLost;
  s.stats.killed += r.attackersLost;
  if (!r.defenderWins) {
    Object.assign(x, { status: 'protected', enemyForces: 0, assignedSoldiers: surviving, confidence: 45, daysOccupied: 0, nextDeliveryTick: s.time + x.deliveryInterval });
    s.proven = true; s.stats.liberated++;
    report(s, { type: 'liberation', settlement: x.id, title: x.name, outcome: 'LIBERATED', friendly: force, enemy: enemies, lost: r.attackersLost, surviving, enemyLost: r.defendersLost, status: 'PROTECTED' });
    note(s, 'liberation', `${x.name} liberated. ${troops(r.attackersLost)} lost; garrison now ${surviving}. Deliveries resume next cycle.`);
  } else {
    x.enemyForces = Math.max(1, enemies - r.defendersLost);
    if (surviving) sendHome(s, x, surviving);
    report(s, { type: 'liberation', settlement: x.id, title: x.name, outcome: 'FAILED', friendly: force, enemy: enemies, lost: r.attackersLost, surviving, enemyLost: r.defendersLost, status: 'OCCUPIED' });
    note(s, 'loss', `Liberation of ${x.name} failed. ${troops(r.attackersLost)} lost; ${surviving} returning. About ${x.enemyForces} hostiles remain.`);
  }
}

// ── Reading the state ───────────────────────────────────────────────────────────────────────────────
// Game ms as m:ss (equal to real seconds at 1×).
export function clock(ms) { const t = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
export function dateLabel(time) {
  const minutes = Math.floor((time % DAY) / DAY * 1440);
  return `Day ${day(time)} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Where a moving unit is along its road: 0 at the bunker, 1 at the settlement.
export function roadPosition(unit, time) {
  if (unit.cargo) {   // supply truck: settlement → bunker, then back
    if (time <= unit.arriveAt) return 1 - clamp((time - unit.departAt) / (unit.arriveAt - unit.departAt), 0, 1);
    return clamp((time - unit.arriveAt) / (unit.returnAt - unit.arriveAt), 0, 1);
  }
  const k = clamp((time - unit.departAt) / (unit.arriveAt - unit.departAt), 0, 1);
  return unit.outbound ? k : 1 - k;
}

// What the commander should do next: walks a new player through the first scenario.
export function objective(s) {
  const attacked = s.settlements.find(x => x.status === 'under_attack');
  if (attacked) return `${attacked.name} is under attack. Reinforce, hold or order a retreat before the fight in ${clock(attacked.attack.resolvesAt - s.time)}.`;
  const occupied = s.settlements.find(x => x.status === 'occupied');
  if (occupied && !s.movements.some(m => m.kind === 'liberate')) return `${occupied.name} is occupied by about ${occupied.enemyForces} hostiles. Assemble a liberation force (dug-in defenders fight 25 % harder).`;
  if (occupied) return `Liberation force on the road to ${occupied.name}.`;
  const bare = s.settlements.filter(x => x.status === 'protected' && !x.assignedSoldiers && !s.movements.some(m => m.settlement === x.id && m.outbound));
  if (bare.length) return `Assign garrisons to ${bare.map(x => x.name).join(' and ')}. Unprotected settlements fall to the first raid.`;
  if (!s.stats.deliveries) return 'Watch the supply trucks on the map: settlements deliver to the bunker on their own.';
  if (!s.stats.trained && !s.recruits && !s.training.length) return 'Recruit volunteers from a protected settlement in the Military tab.';
  if (s.recruits && trainable(s)) return `Start basic training for ${plural(trainable(s), 'recruit')}.`;
  if (s.training.length) return `Training under way. New soldiers ready in ${clock(RULES.trainingDays * DAY - Math.max(...s.training.map(b => b.elapsed)))}.`;
  const neutral = s.settlements.find(x => x.status === 'neutral');
  if (neutral && s.proven) return `${neutral.name} will now talk: send at least ${troops(RULES.agreementEscort)} to sign a protection agreement.`;
  if (neutral) return `Hold your settlements. ${neutral.name} is watching how you defend them.`;
  return 'All settlements protected. Keep a reserve at the bunker for the next attack.';
}
