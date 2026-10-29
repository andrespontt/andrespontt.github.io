// Trade routes: the outpost's first game loop. Outpost 07 produces power cells (⚡) but needs food (🥫).
// Each truck is given a standing route once; it then drives it on its own, over and over (out along the survey
// roads, trade or salvage, home, unload, out again) until the route is turned off. The generator only runs
// while the crew has food, so: cells buy food, food keeps the cells coming.
// Pure functions on real time; the shell saves the state and calls advance() as time passes.
import { SITES, routeTo } from './sector.js?v=room2';

export const PRODUCE_EVERY = 20_000;   // +1 ⚡ while the crew is fed
export const EAT_EVERY = 30_000;       // −1 🥫
export const CELL_CAP = 24, FOOD_CAP = 30, LOAD = 4, TRUCKS = 2;
export const SPEED = 2.5;              // map units per second (1 unit = 50 m on the survey)
export const STOP_TIME = 3000;
const STEP = 1000, MAX_CATCH_UP = 2 * 60 * 60_000;

// What happens at each stop. Market: every 2 ⚡ in the truck become 3 🥫. Relay: salvage 3 ⚡.
export const STOPS = {
  city: { name: 'Kestrel Falls', act(cargo) { const pairs = Math.floor(cargo.cells / 2); return { cells: cargo.cells - pairs * 2, food: cargo.food + pairs * 3 }; } },
  relay: { name: 'Relay 03', act(cargo) { return { cells: cargo.cells + 3, food: cargo.food }; } },
};
export const RUNS = {
  market: { short: 'Market', label: 'Kestrel Falls', stops: ['city'], deal: `${LOAD} ⚡ → 6 🥫` },
  salvage: { short: 'Salvage', label: 'Relay 03', stops: ['relay'], deal: '+3 ⚡' },
  loop: { short: 'Both', label: 'Relay 03 → Kestrel Falls', stops: ['relay', 'city'], deal: 'salvage, then trade' },
};
// Runs that trade take cells from the outpost when they leave.
const loads = run => RUNS[run].stops.includes('city');

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = path => path.reduce((sum, p, i) => i ? sum + dist(path[i - 1], p) : 0, 0);
// From one stop to the next along the roads: back down the first route and out the second, taking the
// cheapest shortcut between them (so Relay 03 → Kestrel Falls does not drive past the bunker door).
function leg(from, to) {
  const back = routeTo(from).slice().reverse(), out = routeTo(to);
  let best = null;
  for (let i = 0; i < back.length; i++) for (let j = 0; j < out.length; j++) {
    if(dist(back[i],out[j])>.001)continue; // Turn only at an actual shared road junction.
    const cost = length(back.slice(0, i + 1)) + dist(back[i], out[j]) + length(out.slice(j));
    if (!best || cost < best.cost) best = { cost, path: [...back.slice(0, i + 1), ...out.slice(j)] };
  }
  return best.path;
}
// The run as timed pieces: drive, stop, drive, stop… drive home.
export function schedule(run) {
  const stops = RUNS[run==='rescue'?'market':run].stops, parts = [];
  const drive = path => parts.push({ path, ms: length(path) / SPEED * 1000 });
  drive(routeTo(stops[0]));
  stops.forEach((stop, i) => {
    parts.push({ stop, ms: STOP_TIME });
    drive(i + 1 < stops.length ? leg(stop, stops[i + 1]) : routeTo(stop).slice().reverse());
  });
  return parts;
}
export const runTime = run => schedule(run).reduce((t, p) => t + p.ms, 0);

function pointAt(path, d) {
  for (let i = 1; i < path.length; i++) {
    const s = dist(path[i - 1], path[i]);
    if (d <= s) { const k = s ? d / s : 0; return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k]; }
    d -= s;
  }
  return path.at(-1);
}
// Where a truck is and what it is doing at `now`.
export function truckAt(truck, now) {
  if (!truck.run) return { x: SITES.shelter.x, z: SITES.shelter.z, status: truck.route ? 'Waiting for 2 ⚡ to sell' : 'Parked · no route', heading: 0, progress: 0 };
  let t = now - truck.departedAt;
  const parts = schedule(truck.run), total = parts.reduce((a, p) => a + p.ms, 0);
  for (const [i, part] of parts.entries()) {
    if (t <= part.ms || i === parts.length - 1) {
      const progress = Math.min(1, Math.max(0, (now - truck.departedAt) / total));
      if (part.stop) { const s = SITES[part.stop]; return { x: s.x, z: s.z, status: truck.run==='rescue'?'Boarding evacuees':`At ${STOPS[part.stop].name}`, progress }; }
      const len = length(part.path), d = Math.min(len, Math.max(0, t) / part.ms * len), [x, z] = pointAt(part.path, d), [x2, z2] = pointAt(part.path, Math.min(len, d + .5));
      const next = parts.slice(i + 1).find(p => p.stop)?.stop;
      return { x, z, heading: Math.atan2(x2 - x, z2 - z), status: truck.run==='rescue'?(next?'Rescue · outbound':'Rescue · returning'):next ? `To ${STOPS[next].name}` : 'Returning', progress };
    }
    t -= part.ms;
  }
}

