import * as THREE from 'three';

// Rigid spheres in a pen: gravity, restitution, rolling friction and
// sphere-sphere impulses, integrated with fixed sub-steps. E fires a burst.
const MAX = 48, R = .22, HALF = 3.6, G = 9.81, RESTITUTION = .72, FRICTION = .9, STEP = 1 / 120;

export default {
  id: 'balls',
  title: 'Ballistics & collisions',
  summary: 'Balls fired into a pen: gravity, bounce, friction, collisions.',
  create({ group, label }) {
    const wall = new THREE.MeshStandardMaterial({ color: '#3b4d55', roughness: .9, transparent: true, opacity: .55 });
    for (const [w, d, x, z] of [[HALF * 2, .1, 0, -HALF], [HALF * 2, .1, 0, HALF], [.1, HALF * 2, -HALF, 0], [.1, HALF * 2, HALF, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w + .1, .7, d + .1), wall); m.position.set(x, .35, z); group.add(m);
    }
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, .9, 12), new THREE.MeshStandardMaterial({ color: '#697579', metalness: .6, roughness: .5 }));
    cannon.position.set(-HALF + .5, .5, HALF - .5); cannon.rotation.set(-.6, 0, -.6); group.add(cannon);
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(R, 16, 12), new THREE.MeshStandardMaterial({ roughness: .5 }), MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh);
    const palette = ['#ff8e72', '#d9b47a', '#b7e5e2', '#9fbea3', '#e0e8ec'].map(c => new THREE.Color(c));
    const balls = [];
    const readout = label('', { width: 2.6, lines: 2 }); readout.position.set(0, 2.2, -HALF - .3); group.add(readout);
    const matrix = new THREE.Matrix4();
    let next = 0, timer = 0, acc = 0, bounces = 0;
    function launch() {
      const ball = balls[next] || (balls[next] = { p: new THREE.Vector3(), v: new THREE.Vector3() });
      ball.p.set(-HALF + .7, .9, HALF - .7);
      const speed = 6 + Math.random() * 2.5, yaw = -Math.PI / 4 + (Math.random() - .5) * .5;
      ball.v.set(Math.sin(-yaw) * speed * .7, 4 + Math.random() * 2.5, -Math.cos(yaw) * speed * .7);
      mesh.setColorAt(next, palette[next % palette.length]); mesh.instanceColor.needsUpdate = true;
      next = (next + 1) % MAX;
    }
    function step(h) {
      for (const b of balls) {
        b.v.y -= G * h; b.p.addScaledVector(b.v, h);
        if (b.p.y < R) { b.p.y = R; if (b.v.y < 0) { if (b.v.y < -1) bounces++; b.v.y = -b.v.y * RESTITUTION; b.v.x *= FRICTION ** (h * 60); b.v.z *= FRICTION ** (h * 60); } }
        for (const axis of ['x', 'z']) {
          if (b.p[axis] > HALF - R) { b.p[axis] = HALF - R; b.v[axis] = -Math.abs(b.v[axis]) * RESTITUTION; }
          if (b.p[axis] < -HALF + R) { b.p[axis] = -HALF + R; b.v[axis] = Math.abs(b.v[axis]) * RESTITUTION; }
        }
      }
      // Equal-mass sphere contacts: separate, then exchange the normal impulse.
      const n = new THREE.Vector3();
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        n.subVectors(b.p, a.p); const dist = n.length();
        if (dist >= 2 * R || dist < 1e-6) continue;
        n.divideScalar(dist);
        const overlap = 2 * R - dist;
        a.p.addScaledVector(n, -overlap / 2); b.p.addScaledVector(n, overlap / 2);
        const approach = (b.v.x - a.v.x) * n.x + (b.v.y - a.v.y) * n.y + (b.v.z - a.v.z) * n.z;
        if (approach >= 0) continue;
        const impulse = -(1 + RESTITUTION) * approach / 2;
        a.v.addScaledVector(n, -impulse); b.v.addScaledVector(n, impulse);
      }
    }
    return {
      update(dt) {
        timer += dt;
        if (timer > .55) { timer = 0; launch(); }
        acc = Math.min(acc + dt, .1);
        while (acc >= STEP) { step(STEP); acc -= STEP; }
        balls.forEach((b, i) => mesh.setMatrixAt(i, matrix.makeTranslation(b.p.x, b.p.y, b.p.z)));
        mesh.count = balls.length; mesh.instanceMatrix.needsUpdate = true;
        const energy = balls.reduce((sum, b) => sum + .5 * b.v.lengthSq() + G * (b.p.y - R), 0);
        readout.userData.set(`${balls.length} balls · e=${RESTITUTION}\nbounces ${bounces} · energy ${energy.toFixed(0)} J/kg`);
      },
      interaction: () => ({ label: 'Fire a burst of 8', action() { for (let i = 0; i < 8; i++) launch(); } }),
    };
  },
};
