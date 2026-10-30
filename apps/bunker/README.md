# Bunker — The long winter

An unoccupied, first-person expedition/shelter proof of concept using Apartment's
local Three.js ES-module stack. No install, build, CDN, or remote assets required.

## Run

- Local: `node tools/serve-bunker.cjs`
- Wi-Fi: `node tools/serve-bunker.cjs 192.168.1.162` (use the computer's current LAN IP)
- Open `http://127.0.0.1:8002/apps/bunker.html`, or the LAN host on port 8002.

The server exposes only an explicit allowlist of game runtime files.

## Explore

The overview offers **Enter bunker**, **Board Nomad**, and **Walk the snowfield**.
Walking up to a surface entrance also offers an **E** transition. Interior exit
hatches return to the matching surface entrance. Return outside is also available
from the cursor menu. Overview returns to weather controls without reloading.

- WASD / arrow keys: move. Mouse: look. E: interact.
- N (or the Weather button): cycle weather from inside any area.
- Tab: toggle cursor. Escape: release cursor; it does not exit the area.
- Touch: hold direction buttons and drag the scene to look.
- Pause silences audio and stops movement/area animation.
- Scene info is an optional diagnostics disclosure, including active area,
  renderer allocation counts and last disposed-resource counts.

Pointer lock is used when the browser supports it. Embedded browsers without it
use viewport-limited mouse-look. Native pointer capture must be tested in a
browser that supports that API; mobile hardware/audio were not verified.

## Protectorate (game loop)

Outpost 07 protects nearby settlements. In return their own trucks bring supplies and their volunteers can be
trained as soldiers. Raiders attack settlements; a lost settlement is occupied until you liberate it.

Protect → receive supplies → recruit → train → deploy → defend → expand. When protection fails: attacked →
soldiers lost → occupied → deliveries stop → liberation → protected again.

Play it on the situation terminal's **command desk**: M, T, the operations workstation (E) or the **Command**
button (Menu → Location on phones). A first-time player is taken there on entering the bunker. Address:
`?at=command` (`?at=trucks` still works).

| Start | |
|---|---|
| Soldiers | 500 available, training capacity 250 |
| Resources | 5,000 food, 2,500 metal, 1,000 components, 5,000 fuel |

| Settlement | Population | Delivers | Recommended garrison | Volunteers | Start |
|---|---:|---|---:|---:|---|
| Millbrook | 7500 | 1500 food | 250 | 200 | Protected |
| Greyvein | 20000 | 1000 metal | 300 | 400 | Protected |
| Ironford | 45000 | 750 components | 400 | 600 | Neutral |
| Greenhaven | 12000 | 1800 food | 200 | 300 | Neutral |
| Stonebridge | 18000 | 1200 metal | 250 | 350 | Neutral |
| Ember Junction | 24000 | 1000 fuel | 300 | 400 | Neutral |
| Westhaven | 32000 | 900 components | 350 | 500 | Neutral |
| Lakewatch | 16000 | 1500 food | 250 | 300 | Neutral |

**Time.** One game day is 60 s at 1×; the desk has Pause, 1× and 3×. Game time runs only while the page is open
and visible and the game is not paused (there is no offline catch-up). An attack drops 3× back to 1×.

**Settlements.** Assign soldiers (they leave the bunker at once and join the garrison on arrival, 12–30 s) or recall
them (back after the same trip). Under-protecting is allowed but invites raids. Each protected settlement sends its
own supply truck every 2 days; you never dispatch it. Trucks are visible on the map: tap one for origin, cargo,
destination and ETA. An attacked settlement holds its next truck; a truck already on the road always finishes.

**Orders in groups.** Soldiers and volunteers are ordered in groups of 50: −50 / +50 step to the previous or next
multiple of 50 and **All** takes everyone available (an odd remainder, such as 213 survivors, is still sent whole with
All). Map markers are whole formations.

**Recruit and train.** Recruit volunteers from protected settlements (pools refill by 50 every 2 days, daily at
confidence ≥ 70%); the Military tab lists only the towns you can recruit from and names the others with the reason.
Drifters also reach the bunker on their own, even with every town occupied: the bunker pool starts at 50 and gains
50 every 3 days (days 4, 7, 10…), up to 150; **Enlist** turns them into recruits. Start training moves recruits into the training center (capacity 250): each is issued 3 metal and
1 component and eats 2 food per training day; training takes 3 days and pauses without food. Soldiers eat 0.5 food
a day each. Each departure from the bunker costs 100 fuel (with empty tanks soldiers march, 1.5× slower).

**Attacks.** The first raid hits Greyvein on day 5 (450 hostiles). From day 7 a midnight check may raid a protected
settlement: more likely when its garrison is below the recommended size, never twice within 2 days anywhere or
4 days at the same place. Random raids grow by 50 hostiles every 8 days. A priority alert gives 40 s before the fight: **send reinforcements** (only those that
arrive in time fight), **hold position**, or **order retreat** (about a fifth of the garrison is lost covering the
withdrawal; the settlement is given up).

**Combat.** Each side's strength is its head count × a 0.8–1.2 roll; whoever holds the settlement fights from cover
(×1.25). The stronger side wins. Winners lose up to 35% in a close fight, few in a rout; losers lose 30–70% and the
survivors fall back to the bunker. Deaths are permanent. A combat report shows the outcome.

**Occupation and liberation.** An occupied settlement stops deliveries and recruiting, and its hostile garrison
grows by 50 every 3 days (up to 1,200). Launch a liberation force from the Operations tab (the desk shows success chance and
risk). Success clears it; the survivors stay as its garrison and deliveries resume on the next cycle. Failure
brings the survivors home and weakens the enemy for the next attempt.

**Expansion.** The six neutral towns talk once you have repelled an attack or liberated a settlement: send at least
150 soldiers to sign a protection agreement; they stay as its first garrison. Ember Junction is the only town that
supplies fuel.

The rules are in `protectorate.mjs` (pure functions, seeded random events, fixed 250 ms steps, so the same
orders give the same game); `command.js` renders the desk; `terminal.js` draws settlements, trucks and troop
movements on the map; a label that would cover another marker, label or map control moves to another side of its
icon, or hides until its marker is selected. Saved in `localStorage` (`bunker-protectorate`, version 2); a version 1
save (the original 10-soldier scale) is multiplied by 50, keeps its progress and gains the five new towns, neutral.
**New campaign** in the Log tab starts over. Tests: `node --test apps/bunker/protectorate.test.mjs` (soldier accounting, deliveries, training,
combat, occupation, liberation, agreements, and a full scripted playthrough).

## Areas

- **Snowfield:** four snowy weather modes, orbit overview, walking, bunker and
  vehicle entrances, vehicle and bunker collision.
- **Nomad:** walkable crew aisle, operations desk, galley, empty bunks, two
  rigged and seated cockpit drivers, lockers and private rear quarters with a
  sliding door. Signs and furnishings distinguish each section. Windows use a
  lightweight local snowy backdrop.
- **Bunker:** separate shelter with airlock, operations, empty crew berths,
  medical cot, mess, galley and generator/water area. The lighting switch near
  the entrance toggles main/emergency lighting.

The cockpit crew is static, posed with two-bone IK (`rig.js`) onto the seats,
wheels and pedals.

## Dev scenarios

`bunker.html?dev` opens a sandbox of soldier animation, easing and physics
samples. See [dev/README.md](dev/README.md) to add more. Enemies, driving, missions and networked game state
are not implemented.
Monitor feeds are decorative graphics. Wind/visibility readings are artistic
preset labels, not a physical weather simulation.

## Loading architecture

`game.js` owns the single renderer, camera, input, audio, HUD and transition screen.
`area-manager.mjs` dynamically imports the destination's module and calls its
factory. After successful construction, the previous scene's unique geometries,
materials and textures are disposed, its graph is cleared, and renderer lists
are cleared. Only the current area remains owned and updated. There is a brief
construction overlap during a transition to allow a failed load to preserve the
working area. Browser module code stays cached; this is not a page navigation.

Small snapshots preserve the private door and bunker lighting between visits.
State is in memory for this page session; reloading starts fresh. Weather belongs
to the shell and survives area transitions. No entire inactive scene is retained.

See [AREA-CONTRACT.md](AREA-CONTRACT.md) for adding another area.

## Verification

Run:

```
node --test apps/bunker/area-manager.test.mjs apps/bunker/movement.test.mjs apps/bunker/areas/bunker-movement.test.mjs apps/bunker/protectorate.test.mjs
```

Tests cover lazy loading, failed imports, overlapping transitions, restored state,
shared-resource disposal, door/wall/furniture collision and reachable bunker rooms.

Browser pass: outside → bunker → outside → bunker → outside → vehicle → outside
→ vehicle; walked into operations; toggled and restored bunker lighting; opened
private door and verified it stayed open on return. GPU counts were stable on
repeated visits (bunker: 17 geometries/15 textures; vehicle: 21/16 in the tested
views), with disposal reported for the prior area. Desktop and 390×844 controls
were visually checked. No console errors or warnings observed. These counts are
not a frame-rate benchmark and may vary by visible scene content.

## Addresses

Every place has its own address, so a refresh returns there:

| Address | Place |
|---|---|
| `bunker.html` | Overview (landing) |
| `?at=snowfield` | On foot outside |
| `?at=nomad` | Nomad crew compartment |
| `?at=bunker` | Bunker situation room |
| `?at=map` | Situation room with the map open |
| `?at=command` | Situation room with the command desk open (`?at=trucks` also works) |
| `?at=city` (`&view=drone`, `street`, `inside-store`…) | City operation, Kestrel Falls |
| `?dev=<id>`, `?dev` | Other dev scenarios, scenarios menu |

The map in the bunker shows Kestrel Falls, the closest city (38 km SW, sleet rather than snow). Its card shows the
operation status the City scenario last reported, and **Drone feed** opens the operation in the drone view behind a
"Connecting to drone…" screen (`&from=map`); leaving the feed returns to the command center.

## Kestrel Falls operation (off-screen)

`city-ops.mjs` simulates the city operation in 10-second ticks of real time: a quiet start, the ambush, waves
(five groups of 10–16 intruders, 50–80 a wave), intruders going down, wounded soldiers, breaches and the VIP, with a 30-entry log.
`city-store.js` keeps it in the browser's IndexedDB (`bunker` database, `operations` store; memory if storage is
blocked), so it carries on between visits: on load it catches up on up to six hours. The bunker map reads it live
(status line, last three log entries; the marker pulses only during contact). While the drone feed is open the 3D
scene is the operation: it reports every 2 s, joins a wave already under way with only the intruders still
fighting, and the off-screen ticks pause until 15 s after the last report.
Tests: `node --test apps/bunker/city-ops.test.mjs`.

