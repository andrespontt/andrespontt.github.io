import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLLOW_PINE, TINKERS_LOFT, planSolids, walkRects, walk, floorAt, guardSpots, inRect, wallPieces, blocksAt } from './safehouse-plans.js';
import { plan } from './city-paths.js';

const PLANS = [HOLLOW_PINE, TINKERS_LOFT];
const BODY = .26;
const clear = (boxes, [x, z], level = 0) => !walkRects(boxes, level).some(r => x > r[0] - BODY && x < r[2] + BODY && z > r[1] - BODY && z < r[3] + BODY);
// Walk a body along a planned route on one floor; true when it ends within 10 cm of the goal.
function reaches(boxes, bounds, from, to, level = 0) {
  const route = plan(from, to, walkRects(boxes, level), .28);
  if (!route.length) return false;
  const p = { x: from[0], z: from[1] };
  for (const [tx, tz] of route) for (let i = 0; i < 600; i++) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < .02) break;
    walk(p, dx / d * Math.min(d, .05), dz / d * Math.min(d, .05), boxes, bounds, { level });
  }
  return Math.hypot(p.x - to[0], p.z - to[1]) < .1;
}
// Walk through waypoints across floors and stairs (as the player does); returns where they ended up, with height.
function stroll(boxes, P, start, waypoints) {
  const p = { x: start[0], z: start[1], y: start[2] ?? 0 };
  for (const [tx, tz] of waypoints) for (let i = 0; i < 800; i++) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < .02) break;
    walk(p, dx / d * Math.min(d, .05), dz / d * Math.min(d, .05), boxes, P.bounds, { plan: P });
  }
  return p;
}
const near = (p, [x, z, y]) => Math.hypot(p.x - x, p.z - z) < .1 && (y === undefined || Math.abs(p.y - y) < .05);

test('wall pieces leave door and window openings, from the wall\'s base', () => {
  const pieces = wallPieces({ axis: 'x', at: 0, from: -3, to: 3, thick: .2, height: 2.7, openings: [[-1, 0, 0, 2.1], [1, 2, .9, 2]] });
  assert.equal(pieces.length, 6);
  assert.ok(!pieces.some(b => b[0] < -.5 && b[3] > -.5 && b[1] < 1.5 && b[4] > 1.5), 'nothing in the doorway');
  assert.ok(pieces.some(b => b[0] === 1 && b[3] === 2 && b[4] === .9), 'window sill');
  const low = wallPieces({ axis: 'z', at: 0, from: 0, to: 1, height: 4, base: -4.4 });
  assert.equal(low[0][1], -4.4); assert.ok(Math.abs(low[0][4] - -.4) < 1e-9);
});

test('a box blocks a body only on its own floor', () => {
  const sill = [0, 0, 0, 1, .9, 1], upstairs = [0, 0, 0, 1, 1, 1];
  assert.ok(blocksAt(sill, 0)); assert.ok(!blocksAt(upstairs, -4.4)); assert.ok(blocksAt([0, -4.4, 0, 1, -.3, 1], -4.4));
  assert.ok(!blocksAt([0, -4.4, 0, 1, -.3, 1], 0), 'downstairs walls do not block the floor above');
});

