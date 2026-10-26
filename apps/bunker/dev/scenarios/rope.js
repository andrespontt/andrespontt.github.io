import * as THREE from 'three';

// Verlet rope with a weighted end, pinned to a mast. Distance constraints are
// relaxed iteratively; the current weather preset pushes it as wind. E kicks it.
const SEGMENTS = 22, LINK = .2, ITERATIONS = 14, G = 9.81, DAMPING = .996, TOP = 5;
const WIND = { flurries: .4, snowfall: 1.5, blizzard: 4.5, whiteout: 8 };

export default {
  id: 'rope',
  title: 'Verlet rope · wind',
  summary: 'A weighted rope swinging in wind set by the weather.',
  create({ group, label }) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(.14, TOP + .2, .14), new THREE.MeshStandardMaterial({ color: '#697579', metalness: .6, roughness: .5 }));
    mast.position.set(0, (TOP + .2) / 2, 0); group.add(mast);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, .1, .1), mast.material); arm.position.set(.75, TOP, 0); group.add(arm);
    const points = Array.from({ length: SEGMENTS + 1 }, (_, i) => ({ p: new THREE.Vector3(1.5 + i * LINK, TOP, 0), old: new THREE.Vector3(1.5 + i * LINK, TOP, 0) }));
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points.map(x => x.p));
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: '#d9b47a' })); line.frustumCulled = false; group.add(line);
    const weight = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff8e72', roughness: .4 })); group.add(weight);
    const readout = label('', { width: 2.6, lines: 2 }); readout.position.set(-1.6, 2.2, 0); group.add(readout);
    let time = 0, acc = 0;
    const STEP = 1 / 120;
    function step(h, wind) {
      for (let i = 1; i < points.length; i++) {
        const { p, old } = points[i], vx = (p.x - old.x) * DAMPING, vy = (p.y - old.y) * DAMPING, vz = (p.z - old.z) * DAMPING;
        old.copy(p);
        // Gusting wind along +Z, stronger lower down where the rope catches more air.
        const gust = wind * (.6 + .4 * Math.sin(time * 1.7 + i * .2));
        p.set(p.x + vx, p.y + vy - G * h * h, p.z + vz + gust * h * h);
      }
      for (let k = 0; k < ITERATIONS; k++) {
        points[0].p.set(1.5, TOP, 0);
        for (let i = 0; i < SEGMENTS; i++) {
          const a = points[i].p, b = points[i + 1].p, dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
          const d = Math.hypot(dx, dy, dz) || 1e-6, diff = (d - LINK) / d;
          // The pin never moves; the weighted end moves a quarter as much as a link.
          const wa = i === 0 ? 0 : .5, wb = i + 1 === SEGMENTS ? .2 : .5, total = wa + wb;
          a.x += dx * diff * wa / total; a.y += dy * diff * wa / total; a.z += dz * diff * wa / total;
          b.x -= dx * diff * wb / total; b.y -= dy * diff * wb / total; b.z -= dz * diff * wb / total;
        }
        for (const { p } of points) if (p.y < .05) p.y = .05;
      }
    }
    return {
      update(dt, { weather = 'blizzard' } = {}) {
        time += dt; acc = Math.min(acc + dt, .1);
        const wind = WIND[weather] ?? 2;
        while (acc >= STEP) { step(STEP, wind); acc -= STEP; }
        const pos = lineGeometry.attributes.position;
        points.forEach(({ p }, i) => pos.setXYZ(i, p.x, p.y, p.z)); pos.needsUpdate = true;
        weight.position.copy(points[SEGMENTS].p);
        readout.userData.set(`WIND ${weather.toUpperCase()} · ${wind} m/s²\n${SEGMENTS} links · ${ITERATIONS} iterations`);
      },
      interaction: () => ({ label: 'Kick the weight', action() { const end = points[SEGMENTS]; end.old.copy(end.p).add(new THREE.Vector3(-.12, -.04, -.1)); } }),
    };
  },
};
