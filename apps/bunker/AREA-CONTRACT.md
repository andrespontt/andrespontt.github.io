# Area contract

Add `areas/<name>.js` exporting `createArea(saved = {})`. Keep scene construction
inside the factory, never in module scope, so importing code does not allocate a
world. Import Three via `import * as THREE from 'three'`.

Return:

```js
{
  scene,                         // exclusively owned THREE.Scene
  spawn: { x, z, yaw, pitch: 0 }, // yaw 0 looks +Z; PI looks -Z
  eyeHeight: 1.7,
  entrySpawns: {},               // optional named arrival poses
  heightAt(x, z) { return 0; },   // optional terrain height
  move(position, dx, dz) {},     // mutate x/z, resolve collision
  update(dt, { weather, position }) {},
  getInteraction(position) {
    // Return null or one of:
    // { label: 'Open door', action() {} }
    // { label: 'Return outside', destination: 'outside', entry: 'bunker' }
  },
  snapshot() { return { doorOpen: true }; }, // plain CPU state only
  walkSpeed: 3,                   // optional, m/s (default 2.2 inside, 3.8 outside)
  tools: [{ label, action({ setPose }) {} }], // optional HUD buttons, keys 1-9
  dispose() {}                   // optional non-Three cleanup
}
```

Register a dynamic loader and display name in `game.js`; add its module and any
supporting public files to `tools/serve-bunker.cjs`. Add an entrance interaction in
an existing area and, if useful, an overview shortcut. Each destination should
have a clear exit and collision-safe spawn. Use the existing generic interaction
button; labels must not include the `E ·` prefix.

Do not create renderers, RAF loops, global event listeners, or audio contexts in
area factories. The shell owns those. Use shared geometry/materials within an
area where useful. `disposeScene` deduplicates disposal and includes material
textures and ShaderMaterial uniform textures. Do not share render resources
between live areas or retain them in module globals. Dispose custom render
targets, external subscriptions, or other resources in `dispose()` if added later.

Creation can briefly coexist with the old scene. A download failure leaves the
current area intact. An invalid returned area is disposed and rejected. A factory
that throws after allocating custom resources must clean up those partial
allocations itself. Add lifecycle and movement tests when adding substantial new
behavior. The current `AreaManager` intentionally allows one transition at a time.
