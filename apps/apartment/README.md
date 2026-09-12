# Apartment

A first-person, low-poly suspense sandbox. A canceled birthday clown waits outside
on a rainy night. Two bodyguards hold the entrance; stay close to them to remain protected.
Explore, inspect the birthday card, sit, rest, switch the TV, take repellent, talk
to the guards, and call the security phone to bring the night to a peaceful end.

## Run

Serve the repository with any static HTTP server and open `/apps/apartment.html`.
No install or build step is required. ES modules need HTTP rather than `file://`.
All runtime assets are local, including Three.js. The service worker caches the
apartment for subsequent offline visits.

## Controls

- WASD / arrow keys: walk; mouse or drag: look.
- E: interact with the object in the center of the view, or stand up.
- Shift: run; Space: jump; C: toggle crouch; F: use equipped repellent.
- Escape or the pause button: pause. Sound can be toggled from the menu.
- Touch: left joystick, right look area, contextual interaction and action buttons.

## Implementation

- `../apartment.html`: semantic menu and HUD.
- `style.css`: responsive presentation and touch controls.
- `world.js`: procedural apartment, furniture, street, character views and rain.
- `simulation.js`: game state, kinematic movement, floor-plan collision and clown rules.
- `game.js`: renderer, input, targeting, audio, interactions and animation.
- `../apartment-sw.js`: network-first cache restricted to this application's assets.

The rebuild concentrates the original sprawling house in a single-floor apartment.
The canceled-booking premise, protected exploration, furnished rooms, storm,
clown encounters and security call remain the central experience. Backup arrives
by van; guards protect within 2.8 metres and need a clear path. Their escort speed is limited. The clown can catch an unprotected player, including inside an open entrance; the caught screen offers a fresh retry.

## Verification

Run `node apps/apartment/simulation.test.mjs` from the repository root. The checks
cover spawn clearance, closed/open entrance movement, wall tunnelling, room names,
clown retreat, the secure ending, and reachable unobstructed interaction points
for every indoor target using the actual generated scene.

Browser checks: scene startup, desktop and 390 × 844 layouts, help disclosure,
pause/resume, crouch input, and the unequipped repellent hint. Physical touch and
audio output should also be checked on a device when tuning the experience.

## Character assets

`characters.js` authors the original guards and clown as reusable, articulated
Three.js models. These are procedural meshes, not downloaded GLB files. Each
character merges its coloured surfaces into eight body-part meshes, sharing one
material. The two guards have different skin, hair and suit colours. Idle motion,
walking, radio gestures and the clown's head tilt are render-only animation.

Open `/apps/apartment/characters.html` for the model studio (drag to rotate, scroll
to zoom, and toggle the walking preview). The models are self-contained and do
not require remote assets, textures or an additional runtime dependency.

## Audio startup and recovery

Rain samples are prepared in memory during startup. The Enter tap synchronously
creates/resumes Web Audio, and sound is enabled by default (an explicit mute is
remembered). The menu and HUD expose sound controls, including retry after an
interruption or blocked startup. AudioSession playback mode is requested when
available. Pause and mute silence the master gain before suspending the context;
late resume promises cannot undo a mute.

Run `node apps/apartment/audio.test.mjs` to check gesture startup, interruption,
resume rejection/timeouts and mute races. Desktop browser startup and mute/re-enable
were verified; physical iPhone output still needs device verification.

### Circus music and spoken dialogue

The original synthesized minor-key circus waltz is scheduled on the audio clock.
Its volume rises with proximity to the front door; opening the door raises the
volume and filter cutoff. Music fades when security clears the street and is
lowered during dialogue.

Seven original dialogue clips in `voices/` were generated locally with installed
Microsoft David Desktop and Microsoft Zira Desktop speech voices. The WAV files
preload at page startup, decode after audio is unlocked, and play through the
same Web Audio master gain as the ambience. No browser speech synthesis or remote
voice service is needed. Guards greet the player near the entrance, respond to
interaction and warn the clown; dispatch speaks during the security call.

For the Wi-Fi preview with voice files, run:
`node tools/serve-apartment.cjs 192.168.1.162` (replace the IP when it changes).

### Threat and rain balance

Guards must be within 2.8 metres of the player and close enough to intercept the
clown. Walls and closed doors block protection. Escort movement is limited to
2.6 m/s, while the clown pursues at 3.15 m/s; the player can sprint at 4.1 m/s.
A closed entrance blocks the clown, while an unguarded open entrance permits
pursuit indoors. Repellent remains an alternative to nearby protection.

Rain uses continuous volume and low-pass changes: outdoor gain is 0.12; indoor
gain starts at 0.018 and rises near the doorway, especially with it open, to at
most 0.07. Indoor rain is never completely muted or as loud as outside.