The operation starts when the game opens (first ambush ~90 s after the cordon goes up) and runs whether or not
the map or feed is open. In the command center a strip shows its status and each new event (tap it for the map),
and the wall map rings the city during contact. Only the drone feed is linked to it: the City opened from the
scenarios menu (`?dev=city`, or `?at=city` without `&from=map`) always starts from zero and leaves it alone.

**Outpost 07 command** (made-up figures, stored with the operation): 500 personnel, 5 of them in Kestrel Falls;
120,000 rifle rounds, 18,000 L diesel, 45,000 meals, 600 med kits, 14 vehicles, 3 drones. Rations and diesel run
down with time (1,500 meals and 900 L a day); contact costs ammunition (the drone feed charges the rounds it
actually fired); each wounded soldier uses two med kits and is replaced from the outpost. These figures belong to the
city operation's own simulation; the command desk's soldiers and resources are the separate protectorate game.

## Regional map

The command survey covers **20 × 11 km**. Kestrel Falls has a 3 × 6 layout of eighteen named districts, each the
size of the original 24-block neighborhood (432 blocks total). District 01 retains the market, drone and
conflict marker; the other districts extend east and south. The City button fits all eighteen districts, and
Fit sector restores the whole mountain/valley survey. The eight settlements are drawn on the survey with their roads,
all starting at the bunker: Millbrook and Westhaven down the farm track (south-west), Stonebridge on a branch west
of it, Greenhaven to the south, Greyvein and Ember Junction past Relay 03, Ironford and Lakewatch along the valley
road east. The wall map shows them in their status colours. Buildings use one instanced draw call. This enlarges
the strategic map and wall survey; the separate first-person combat scene still covers the market block.

Campaign expansion: 500 starting soldiers; a 50,000 standing-force limit includes deployed troops and reserved training slots. Neutral towns can request free protection from day 3. Occupied towns can rebel from day 5 of occupation and request protection after driving out their occupiers. Accept offers in Settlements.

The strategic city now has 18 districts (432 buildings), twice its previous area; the first-person market scenario is unchanged. Businesses tab: six properties, a starting treasury of 5,000, one-time purchases, and daily income at midnight. Saves migrate without resetting existing progress.


The Veyr river marks the eastern border, with North, Central and South crossings. Beyond it lie Drakenburg (18 districts and 432 map buildings, using the same street and block pattern as Kestrel Falls) and Frostford, Ironhollow, Redhaven and Ashgate. Select their map markers for intelligence and bridge-based routes; East focuses this region. These are strategic survey locations, not additional playable city scenes.
