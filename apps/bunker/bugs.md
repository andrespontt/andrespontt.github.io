# Bunker — code-only bug review

Reviewed: 2026-10-26. This file replaces the previous review.

Scope: current working-tree code under `apps/bunker/` and `apps/bunker.html`. No browser checks, gameplay runs, or implementation changes were made for this review. Findings describe behavior implied by the code; validation steps below are proposed checks, not executed tests. Prior fixes are not assumed to remain broken.

Priorities: **P1** = state correctness or blocked interaction; **P2** = ordinary UI/gameplay defect; **P3** = cleanup/performance. Effort describes a likely localized fix, not a guarantee. Findings are written as they are verified.

Implementation started 2026-10-26. Original review evidence below is retained; FIXED entries have been addressed sequentially.

## Quick wins

### 1. [FIXED] Fit sector does not fit the full survey — P2 / small
- **Code:** `terminal.js`, `cameraUpdate()` and `fit()` (around lines 46–67).
- **Evidence:** the terrain is 120 × 90 units, but at zoom 1 the orthographic span is `Math.max(78, 88/aspect)`. A square viewport therefore shows only 88 units horizontally, clipping the 120-unit terrain. `fit()` always restores zoom 1 without considering terrain bounds or relief height.
- **Impact:** Fit sector / Home can leave parts of the sector outside the viewport, especially on narrow screens.
- **Suggested fix:** calculate framing from the projected terrain bounds and viewport aspect, with padding for the map controls.
- **Proposed check:** Fit in portrait, square and landscape with relief on/off; all four terrain edges should be visible.

### 2. [FIXED] Weather overlay intersects the mountain — P2 / small
- **Code:** `terminal.js`, `init()`; `sector.js`, `elevation()`.
- **Evidence:** the weather plane is fixed at y = 15 with depth testing enabled. The western ridge exceeds 24 units in elevation.
- **Impact:** parts of the overlay disappear inside the mountain rather than showing weather above it.
- **Suggested fix:** place the overlay above the maximum terrain height, drape it over the terrain, or deliberately render it as a non-depth-tested overlay.
- **Proposed check:** toggle Weather while the high ridge is in view, in both map projections.

### 3. [FIXED] Scale bar label can disagree with its displayed length — P2 / small
- **Code:** `terminal.js`, `draw()`; `terminal.css`, `.ops-scale span`.
- **Evidence:** JS sets a calculated pixel width, but CSS caps the span at `max-width:150px`. The distance label is not adjusted when that cap applies. At high zoom, even the minimum 100 m choice can exceed the cap.
- **Impact:** the map displays an incorrect ruler at high zoom.
- **Suggested fix:** choose a distance that fits the maximum pixel length, or remove the CSS cap and constrain the calculation itself.
- **Proposed check:** zoom to 7× at multiple viewport widths and compare the calculated and rendered bar lengths.

### 4. [FIXED] Terminal keydown handlers accumulate after disposal — P2 / small
- **Code:** `terminal.js`, `root.addEventListener('keydown', ...)` and `dispose()`; `game.js`, terminal creation/disposal in `travel()`.
- **Evidence:** every `createTerminal()` attaches an anonymous Tab handler to the persistent root element; `dispose()` clears its children but does not remove that handler.
- **Impact:** repeated bunker → city → bunker trips accumulate focus-trap listeners. A handler can change focus before the next old handler processes the same key event.
- **Suggested fix:** keep a named handler and remove it on dispose, or use an AbortController for instance listeners.
- **Proposed check:** enter/leave the terminal several times and Tab/Shift+Tab across both ends of its focus order.

### 5. [FIXED] Invisible city inset is still redrawn on every poll — P3 / very small
- **Code:** `terminal.js`, `drawInset()` and `setCity()`; `terminal.css`, `#ops-city-inset{display:none}`.
- **Evidence:** the inset is permanently hidden, yet `setCity()` redraws its canvas on every operation update.
- **Impact:** unnecessary canvas work on phones and redundant obsolete UI code.
- **Suggested fix:** remove the unused inset markup/render path, or only draw it when a visible detail view requests it.
- **Proposed check:** operation updates should no longer render a hidden city-plan canvas.

### 6. [FIXED] City weather controls change a different area's weather — P2 / small
- **Code:** `game.js`, `updateUI()`, KeyN handler, weather-cycle action and Settings weather buttons; city scenario `weatherLabel`.
- **Evidence:** the city supplies its own fixed weather label, but the shell still exposes controls that change the shared mountain `weather`. The city's sleet does not respond to these selections.
- **Impact:** a player chooses Blizzard/Whiteout in the city and sees no corresponding scene change; the selection instead affects the outpost on return.
- **Suggested fix:** hide/disable these controls for fixed-weather areas, or label them explicitly as outpost weather settings.
- **Proposed check:** city settings must clearly distinguish local sleet from mountain weather.