for (const P of PLANS) {
  const solids = planSolids(P);
  const doors = [...(P.door ? [P.door.closed] : []), ...(P.bookcase ? [[P.bookcase.x0, 0, P.bookcase.z0, P.bookcase.x1, P.bookcase.height, P.bookcase.z1]] : [])];
  const shut = [...solids, ...doors];

  test(`${P.id}: everyone who stands stands clear of walls and furniture, inside the bounds`, () => {
    for (const { id, at, y } of guardSpots(P)) {
      const person = P.guards.find(g => g.id === id);
      if (person.seat && at === person.seat && !person.alert) continue; // tied to the chair
      if (person.role === 'prisoner') continue;
      assert.ok(clear(shut, at, y), `${P.id} ${id} at ${at} overlaps a solid`);
      assert.ok(at[0] > P.bounds[0] && at[0] < P.bounds[2] && at[1] > P.bounds[1] && at[1] < P.bounds[3], `${at} out of bounds`);
    }
  });

  test(`${P.id}: patrol legs and every run to an alert spot and back are walkable on their own floor`, () => {
    for (const g of P.guards) {
      const level = g.y ?? 0;
      if (g.route) g.route.forEach((stop, i) => {
        const next = g.route[(i + 1) % g.route.length];
        assert.ok(reaches(shut, P.bounds, stop.at, next.at, level), `${g.id} cannot walk ${stop.at} → ${next.at}`);
      });
      const home = g.route ? g.route[0].at : g.at;
      if (g.alert && g.alert.at.join() !== home.join()) {
        assert.ok(reaches(shut, P.bounds, home, g.alert.at, level), `${g.id} cannot reach the alert spot`);
        assert.ok(reaches(shut, P.bounds, g.alert.at, home, level), `${g.id} cannot get back from the alert spot`);
      }
    }
  });

  test(`${P.id}: there is an interrogation room with a prisoner and an interrogator, and a guest with a bed`, () => {
    const prisoner = P.guards.find(g => g.role === 'prisoner'), interrogator = P.guards.find(g => g.duty === 'interrogate');
    assert.ok(prisoner && interrogator);
    assert.ok(inRect(P.rooms.interrogation, prisoner.seat.x, prisoner.seat.z) && inRect(P.rooms.interrogation, ...interrogator.at));
    assert.equal(prisoner.y ?? 0, interrogator.y ?? 0);
    const guest = P.guards.find(g => g.role === 'guest');
    assert.ok(guest && (guest.bed || guest.seat));
    const bed = P.furniture.find(f => f.id === 'guestBed').box, spot = guest.bed || guest.seat;
    assert.ok(Math.hypot(spot.x - (bed[0] + bed[3]) / 2, spot.z - (bed[2] + bed[5]) / 2) < 1.5, 'the guest is at their bed');
  });
}

test('Hollow Pine: the front door opens onto the porch and shuts it off when closed', () => {
  const P = HOLLOW_PINE, solids = planSolids(P), inside = [-2.05, 3.4], porch = [-2.05, 6.6];
  assert.ok(reaches([...solids, P.door.open], P.bounds, inside, porch), 'open door lets you out');
  assert.ok(!reaches([...solids, P.door.closed], P.bounds, inside, porch), 'closed door keeps you in');
  assert.ok(clear([P.door.open], [-2.05, 3.55]));
  assert.ok(!reaches([...solids, P.door.closed], P.bounds, [0, 3.6], [0, 5.2]), 'no climbing out of a window');
});

test('Hollow Pine: the east wing is reached through the bunk room and the radio room only', () => {
  const P = HOLLOW_PINE, solids = [...planSolids(P), P.door.closed];
  assert.ok(reaches(solids, P.bounds, [-2, 1], [9.5, -3.5]), 'great room to the interrogation room');
  assert.ok(reaches(solids, P.bounds, [-2, 1], [8, 2.4]), 'great room to the guest room');
  // No door between the guest and the prisoner: the way round goes back through the great room.
  assert.ok(!P.walls.find(w => w.axis === 'x' && w.at === -.5).openings);
  assert.ok(plan([8, 2.4], [8, -3.5], walkRects(solids), .28).some(([x]) => x < 1));
  assert.ok(!reaches(solids, P.bounds, [8, 2.4], [8, 6]), 'the guest room has no way outside');
});

test('Hollow Pine: the cellar hatch is in the radio room and clear of furniture', () => {
  const P = HOLLOW_PINE, [x0, z0, x1, z1] = P.hatch;
  for (const f of P.furniture) assert.ok(f.box[3] <= x0 || f.box[0] >= x1 || f.box[5] <= z0 || f.box[2] >= z1, `${f.id} over the hatch`);
  assert.ok(x0 > 1.08 && x1 < 5.7 && z0 > .08 && z1 < 4.2);
});

test('Tinker\'s Loft: floors, the stairs and the street have the right heights', () => {
  const P = TINKERS_LOFT;
  assert.equal(floorAt(P, 0, 2, 0), 0, 'the flat');
  assert.equal(floorAt(P, 0, 2, -4.4), -4.4, 'the shop under it');
  assert.equal(floorAt(P, 0, 5.5, -4.4), -4.25, 'pavement');
  assert.equal(floorAt(P, 0, -7, 0), 0, 'roof terrace');
  assert.ok(Math.abs(floorAt(P, -5.6, -1.6, -2) - -2.2) < .01, 'halfway up the stairs');
  assert.equal(floorAt(P, -5.6, -3.9, 0) < 0 && floorAt(P, -5.6, -3.9, 0) > -.45, true, 'the top step is a small step down');
});

