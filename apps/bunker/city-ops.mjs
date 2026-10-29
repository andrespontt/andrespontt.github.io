// The Kestrel Falls operation as a small off-screen simulation. It runs on real time in 10-second
// ticks, so it keeps going while the drone feed is closed (or the page is), and catches up on load.
// Pure functions: storage lives in city-store.js, the live 3D scene in dev/scenarios/city.js.

const TICK = 10_000, MAX_CATCH_UP = 6 * 60 * 60_000, LOG_SIZE = 30;
const MINUTE = 60_000, DAY = 24 * 60 * MINUTE;

// Outpost 07 command (made-up numbers): 500 personnel, five of them holding the store in Kestrel Falls.
export const COMMAND = { personnel: 500, cityDetail: 5 };
// Daily use across the command: three meals a person, generators and heaters on diesel.
export const USE_PER_DAY = { rations: COMMAND.personnel * 3, fuel: 900 };
export function createCommand() {
  return {
    forces: { total: COMMAND.personnel, atOutpost: COMMAND.personnel - COMMAND.cityDetail, deployed: COMMAND.cityDetail, wounded: 0, killed: 0 },
    supplies: { rifleAmmo: 120_000, fuel: 18_000, rations: 45_000, medKits: 600, vehicles: 14, drones: 3 },
  };
}

// Deterministic per tick, so the same history replays the same way.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createOperation(now, seed = Math.floor(Math.random() * 2 ** 31)) {
  return {
    version: 1, seed, tick: 0, startedAt: now, updatedAt: now,
    // quiet: before the first ambush · contact: a wave is attacking · lull: between waves.
    phase: 'quiet', phaseEnds: now + 1.5 * MINUTE,
    wave: 0, active: 0, down: 0, totalDown: 0, soldiersWounded: 0, breaches: 0, vip: 'safe',
    liveUntil: 0, liveRounds: 0,
    ...createCommand(),
    log: [{ at: now, text: 'Cordon established around Corner Market 24. Five soldiers on the block.' }],
  };
}

// Each envoy who leads the meeting has a name; a killed envoy is replaced from Outpost 07 between waves.
export const ENVOYS = ['Vale', 'Okafor', 'Lindqvist', 'Sato', 'Ferreira', 'Haddad'];
export const envoyName = n => ENVOYS[((n || 1) - 1) % ENVOYS.length];
const ENVOY_DELAY = MINUTE;
// A replacement envoy reaches the store a minute after the wave that killed the last one is over.
function replaceEnvoy(op, at) {
  if (op.vip !== 'killed' || op.phase === 'contact') return;
  op.envoyDue ??= at + ENVOY_DELAY;
  if (at < op.envoyDue) return;
  op.envoy = (op.envoy || 1) + 1; op.vip = 'safe'; op.envoyDue = null;
  note(op, at, `Envoy ${envoyName(op.envoy)} arrives from Outpost 07 and takes over the meeting.`);
}

// Each wave comes as five groups in a row; groups grow with the wave (10 → 16 intruders).
export const GROUPS = 5, groupSize = wave => Math.min(16, 2 * (4 + wave)), waveSize = wave => GROUPS * groupSize(wave);
const GROUP_GAP = 45_000; // the next group comes once the last is nearly stopped, or after 45 s
function note(op, at, text) { op.log.push({ at, text }); if (op.log.length > LOG_SIZE) op.log.splice(0, op.log.length - LOG_SIZE); }

function startWave(op, at) {
  op.wave++; op.active = waveSize(op.wave); op.down = 0; op.phase = 'contact';
  op.group = 1; op.incoming = op.active - groupSize(op.wave); op.groupAt = at;
  if (op.vip !== 'killed') op.vip = 'sheltering';
  note(op, at, op.wave === 1
    ? `Ambush! ${groupSize(op.wave)} armed civilians hit the cordon from three streets, ${op.incoming} more behind them. VIP sheltering in the storeroom.`
    : `Wave ${op.wave}: ${groupSize(op.wave)} intruders moving on the store, ${GROUPS - 1} more groups behind them.`);
}
// The next group of the wave joins the fight.
function nextGroup(op, at) {
  const n = Math.min(op.incoming, groupSize(op.wave));
  op.incoming -= n; op.group++; op.groupAt = at;
  note(op, at, `Group ${op.group} of ${GROUPS}: ${n} more intruders hit the cordon.`);
}