### 7. [FIXED] Expired live lease charges old rounds and wounds again — P1 / small
- **Code:** `city-ops.mjs:97–106`, `applyLive()`; `dev/scenarios/city.js:405–416`, `saveReport()`.
- **Evidence:** `applyLive()` resets `liveRounds` and `liveWounded` whenever `now > liveUntil`, even if `live.session` is unchanged. The scene keeps its cumulative `rounds + playerShots` and `sessionWounded` after a suspended tab resumes.
- **Impact:** returning after lease expiry can subtract the same ammunition and count the same wounded soldiers a second time.
- **Suggested fix:** reset cumulative baselines only for an actual new session; preserve them when the same session renews an expired lease.
- **Proposed check:** report 40 rounds/1 wound, advance beyond the lease, then report the same counters with the same session; supplies and wounded totals must not change.

### 8. Returning from the drone loses events since the last heartbeat — P1 / small-to-medium
- **Code:** `dev/scenarios/city.js:405–421`, report throttling; `:1207`, `dispose()`; `city-store.js`, `releaseLive()`.
- **Evidence:** reports are throttled to two seconds. Disposal marks the scene disposed and releases its lease without sending a final report. Release only changes `liveUntil`.
- **Impact:** leaving just after a kill, shot, wound or wave clear can lose that event from the saved operation; the map may still show the target alive.
- **Suggested fix:** submit a final snapshot and release the lease in an ordered/atomic store operation, ensuring an older in-flight report cannot overwrite it.
- **Proposed check:** leave immediately after an event, before the next heartbeat, then inspect the stored counters.

### 9. R key starts a reload while Pause is active — P2 / very small
- **Code:** `game.js:184`, KeyR handler, versus the guarded `#ammo` click handler around line 194; `areas/dev.js`, `reload()`.
- **Evidence:** keyboard reload checks neither `paused` nor `transitioning`; the area only checks its separate `frozen` flag. Mouse/touch reload does check Pause.
- **Impact:** keyboard and touch controls behave differently; pressing R while paused can start a reload and play its sound, with progress deferred until resume.
- **Suggested fix:** use one shared reload action with the same pause/transition/input gates for both paths.
- **Proposed check:** pause with a partially used magazine and press R; no reload should begin until gameplay resumes.

### 10. Selecting the city makes every poll rebuild the bunker wall texture — P3 / small
- **Code:** `terminal.js`, `setCity()` → `update()` → `onState()`; `game.js`, terminal `onState` callback; `areas/bunker.js`, `setMapState()`.
- **Evidence:** each city poll calls `update()` when the city is selected. `update()` always calls `onState({...state})`, even though selection/route/weather did not change. The bunker setter allocates a fresh 1200 × 900 canvas and flags the texture for upload each time.
- **Impact:** repeated allocations and GPU texture uploads while the terminal is open, defeating the shell's separate wall-state change check.
- **Suggested fix:** distinguish rendering live status from persisting changed map controls, or compare map state before redrawing the wall texture.
- **Proposed check:** leave the city selected through unchanged polls; the wall canvas should not be recreated.

### 11. Joining a saved wave initializes two waves — P2 / small
- **Code:** `dev/scenarios/city.js:426–428`, `joinWave()`; `setMode('Intruders')` around line 652.
- **Evidence:** `joinWave()` calls `setMode('Intruders')`, which resets counters and calls `startWave()`. It then assigns `wave = op.wave - 1` and calls `startWave()` again.
- **Impact:** duplicate initialization advances the deterministic random stream, repeats character resets and cover setup, and makes a joined wave differ unnecessarily from a single initialization.
- **Suggested fix:** separate mode selection/reset from spawning, so joining initializes the requested wave exactly once.
- **Proposed check:** instrument the call count for joining saved wave 3; `startWave()` should execute once.

### 12. Legacy dev links apply the camera without refreshing its UI — P2 / very small
- **Code:** `game.js`, startup branches at the end of the file.
- **Evidence:** the `?at=...` branch calls `updateUI()` after `setView()`. The `?dev=...&view=...` branch calls `setView()` without that refresh. `travel()` already rendered UI for the default first-person view.
- **Impact:** a legacy city Drone/Overhead link can retain the first-person Fire button/crosshair until another action refreshes UI; the address can also retain the default view written during travel.
- **Suggested fix:** refresh UI/URL after applying `startView` in both branches.
- **Proposed check:** open `?dev=city&view=drone`; weapon controls must be hidden and the address must retain Drone.

