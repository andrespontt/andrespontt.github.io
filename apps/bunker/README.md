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
node --test apps/bunker/area-manager.test.mjs apps/bunker/movement.test.mjs apps/bunker/areas/bunker-movement.test.mjs
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
| `?at=city` (`&view=drone`, `street`, `inside-store`…) | City operation, Kestrel Falls |
| `?dev=<id>`, `?dev` | Other dev scenarios, scenarios menu |

The map in the bunker shows Kestrel Falls, the closest city (38 km SW, sleet rather than snow). Its card shows the
operation status the City scenario last reported, and **Drone feed** opens the operation in the drone view behind a
"Connecting to drone…" screen (`&from=map`); leaving the feed returns to the command center.

## Kestrel Falls operation (off-screen)

`city-ops.mjs` simulates the city operation in 10-second ticks of real time: a quiet start, the ambush, waves
(12, +4 each, up to 24), intruders going down, wounded soldiers, breaches and the VIP, with a 30-entry log.
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
actually fired); each wounded soldier uses two med kits and is replaced from the outpost. Shown under **Forces**
on the map; the map and wall also carry a Kestrel Falls inset, since the city is off the mountain survey.
