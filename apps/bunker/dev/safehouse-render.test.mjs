import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { VEYR_TRANSPORT } from './safehouse-plans.js';

// Use the same vendored Three.js and loaders as the browser import map.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('../../vendor/three.module.min.js', import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../../vendor/three-addons/' + specifier.slice(13), import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const THREE = await import('three');
const { createBuilder } = await import('./safehouse.js');

test('window trim covers wall reveals without coplanar visible faces', () => {
  for (const wall of VEYR_TRANSPORT.walls.filter(w => w.openings?.some(o => o[2] > 0))) {
    const group = new THREE.Group(), kit = createBuilder(group);
    const plan = { height: VEYR_TRANSPORT.height, walls: [wall] };
    kit.walls(plan, kit.mat('#888888'), kit.mat('#555555'));
    const wallCount = group.children.length;
    kit.windows(plan, kit.mat('#222222'), kit.mat('#aaaaaa'));
    group.updateMatrixWorld(true);
    const bounds = group.children.map(mesh => new THREE.Box3().setFromObject(mesh));
    for (let i = 0; i < wallCount; i++) for (let j = wallCount; j < bounds.length; j++) {
      const a = bounds[i], b = bounds[j];
      for (const axis of ['x', 'y', 'z']) for (const side of ['min', 'max']) {
        if (Math.abs(a[side][axis] - b[side][axis]) > 1e-6) continue;
        const area = ['x', 'y', 'z'].filter(d => d !== axis).reduce((n, d) =>
          n * Math.max(0, Math.min(a.max[d], b.max[d]) - Math.max(a.min[d], b.min[d])), 1);
        assert.ok(area < 1e-6, `${wall.axis} wall at ${wall.at}: ${axis} ${side} faces overlap by ${area}`);
      }
    }
  }
});