export const VERSION = 2;
export const RECRUIT = { cells:2, food:3, duration:30_000, capacity:8 };
const initialSquad=()=>({soldiers:2,training:null});
export function squadStatus(state){
  const squad=state.squad||initialSquad();
  return {...squad,bonus:Math.floor((squad.soldiers-2)/2),remaining:squad.training?Math.ceil(squad.training.remaining/1000):0,
    ready:!squad.training&&squad.soldiers<RECRUIT.capacity&&state.cells>=RECRUIT.cells&&state.food>=RECRUIT.food};
}
export function recruitSoldier(state,now){
  const s=advance(state,now);
  if(!squadStatus(s).ready)return s;
  s.cells-=RECRUIT.cells;s.food-=RECRUIT.food;s.squad.training={remaining:RECRUIT.duration};
  note(s,now,'Recruit training started. Supplies reserved; keep the crew fed.');return s;
}
export const RESCUES=[{people:6,cells:2,food:4},{people:8,cells:3,food:6},{people:10,cells:4,food:8}];
const emptyEvacuation=()=>({rescued:0,stage:0,startedAt:null,finishedAt:null});
export function rescueStatus(state){
  const mission=state.evacuation||emptyEvacuation(),request=RESCUES[mission.stage];
  const busy=state.trucks.find(t=>t.rescue||t.run==='rescue');
  return {...mission,request,busy:busy?.id||null,ready:!!request&&!busy&&state.cells>=request.cells&&state.food>=request.food};
}
// Reserve supplies immediately; the chosen truck completes its current trip,
// performs one rescue, then resumes its standing assignment.
export function dispatchRescue(state,now){
  const s=advance(state,now),status=rescueStatus(s);
  if(!status.ready)return s;
  const truck=[...s.trucks].sort((a,b)=>(a.run?a.departedAt+runTime(a.run):now)-(b.run?b.departedAt+runTime(b.run):now))[0];
  s.cells-=status.request.cells;s.food-=status.request.food;
  truck.rescue={...status.request};s.evacuation.startedAt??=now;
  note(s,now,`Rescue ${s.evacuation.stage+1}/3 assigned to Truck ${truck.id}: ${status.request.people} civilians waiting at the hospital.`);
  if(!truck.run)depart(s,truck,now);
  return s;
}
export function newEvacuation(state,now){
  const s=advance(state,now);
  if(s.evacuation.finishedAt==null||rescueStatus(s).busy)return s;
  s.evacuation=emptyEvacuation();note(s,now,'New evacuation requested. Keep the food route running.');return s;
}
export function createTrade(now) {
  return {
    version: VERSION, at: now, cells: 6, food: 8, produce: 0, eat: 0, delivered: 0,
    // route: the standing assignment (null = parked). run: the trip under way, if any.
    trucks: Array.from({ length: TRUCKS }, (_, i) => ({ id: i + 1, route: null, run: null, departedAt: 0, cargo: null, done: 0 })),
    log: [],evacuation:emptyEvacuation(),squad:initialSquad(),
  };
}

// A trip that starts at the market needs at least one pair of cells to sell; salvage trips can always go.
export const canDepart = (state, run) => !!RUNS[run] && (RUNS[run].stops[0] !== 'city' || state.cells >= 2);

// Give a truck a standing route (or null to park it after its current trip). An idle truck leaves at once.
export function setRoute(state, truckId, route, now) {
  if (route != null && !RUNS[route]) return state;
  const s = structuredClone(state), truck = s.trucks.find(t => t.id === truckId);
  if (!truck || truck.route === route) return state;
  truck.route = route;
  note(s, now, route ? `Truck ${truck.id} assigned to ${RUNS[route].label}.` : `Truck ${truck.id} will park after this trip.`);
  if (route && !truck.run) depart(s, truck, now);
  return s;
}
// Start a trip on the truck's route. Trading routes load up to four cells.
function depart(s, truck, at) {
  if(!truck.run&&truck.rescue){
    const request=truck.rescue;truck.rescue=null;
    Object.assign(truck,{run:'rescue',departedAt:at,cargo:{cells:request.cells,food:request.food,rescue:request.people,passengers:0},done:0});return;
  }
  if (!truck.route || truck.run || !canDepart(s, truck.route)) return;
  const run = truck.route, cells = loads(run) ? Math.min(LOAD, s.cells) : 0;
  s.cells -= cells;
  Object.assign(truck, { run, departedAt: at, cargo: { cells, food: 0 }, done: 0 });
}