// One 10-second slice of the fight.
// Wounded soldier: two med kits, and a replacement goes down from the outpost so the detail stays at five.
function wound(op, at) {
  op.soldiersWounded++; op.forces.wounded++;
  op.supplies.medKits = Math.max(0, op.supplies.medKits - 2);
  if (op.forces.atOutpost > 0) { op.forces.atOutpost--; note(op, at, 'Soldier wounded at the cordon; a replacement leaves Outpost 07.'); }
  else note(op, at, 'Soldier wounded at the cordon; no replacements left.');
}
// Killed soldier: one less in the command, and a replacement leaves the outpost.
function kill(op, at) {
  op.forces.killed++; op.forces.total = Math.max(0, op.forces.total - 1);
  if (op.forces.atOutpost > 0) { op.forces.atOutpost--; note(op, at, 'Soldier killed at the cordon; a replacement leaves Outpost 07.'); }
  else note(op, at, 'Soldier killed at the cordon; no replacements left.');
}
function consume(op, random) {
  const s = op.supplies, share = TICK / DAY;
  s.rations = Math.max(0, s.rations - USE_PER_DAY.rations * share);
  s.fuel = Math.max(0, s.fuel - USE_PER_DAY.fuel * share);
  // Five rifles in a firefight: roughly 30-80 rounds per 10 s.
  if (op.phase === 'contact') s.rifleAmmo = Math.max(0, s.rifleAmmo - Math.round(30 + random() * 50));
}
function step(op, at, random) {
  consume(op, random);
  if (op.phase !== 'contact') {
    replaceEnvoy(op, at);
    if (at >= op.phaseEnds) startWave(op, at);
    return;
  }
  // Soldiers have the accuracy, the intruders the numbers.
  op.incoming ??= 0;
  const fighting = () => op.active - op.incoming;
  if (op.incoming > 0 && (fighting() <= 2 || at - (op.groupAt ?? 0) >= GROUP_GAP)) nextGroup(op, at);
  let downed = 0;
  for (let i = 0; i < fighting(); i++) if (random() < .045) downed++;
  op.active -= downed; op.down += downed; op.totalDown += downed;
  if (random() < .015 * Math.min(2, fighting() / 6)) (random() < .3 ? kill : wound)(op, at);
  if (random() < .004 * fighting()) {
    op.breaches++;
    // Intruders who get inside go for the VIP sheltering in the storeroom.
    if (op.vip !== 'killed' && random() < .1) { op.vip = 'killed'; note(op, at, 'Intruders reached the storeroom. The VIP has been killed.'); }
    else note(op, at, 'An intruder reached the store door before being stopped.');
  }
  if (op.active <= 0) {
    op.active = 0; op.phase = 'lull'; if (op.vip !== 'killed') op.vip = 'safe';
    op.phaseEnds = at + (3 + random() * 5) * MINUTE;
    note(op, at, `Wave ${op.wave} cleared: ${op.down} down. Soldiers back on patrol.`);
  }
}

// Bring the operation up to `now`. While the live scene is open (liveUntil), it owns the state and
// the off-screen ticks just pass.
export function advance(state, now) {
  const op = structuredClone(state);
  if (!op.forces) Object.assign(op, createCommand(), { liveRounds: 0 });
  if (now - op.updatedAt > MAX_CATCH_UP) op.updatedAt = now - MAX_CATCH_UP;
  while (op.updatedAt + TICK <= now) {
    const at = op.updatedAt + TICK;
    op.tick++;
    if (at > op.liveUntil) step(op, at, rng(op.seed + op.tick * 7919));
    op.updatedAt = at;
  }
  return op;
}

