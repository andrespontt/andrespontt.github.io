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
