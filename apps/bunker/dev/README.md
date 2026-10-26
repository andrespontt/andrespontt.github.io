# Dev scenarios

A sandbox for trying animation, physics and easing ideas before they go into the
game. Tap **Dev scenarios →** on the overview to open the menu, then pick one.
Each scenario loads on its own, and the address changes to `bunker.html?dev=<id>`
(for example `?dev=city`), so refreshing reloads that scenario.
`?dev` alone opens the menu.

- **Scenarios menu** (top right) switches scenario; **Return outside** leaves.
- **E** / the action button runs the scenario's action from anywhere.
- Open **Scenario controls** for views, modes, restart, slow motion and freeze. Shortcuts match the numbered buttons; City uses **1–5** for views, **6** restart, **7** slow motion, **8** freeze.
- Scenarios can add mode buttons (`modes: [...]` + `setMode(name)`); City has five.
- Sound: tap **Sound** first. Areas get `env.audio` and `env.listener`; see `sound.js`.
- **N** cycles the weather (the rope scenario uses it as wind).

## Scenarios

| File | What it shows | E does |
|------|---------------|--------|
| `city.js` | Night city and corner market: Patrol, Alert, Take cover, Firefight, and Intruders. Four camera views, cutaway overhead, solid walls and cover, line-of-sight combat, recurring intruder waves and operation status. | Next mode |
| `locomotion.js` | Soldier circling a track; idle/walk/run blend and clip rate follow ground speed | Next gait |
| `start-stop.js` | Sprint between marks; position eased per leg, eased 180° turn | Next speed curve |
| `aim.js` | Body yaw on a critically damped spring, two-bone IK arms on an aim line, laser | Raise / lower weapon (IK weight eases) |
| `jump.js` | Run-up and ballistic jump over a crate, predicted arc | Earth / Mars / Moon gravity |
| `balls.js` | Spheres with gravity, restitution, friction, sphere-sphere impulses (fixed 120 Hz steps) | Fire 8 balls |
| `rope.js` | Verlet rope with weighted end, wind from weather | Kick the weight |
| `easing-lanes.js` | Every function in `easing.js` side by side | Change duration |

## Adding one

Create `scenarios/<name>.js` and add it to `scenarios/index.js`:

```js
import * as THREE from 'three';
export default {
  id: 'my-test',
  title: 'My test',
  summary: 'One line for the menu',
  yaw: 0,                      // optional: rotate the contents
  viewWidth: 11, eyeHeight: 1.7, // optional: framing for wide scenarios; noPad: true hides the floor disc
  create({ group, soldier, label }) {
    // group:   THREE.Group at the pad centre; add everything here.
    // soldier: () => { model, mixer, actions, setSpeed(mps) } (Idle/Walk/Run/TPose clips)
    // label:   (text, { width, lines }) => mesh, with mesh.userData.set(text); faces the viewer
    return {
      update(dt, { weather, position }) {},  // dt already includes slow-mo/freeze
      interaction: () => ({ label: 'Do thing', action() {} }), // optional
      dispose() {},                            // optional, non-Three cleanup
    };
  },
};
```

Shared helpers: `kit.js` (soldier factory, `GAIT` speeds, `facing()`, labels),
`easing.js` (easings, `damp`, `spring`, `angleDelta`), `../rig.js` (`solveTwoBone`,
`aimBone`, `placeHips`). A scenario that throws is logged and marked ERROR on its
title without breaking the rest. `tools/serve-bunker.cjs` serves any `.js` file
in this folder, so new files need no allowlist change.

## City controls

Use WASD or the touch stick to walk; mouse-look or drag to look. In Street, Inside store or Alley view, hold the fire button or press F to shoot. Overhead is observation only. Walls, vehicles and fixtures block movement and shots; doors and window openings remain clear. City starts inside the store in first person; Reset view restores that position. Choose Overhead in Scenario controls for observation. Freeze disables firing and pauses the scenario; the scenarios menu also pauses simulation.

Collision regression checks: `node --test apps/bunker/dev/city-space.test.mjs`.

City begins in Patrol with a five-second preparation countdown, then starts Intruders automatically. Choosing a mode manually cancels the countdown. Subsequent waves wait until every intruder is down, followed by a six-second break. Wounded intruders remain in combat; hits use neutral dust effects without blood. Freeze and pause also pause the countdown.

Intruders enter only from the west, east and south streets (three per wave). Soldiers occupy assigned cover during the wave, crouch between targets, and return to patrol after all three are down. Game touch gestures suppress page zoom while retaining joystick/look input and vertical menu scrolling.

**Drone** (view 5) circles the city block from above. Use **Hold drone orbit** to stop/resume its camera without stopping combat. **Inside store** (view 3) or **Reset view** returns to first person. Pause and Freeze stop both combat and the drone orbit.

**Intruders** come in growing waves (12, then +4 per wave, up to 24) against 5 soldiers over three streets, in side-by-side lanes that keep them apart. They move cover to cover, crouch, pop up to fire pistols (poor accuracy), duck when rounds land close, and shoot at soldiers or at you. Muzzle flashes light the street and give the shooter away at long range. The two soldiers inside fight from the window slits and duck below the sill between bursts.

The **VIP** (unarmed, dark suit) paces the centre aisle and runs to the storeroom crates when shooting starts, staying down until it has been quiet for 3 seconds. The status shows if you hit them.

Store windows start intact and shatter when any round passes through. Fog sits beyond the intruder spawns so the street seems to continue.

**Phones:** inside an area only the status, **Debug**, **☰ Menu**, joystick and fire button stay on screen; views, modes, sound, pause and locations are in the menu. **Debug** shows FPS, position, heading (north is −Z) and draw stats, and closes with ✕.