// The live scene reports what it sees; that becomes the operation's state.
export function applyLive(state, live, now) {
  const op = structuredClone(state);
  if (live.wave < op.wave) return op; // Ignore late reports from a previous wave.
  if (live.session ? live.session !== op.liveSession : now > op.liveUntil) op.liveRounds = op.liveWounded = op.liveKilled = 0;
  if (live.session) op.liveSession = live.session;
  op.liveUntil = now + 15_000; op.updatedAt = Math.max(op.updatedAt, now);
  if (live.wave > op.wave && live.contact) note(op, now, `Drone: wave ${live.wave} engaging, ${live.active} intruders active.`);
  if (op.phase === 'contact' && !live.contact && live.wave >= op.wave) {
    note(op, now, `Drone: wave ${live.wave} cleared, ${live.down} down.`);
    op.phaseEnds = now + 4 * MINUTE;
  }
  if (live.rounds != null) { op.supplies.rifleAmmo = Math.max(0, op.supplies.rifleAmmo - Math.max(0, live.rounds - op.liveRounds)); op.liveRounds = live.rounds; }
  if (live.wounded != null) { for (let i = op.liveWounded || 0; i < live.wounded; i++) wound(op, now); op.liveWounded = Math.max(op.liveWounded || 0, live.wounded); }
  if (live.killed != null) { for (let i = op.liveKilled || 0; i < live.killed; i++) kill(op, now); op.liveKilled = Math.max(op.liveKilled || 0, live.killed); }
  if (live.vip === 'killed' && op.vip !== 'killed' && (live.envoy ?? 1) >= (op.envoy || 1)) note(op, now, 'Drone: intruders reached the storeroom. The VIP has been killed.');
  if (live.wave > op.wave) op.down = 0;
  op.totalDown += Math.max(0, live.down - op.down);
  op.active = Math.max(0, live.active); op.down = Math.max(0, live.down);
  op.incoming = Math.min(op.active, Math.max(0, live.incoming ?? 0)); op.group = live.group ?? op.group; op.groupAt = now;
  op.wave = Math.max(op.wave, live.wave);
  op.phase = live.contact ? 'contact' : op.wave ? 'lull' : 'quiet';
  // A dead envoy stays dead. Only a newer envoy (one the feed brought in) changes that.
  const envoy = op.envoy || 1;
  if (live.envoy > envoy) { op.envoy = live.envoy; op.envoyDue = null; op.vip = live.vip; note(op, now, `Drone: Envoy ${envoyName(op.envoy)} has arrived at the store.`); }
  else if (live.envoy == null || live.envoy === envoy) op.vip = op.vip === 'killed' ? 'killed' : live.vip;
  replaceEnvoy(op, now);
  return op;
}

// Forces and supplies as display lines, with days left at the current rate of use.
export function commandLines(op) {
  if (!op?.forces) return [];
  const f = op.forces, s = op.supplies, n = v => Math.round(v).toLocaleString('en-US');
  const days = (left, perDay) => (left / perDay).toFixed(0) + ' days';
  return [
    ['Personnel', n(f.total) + ' · ' + n(f.atOutpost) + ' at Outpost 07 · ' + f.deployed + ' in Kestrel Falls'],
    ['Casualties', f.wounded + ' wounded · ' + f.killed + ' killed'],
    ['5.56 mm rounds', n(s.rifleAmmo)],
    ['Diesel', n(s.fuel) + ' L · ' + days(s.fuel, USE_PER_DAY.fuel)],
    ['Rations', n(s.rations) + ' meals · ' + days(s.rations, USE_PER_DAY.rations)],
    ['Medical kits', n(s.medKits)],
    ['Vehicles · drones', s.vehicles + ' · ' + s.drones + ' (1 over Kestrel Falls)'],
  ];
}

// One line for the map card.
export function summary(op, now) {
  const weather = 'Sleet · 1 °C · wind 15 km/h';
  const since = m => m < 1 ? 'just now' : m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h';
  if (op.phase === 'contact') return `CONTACT · wave ${op.wave} · group ${op.group || 1}/${GROUPS} · ${op.active} active · ${op.down} down · VIP ${op.vip} · ${weather}`;
  if (op.phase === 'lull') return `Quiet since wave ${op.wave} · ${op.totalDown} intruders down in ${since((now - op.startedAt) / MINUTE)} · ${weather}`;
  return `Patrol · all quiet · cordon up ${since((now - op.startedAt) / MINUTE)} · ${weather}`;
}