### 13. Terminal control updates can restore stale wall-map combat status — P1 / small
- **Code:** `game.js`, `openSituationTerminal()` and `pollCity()`; `terminal.js`, `open()`, `setCity()` and `update()`; `areas/bunker.js`, `setMapState()`.
- **Evidence:** opening passes the entire bunker snapshot, including `cityContact`/`cityOp`, into terminal `state`. Live `setCity(op)` updates the separate `cityOp` variable but not those snapshot fields. `update()` later passes the whole old `state` back through `onState`, and the bunker setter blindly merges it. During a city poll, this callback can run immediately after the shell has applied the fresh wall status.
- **Impact:** selecting/using the map, or polling while the city is selected, can overwrite a current CONTACT indicator with the stale value from when the terminal opened.
- **Suggested fix:** persist only terminal-owned fields (`selected`, `route`, `scanned`, `weather`), never live operation fields from the opening snapshot.
- **Proposed check:** open the terminal during quiet, transition the operation to contact, then select/plot a route; the wall map must retain current contact status.

### 14. Firefight mode bypasses magazine consumption — P2 / small
- **Code:** `dev/scenarios/city.js`, engage branch around lines 754–768 versus Firefight peek branch around lines 775–795.
- **Evidence:** Intruders-mode rifle fire decrements `g.mag` and calls `startReload()`. Firefight-mode bursts call `guardShot()` without decrementing the magazine or gating on reload.
- **Impact:** the same soldiers have unlimited magazines in Firefight mode, unlike normal combat.
- **Suggested fix:** share the rifle-fire magazine/reload gate between both branches.
- **Proposed check:** keep Firefight running past 30 rounds per soldier; a reload must occur before further shots.

### 15. Storage fallback is silent and cannot recover after an initial open failure — P2 / small-to-medium
- **Code:** `city-store.js`, `open()` and cached `dbPromise`.
- **Evidence:** missing/failed/blocked IndexedDB resolves to null; that resolved promise remains cached. The in-memory path is used without any user-visible persistence status, and later calls never retry opening the database.
- **Impact:** the player may believe the operation is saved, lose it on reload, and remain in memory mode after a transient storage problem clears.
- **Suggested fix:** expose persistence availability, distinguish blocked from failed opens, and permit an explicit or bounded retry. Close any late database connection if fallback has already been chosen.
- **Proposed check:** simulate an open failure followed by available storage; show the temporary-session warning and verify a retry can restore persistence.

## Important follow-ups, not first-pass quick wins

### 16. Watching a live feed stops background fuel/ration consumption — P2 / medium
- **Code:** `city-ops.mjs`, `advance()`, `step()`, `consume()` and `applyLive()`.
- **Evidence:** all fuel/ration consumption occurs inside `step()`, which is skipped while the live lease is valid. Frequent reports also move `updatedAt` to now. Live reports account for ammunition and wounds, but never fuel/rations.
- **Impact:** the command stops consuming daily supplies for as long as a feed is watched; consumption differs between viewing and leaving the simulation off-screen.
- **Suggested fix:** account for time-based supplies independently of who owns combat simulation, with an explicit policy for Pause.
- **Proposed check:** equivalent ten-minute live and off-screen sessions should consume the same baseline fuel and rations.

### 17. A second live-feed tab repeatedly rebuilds its wave instead of observing it — P2 / medium
- **Code:** `city-store.js`, `reportLive()` lease rejection; `dev/scenarios/city.js:420`, `syncOperation()` and `joinWave()`.
- **Evidence:** a non-owning feed receives the owner's operation, then calls `syncOperation()` whenever `op.liveSession !== feedSession`. During contact, this invokes `joinWave()` every heartbeat and resets the locally simulated intruders.
- **Impact:** the protected save is not overwritten, but a second feed repeatedly resets characters/positions and cannot provide a stable observation.
- **Suggested fix:** explicitly make non-owning feeds observers, or show a feed-in-use message rather than running and resetting a competing local simulation.
- **Proposed check:** open two feeds and ensure the second either observes stable state or clearly reports that another tab owns the feed.

## Suggested first batch

Start with **7, 13, 9, 12, 4, 5**: duplicate accounting, stale wall status, inconsistent reload gating, missing view UI refresh, listener cleanup, and hidden rendering. Then tackle the map presentation fixes **1–3** and remaining small changes.

This is a focused quick-win review, not a claim that these are all defects. Exact vehicle collision, full AI routing, and combat health/death rules were not re-audited here. No fixes were implemented.

## Implementation checks
- 1: Aspect-aware full-sector framing, including relief height. Corner containment tests pass for portrait, square and landscape.

- 2: Weather overlay copies the actual terrain geometry, raised 0.8 units; it cannot intersect the ridge. Module syntax check passes.

- 3: Scale distances adapt to the available 100 pixels, below the CSS cap. Scale-length regression tests pass.

- 4: Terminal disposal removes its named focus-trap listener from the persistent root. Syntax check passes.

- 5: Removed unused inset markup, handlers, import and redraw calls. Syntax check passes.

- 6: Fixed-weather areas hide the cycle control, ignore N, and show local conditions instead of outpost weather presets. Syntax check passes.

- 7: A renewed lease preserves counter baselines for the same session. Expiry/reconnect regression test passes.
