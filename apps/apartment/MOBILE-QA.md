# Apartment mobile UI — version 25

Checked on 2026-10-24 using the in-app Chromium browser at phone-sized viewports and the actual runtime's pointer handlers in the Node regression harness. This is not a physical iPhone or Safari/WebKit certification.

## Browser checks

- Portrait: 320×568, 375×667, 430×932.
- Landscape: 568×320, 844×390.
- Inspected WebGL gameplay screenshots, landing, pause, expanded controls, and restart confirmation.
- Exercised right-side drag look, crouch, pause/resume, cancel restart, and Escape resume.
- Fixed pause's horizontal overflow, landscape landing collisions, short-screen scrolling, small-screen action widths, and mobile keyboard hints.
- Latest browser console check returned no warnings or errors.

## Runtime checks

Run from the repository root:

```sh
node apps/apartment/runtime.test.mjs
node apps/apartment/audio.test.mjs
node apps/apartment/simulation.test.mjs
```

The runtime checks exercise separate movement/look pointer IDs, canceled pointers, paused input, action taps while moving, and Spray during a close clown encounter with both fingers active. They also check explicit guard orders/cancel, sensitivity, objective timing, sound preference while paused, conditional Spray visibility, and restart cancellation.

The existing suites cover audio unlock/recovery and dialogue priority, guard interception, protection proximity, doorway punching, unprotected captures, 30 extended doorway scenarios, and 121 whole-floor-plan pursuits.

## Remaining hardware checks

Real iPhone Safari must still verify audio output/unlock, OS gesture cancellation, long-press text-selection suppression, safe-area behavior around the notch/home indicator, and actual two-thumb comfort. CSS keeps safe-area offsets and disables text selection; synthetic pointer tests do not reproduce all iOS behavior.
