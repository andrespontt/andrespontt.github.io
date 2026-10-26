# Dev scenarios

A sandbox for trying animation, physics and easing ideas before they go into the
game. Tap **Dev scenarios →** on the overview to open the menu, then pick one.
Each scenario loads on its own, and the address changes to `bunker.html?dev=<id>`
(for example `?dev=perimeter`), so refreshing reloads that scenario.
`?dev` alone opens the menu.

- **Scenarios menu** (top right) switches scenario; **Return outside** leaves.
- **E** / the action button runs the scenario's action from anywhere.
- Tools: **1** restart, **2** 0.25× slow motion, **3** freeze.
- Scenarios can add mode buttons (`modes: [...]` + `setMode(name)`); Perimeter has four.
- Sound: tap **Sound** first. Areas get `env.audio` and `env.listener`; see `sound.js`.
- **N** cycles the weather (the rope scenario uses it as wind).

## Scenarios

| File | What it shows | E does |
|------|---------------|--------|
| `perimeter.js` | Fenced ruin with 10 soldiers. Modes (buttons 4-7): **Patrol** (routes, corner scans, queueing), **Alert** (jog), **Take cover** (hostiles fire from the east rocks; soldiers sprint around the building to barriers/crates and crouch), **Firefight** (they pop up, shoulder rifles with IK and fire bursts: flashes, tracers, dust, panned gunshots delayed by distance) | Next mode |
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