test('Tinker\'s Loft: you can go down the stairs, out of the street door and back up, past the guards on post', () => {
  // People standing at their posts are in the way too (as the game treats them): body-sized boxes on their floor.
  const P = TINKERS_LOFT, solids = [...planSolids(P), ...P.guards.filter(g => !g.seat && !g.bed && !g.route).map(g => [g.at[0] - .22, g.y ?? 0, g.at[1] - .22, g.at[0] + .22, (g.y ?? 0) + 1.8, g.at[1] + .22])];
  const down = [[-3.75, .4], [-4.6, -3.9], [-5.6, -3.9], [-5.6, 3.6], [-5.6, 5.4], [2, 10]];
  const street = stroll([...solids, P.door.open], P, [0, 2.6, 0], down);
  assert.ok(near(street, [2, 10, -4.4]), `ended at ${JSON.stringify(street)}`);
  const home = stroll([...solids, P.door.open], P, [2, 10, -4.4], [[-5.6, 5.4], [-5.6, 3.6], [-5.6, -3.9], [-4.6, -3.9], [-3.75, .4], [0, 2.6]]);
  assert.ok(near(home, [0, 2.6, 0]), `back upstairs at ${JSON.stringify(home)}`);
  const locked = stroll([...solids, P.door.closed], P, [0, 2.6, 0], down);
  assert.ok(locked.z < 4.5, 'the closed street door keeps you in');
  // Nobody falls through the stairwell: its rails turn you back except at the top step.
  const rail = stroll(solids, P, [-4.4, -2, 0], [[-5.6, -2]]);
  assert.ok(rail.x > -4.9 && rail.y === 0);
});

test('Tinker\'s Loft: the shop and workshop downstairs are joined to the stairs', () => {
  const P = TINKERS_LOFT, solids = planSolids(P);
  const p = stroll(solids, P, [-5.6, 3.6, -4.4], [[-5.6, 3.4], [-4.3, 3.4], [-2.5, 2.8], [3.1, 1.2], [3.1, .1], [4.4, -2.2]]);
  assert.ok(near(p, [4.4, -2.2, -4.4]), `ended at ${JSON.stringify(p)}`);
});

test('Tinker\'s Loft: the hidden room is reached only through the moved bookcase', () => {
  const P = TINKERS_LOFT, solids = planSolids(P), b = P.bookcase, front = [4.15, 2.4], radio = P.guards.find(g => g.id === 'vesna').at;
  const shut = [...solids, [b.x0, 0, b.z0, b.x1, b.height, b.z1]], open = [...solids, [b.x0 + b.slide, 0, b.z0, b.x1 + b.slide, b.height, b.z1]];
  assert.ok(!reaches(shut, P.bounds, front, radio), 'closed bookcase hides the room');
  assert.ok(reaches(open, P.bounds, front, radio), 'open bookcase lets you in');
  assert.ok(open.at(-1)[3] <= 6.2, 'slid bookcase stays inside the room');
});

test('Tinker\'s Loft: the back door leads to the roof terrace, closed in by its parapet', () => {
  const P = TINKERS_LOFT, solids = planSolids(P);
  assert.ok(reaches(solids, P.bounds, [0, 2.6], [0, -7]));
  assert.ok(inRect(P.terrace, 0, -7));
  assert.ok(!reaches(solids, P.bounds, [0, -7], [5, -7]));
});

test('Veyr Transport: staff-only rear, basement guards and stairs connect both floors', async()=>{
 const {VEYR_TRANSPORT:P}=await import('./safehouse-plans.js');
 const boxes=planSolids(P);
 for(const g of P.guards.filter(g=>g.role!=='visitor')){assert.ok(clear(boxes,g.at,g.y??0),g.id+' has a clear post');assert.ok((g.y??0)<0||g.at[1]<0,'guards stay out of reception');}
 const route=[[1.5,-2.8],[-3.6,-2.8],[-3.6,-4.4],[-5.4,-4.4],[-5.4,2.8],[-2,2.8]];
 const down=stroll(boxes,P,[1.5,3,0],route);assert.ok(near(down,[-2,2.8,-3.2]),JSON.stringify(down));
 const up=stroll(boxes,P,[-2,2.8,-3.2],[[ -5.4,2.8],[-5.4,-4.4],[-3.6,-4.4],[-3.6,-2.8],[1.5,-2.8],[1.5,3]]);
 assert.ok(near(up,[1.5,3,0]),JSON.stringify(up));
 const shut=stroll([...boxes,[.8,0,-.06,2.2,2.35,.06]],P,[1.5,2,0],[[1.5,-2]]);
 assert.ok(shut.z>0,'closed staff door prevents public access');
});

