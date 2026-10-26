// The Kestrel Falls operation as a small off-screen simulation. It runs on real time in 10-second
// ticks, so it keeps going while the drone feed is closed (or the page is), and catches up on load.
// Pure functions: storage lives in city-store.js, the live 3D scene in dev/scenarios/city.js.

const TICK = 10_000, MAX_CATCH_UP = 6 * 60 * 60_000, LOG_SIZE = 30;
const MINUTE = 60_000;

// Deterministic per tick, so the same history replays the same way.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createOperation(now, seed = Math.floor(Math.random() * 2 ** 31)) {
  return {
    version: 1, seed, tick: 0, startedAt: now, updatedAt: now,
    // quiet: before the first ambush · contact: a wave is attacking · lull: between waves.
    phase: 'quiet', phaseEnds: now + 3 * MINUTE,
    wave: 0, active: 0, down: 0, totalDown: 0, soldiersWounded: 0, breaches: 0, vip: 'safe',
    liveUntil: 0,
    log: [{ at: now, text: 'Cordon established around Corner Market 24. Five soldiers on the block.' }],
  };
}

const waveSize = wave => Math.min(24, 8 + wave * 4);
function note(op, at, text) { op.log.push({ at, text }); if (op.log.length > LOG_SIZE) op.log.splice(0, op.log.length - LOG_SIZE); }

function startWave(op, at) {
  op.wave++; op.active = waveSize(op.wave); op.down = 0; op.vip = 'sheltering'; op.phase = 'contact';
  note(op, at, op.wave === 1
    ? `Ambush! ${op.active} armed civilians hit the cordon from three streets. VIP sheltering in the storeroom.`
    : `Wave ${op.wave}: ${op.active} intruders moving on the store.`);
}

// One 10-second slice of the fight.
function step(op, at, random) {
  if (op.phase !== 'contact') {
    if (at >= op.phaseEnds) startWave(op, at);
    return;
  }
  // Soldiers have the accuracy, the intruders the numbers.
  let downed = 0;
  for (let i = 0; i < op.active; i++) if (random() < .045) downed++;
  op.active -= downed; op.down += downed; op.totalDown += downed;
  if (random() < .015 * Math.min(2, op.active / 12)) { op.soldiersWounded++; note(op, at, 'Soldier wounded at the cordon; still fighting.'); }
  if (random() < .004 * op.active) { op.breaches++; note(op, at, 'An intruder reached the store door before being stopped.'); }
  if (op.active <= 0) {
    op.active = 0; op.phase = 'lull'; op.vip = 'safe';
    op.phaseEnds = at + (3 + random() * 5) * MINUTE;
    note(op, at, `Wave ${op.wave} cleared: ${op.down} down. Soldiers back on patrol.`);
  }
}

// Bring the operation up to `now`. While the live scene is open (liveUntil), it owns the state and
// the off-screen ticks just pass.
export function advance(state, now) {
  const op = structuredClone(state);
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
  op.liveUntil = now + 15_000; op.updatedAt = Math.max(op.updatedAt, now);
  if (live.wave > op.wave && live.contact) note(op, now, `Drone: wave ${live.wave} engaging, ${live.active} intruders active.`);
  if (op.phase === 'contact' && !live.contact && live.wave >= op.wave) {
    note(op, now, `Drone: wave ${live.wave} cleared, ${live.down} down.`);
    op.phaseEnds = now + 4 * MINUTE;
  }
  op.wave = Math.max(op.wave, live.wave);
  op.phase = live.contact ? 'contact' : op.wave ? 'lull' : 'quiet';
  if (live.contact) { op.totalDown += Math.max(0, live.down - op.down); op.active = live.active; op.down = live.down; }
  op.vip = live.vip;
  return op;
}

// One line for the map card.
export function summary(op, now) {
  const weather = 'Sleet · 1 °C · wind 15 km/h';
  const since = m => m < 1 ? 'just now' : m < 60 ? Math.round(m) + ' min' : (m / 60).toFixed(1) + ' h';
  if (op.phase === 'contact') return `CONTACT · wave ${op.wave} · ${op.active} active · ${op.down} down · VIP ${op.vip} · ${weather}`;
  if (op.phase === 'lull') return `Quiet since wave ${op.wave} · ${op.totalDown} intruders down in ${since((now - op.startedAt) / MINUTE)} · ${weather}`;
  return `Patrol · all quiet · cordon up ${since((now - op.startedAt) / MINUTE)} · ${weather}`;
}
