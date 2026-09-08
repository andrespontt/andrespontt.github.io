# Apartment

A first-person, low-poly suspense sandbox. A canceled birthday clown waits outside
on a rainy night. The apartment is a safe place; two bodyguards hold the entrance.
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
by van; the guards always protect the player. There is no death state.

## Verification

Run `node apps/apartment/simulation.test.mjs` from the repository root. The checks
cover spawn clearance, closed/open entrance movement, wall tunnelling, room names,
clown retreat, the secure ending, and reachable unobstructed interaction points
for every indoor target using the actual generated scene.

Browser checks: scene startup, desktop and 390 × 844 layouts, help disclosure,
pause/resume, crouch input, and the unequipped repellent hint. Physical touch and
audio output should also be checked on a device when tuning the experience.