test('Veyr garage shutters block closed bays and clear full-height vehicle access when raised',async()=>{
 const {VEYR_TRANSPORT:P}=await import('./safehouse-plans.js');const fixed=planSolids(P);
 for(const d of P.garageDoors){
  assert.ok(d.width>=4&&d.height>=2.8);
  const x=d.x+d.width/2;
  const shut=[d.x,0,d.z-.1,d.x+d.width,d.height,d.z+.1];
  const raised=[d.x,3.05,d.z-.1,d.x+d.width,3.05+d.height,d.z+.1];
  assert.ok(stroll([...fixed,shut],P,[x,6.4,0],[[x,2]]).z>d.z);
  assert.ok(reaches([...fixed,raised],P.bounds,[x,6.4],[x,2]));
 }
 assert.ok(!reaches(fixed,P.bounds,[-12,6],[-12,2]),'neighboring shop is solid');
});

test('expanded transport safehouse has four soldiers, two operators and connected private rooms',async()=>{
 const {VEYR_TRANSPORT:P}=await import('./safehouse-plans.js');const boxes=planSolids(P);
 assert.equal(P.guards.filter(g=>g.uniform).length,4);
 assert.equal(P.guards.filter(g=>g.role==='operator'&&g.seat).length,2);
 assert.equal(floorAt(P,15,-7,0),0,'the yard above the extended basement remains at ground level');
 assert.equal(floorAt(P,15,-7,-3.2),-3.2,'the room beneath has its own floor');
 assert.ok(reaches(boxes,P.bounds,[8,-3.05],[3.5,-3.05]),'garage connects to rear dispatch');
 assert.ok(stroll([...boxes,[6.33,0,-3.8,6.47,2.4,-2.3]],P,[8,-3.05,0],[[3.5,-3.05]]).x>6.4,'closed access door blocks the connection');
 assert.ok(reaches(boxes,P.bounds,[-2,2.8],[11.7,-4],-3.2),'basement reaches interview door');
 assert.ok(reaches(boxes,P.bounds,[-2,2.8],[4.5,-6],-3.2),'operators have a reachable aisle');
 assert.ok(reaches(boxes,P.bounds,[-2,2.8],[12,3.2],-3.2),'coffee counter and lockers leave the south aisle clear');
 assert.ok(reaches(boxes,P.bounds,[-2,2.8],[7,-7],-3.2),'server cabinets do not block the operations area');
 const wall=P.walls.find(w=>w.base===-3.2&&w.at===-3);
 assert.ok(wall.openings.some(o=>o[2]>0),'interview room has observation glazing');
});

test('Veyr basement: walking beside or under the stairs never lifts you to another floor', async()=>{
 const {VEYR_TRANSPORT:P}=await import('./safehouse-plans.js');const boxes=planSolids(P);
 // Westward from the basement into the stairwell: under its top, middle and foot.
 for(const z of [-4.2,-2,1.5]){
  const p=stroll(boxes,P,[-3.6,z,-3.2],[[-5.6,z]]);
  assert.ok(Math.abs(p.y+3.2)<.01&&p.x>-4.4,`z=${z}: stayed on the basement floor at ${JSON.stringify(p)}`);
 }
 // From the north, along the west wall, toward the space under the top steps.
 const north=stroll(boxes,P,[-5.4,-6,-3.2],[[-5.4,-3]]);
 assert.ok(Math.abs(north.y+3.2)<.01&&north.z<-4.4,JSON.stringify(north));
});

test('Veyr reception: the visitor walks his loop in the public room and never needs the staff door', async()=>{
 const {VEYR_TRANSPORT:P}=await import('./safehouse-plans.js');
 // The scene also places the clerk's chair and the side table, and keeps the staff door shut.
 const boxes=[...planSolids(P),[-2.62,0,.28,-1.98,1.06,.92],[5.1,0,.35,5.8,.5,.95],[.8,0,-.06,2.2,2.35,.06]];
 const visitor=P.guards.find(g=>g.id==='tomas');
 assert.ok(visitor.route.length>=3&&visitor.model);
 visitor.route.forEach((stop,i)=>{
  const next=visitor.route[(i+1)%visitor.route.length];
  assert.ok(clear(boxes,stop.at),`stop ${stop.at} is clear`);
  assert.ok(stop.at[1]>0,'stays in reception');
  assert.ok(reaches(boxes,P.bounds,stop.at,next.at),`${stop.at} → ${next.at}`);
 });
});