function note(s, at, text) { s.log.push({ at, text }); if (s.log.length > 12) s.log.shift(); }

// Bring the outpost up to `now`: production, meals, and every stop or homecoming that has happened.
export function advance(state, now) {
  const s = structuredClone(state);
  s.evacuation??=emptyEvacuation();
  s.squad??=initialSquad();
  if (now - s.at > MAX_CATCH_UP) {
    const skipped=now-MAX_CATCH_UP-s.at;s.at+=skipped;
    // Suspend the skipped period consistently instead of processing ancient
    // round trips once per second and manufacturing a flood of deliveries.
    for(const truck of s.trucks)if(truck.run)truck.departedAt+=skipped;
    if(s.evacuation.startedAt!=null&&s.evacuation.finishedAt==null)s.evacuation.startedAt+=skipped;
  }
  while (s.at + STEP <= now) {
    s.at += STEP;
    if(s.squad.training&&s.food>0){
      s.squad.training.remaining-=STEP;
      if(s.squad.training.remaining<=0){
        s.squad.soldiers++;s.squad.training=null;
        note(s,s.at,`Soldier ready · convoy squad ${s.squad.soldiers}/${RECRUIT.capacity}.`);
      }
    }
    if (s.food > 0) { s.produce += STEP; if (s.produce >= PRODUCE_EVERY) { s.produce -= PRODUCE_EVERY; s.cells = Math.min(CELL_CAP, s.cells + 1); } }
    s.eat += STEP;
    if (s.eat >= EAT_EVERY) {
      s.eat -= EAT_EVERY;
      if (s.food > 0) { s.food--; if (!s.food) note(s, s.at, 'Out of food. The generator crew has stopped.'); }
    }
    for (const truck of s.trucks) { if (truck.run) arrive(s, truck, s.at); if (!truck.run) depart(s, truck, s.at); }
  }
  return s;
}
function arrive(s, truck, now) {
  const parts = schedule(truck.run);
  let t = truck.departedAt, stopIndex = 0;
  for (const part of parts) {
    t += part.ms;
    if (part.stop) {
      if (t <= now && truck.done <= stopIndex) {
        const before = truck.cargo;
        truck.cargo = truck.run==='rescue'?{cells:0,food:0,rescue:before.rescue,passengers:before.rescue}:STOPS[part.stop].act(truck.cargo); truck.done = stopIndex + 1;
        if(part.stop==='relay')truck.cargo.cells+=squadStatus(s).bonus;
        const got = truck.cargo.food - before.food, cells = truck.cargo.cells - before.cells;
        note(s, t, truck.run==='rescue'?`Truck ${truck.id}: ${truck.cargo.passengers} civilians aboard. Returning to Outpost 07.`:`Truck ${truck.id} at ${STOPS[part.stop].name}: ${got ? `traded for ${got} 🥫` : cells > 0 ? `salvaged ${cells} ⚡` : 'nothing to trade'}.`);
      }
      stopIndex++;
    }
  }
  if (t <= now) {
    const { cells, food } = truck.cargo;
    if(truck.cargo.passengers){
      s.evacuation.rescued+=truck.cargo.passengers;s.evacuation.stage++;
      note(s,t,`${truck.cargo.passengers} civilians reached shelter · ${s.evacuation.rescued}/24 rescued.`);
      if(s.evacuation.stage===RESCUES.length){s.evacuation.finishedAt=t;note(s,t,'EVACUATION COMPLETE · All 24 civilians are safe.');}
    }
    s.cells = Math.min(CELL_CAP, s.cells + cells); s.food = Math.min(FOOD_CAP, s.food + food); s.delivered += food;
    if(!truck.cargo.passengers)note(s, t, `Truck ${truck.id} is back${food || cells ? `: +${food} 🥫${cells ? `, +${cells} ⚡` : ''}` : ''}.`);
    Object.assign(truck, { run: null, departedAt: 0, cargo: null, done: 0 });
    depart(s, truck, t); // straight back out on its route, from the moment it got home
  }
}

// Seconds until the next ⚡ (null while the generator is stopped) and the next meal.
export function timers(state) {
  return { cell: state.food > 0 ? Math.ceil((PRODUCE_EVERY - state.produce) / 1000) : null, meal: Math.ceil((EAT_EVERY - state.eat) / 1000) };
}
