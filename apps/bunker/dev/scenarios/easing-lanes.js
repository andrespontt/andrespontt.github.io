import * as THREE from 'three';
import { EASINGS } from '../easing.js';

// Every easing curve stacked like a chart: same duration, one row per curve,
// sliding left to right. E changes the duration.
const DURATIONS = [1.6, 3, .8], LENGTH = 7, HOLD = .6, ROW = .42;

export default {
  id: 'easing',
  title: 'Easing curves',
  summary: 'Every easing curve side by side.',
  create({ group, label }) {
    const names = Object.keys(EASINGS);
    const cubeGeometry = new THREE.BoxGeometry(.38, .38, .38), railGeometry = new THREE.BoxGeometry(LENGTH + .4, .03, .03);
    const railMaterial = new THREE.MeshBasicMaterial({ color: '#4f6670' });
    const rowY = i => .3 + (names.length - 1 - i) * ROW;
    for (const x of [-LENGTH / 2, LENGTH / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.04, names.length * ROW + .2, .04), new THREE.MeshBasicMaterial({ color: '#d9b47a' }));
      post.position.set(x, rowY(names.length - 1) + (names.length - 1) * ROW / 2, 0); group.add(post);
    }
    const cubes = names.map((name, i) => {
      const rail = new THREE.Mesh(railGeometry, railMaterial); rail.position.set(0, rowY(i), -.2); group.add(rail);
      const cube = new THREE.Mesh(cubeGeometry, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / names.length, .5, .62), roughness: .6 }));
      group.add(cube);
      const tag = label(name, { width: 1.5 }); tag.position.set(-LENGTH / 2 - 1.05, rowY(i), 0); group.add(tag);
      return cube;
    });
    const readout = label('', { width: 2.6 }); readout.position.set(0, rowY(0) + .8, 0); group.add(readout);
    let time = 0, which = 0;
    return {
      update(dt) {
        const duration = DURATIONS[which], cycle = 2 * (duration + HOLD);
        time = (time + dt) % cycle;
        let t = time, forward = true;
        if (t > duration + HOLD) { t -= duration + HOLD; forward = false; }
        const p = Math.min(1, t / duration);
        cubes.forEach((cube, i) => {
          const e = EASINGS[names[i]](p), progress = forward ? e : 1 - e;
          cube.position.set(-LENGTH / 2 + progress * LENGTH, rowY(i), 0);
        });
        readout.userData.set(`DURATION ${duration}s · t=${p.toFixed(2)}`);
      },
      interaction: () => ({ label: 'Duration → ' + DURATIONS[(which + 1) % DURATIONS.length] + 's', action() { which = (which + 1) % DURATIONS.length; time = 0; } }),
    };
  },
};
