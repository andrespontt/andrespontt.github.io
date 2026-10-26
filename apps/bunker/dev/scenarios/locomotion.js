import * as THREE from 'three';
import { GAIT, facing } from '../kit.js';
import { damp } from '../easing.js';

// A soldier circling a track. E steps through gaits; speed eases and the
// animation blend + playback rate follow the actual ground speed.
const GAITS = [['Idle', 0], ['Walk', GAIT.walk], ['Jog', 2.8], ['Run', GAIT.run]];

export default {
  id: 'locomotion',
  title: 'Locomotion loop',
  summary: 'A soldier circles a track; idle, walk, jog and run blend with speed.',
  create({ group, soldier, label }) {
    const radius = 4.2;
    const track = new THREE.Mesh(new THREE.RingGeometry(radius - .35, radius + .35, 64), new THREE.MeshStandardMaterial({ color: '#2c3d43', roughness: 1 }));
    track.rotation.x = -Math.PI / 2; track.position.y = .01; group.add(track);
    const s = soldier(); group.add(s.model);
    const readout = label('', { width: 2.6, lines: 2 }); readout.position.set(0, 2.6, 0); group.add(readout);
    let gait = 3, speed = 0, angle = 0;
    return {
      update(dt) {
        speed = damp(speed, GAITS[gait][1], 2.2, dt);
        angle += speed * dt / radius;
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        s.model.position.set(x, 0, z);
        // Tangent direction for counter-clockwise travel seen from above.
        s.model.rotation.y = facing(-Math.sin(angle), Math.cos(angle));
        s.setSpeed(speed);
        s.mixer.update(dt);
        readout.userData.set(`${GAITS[gait][0].toUpperCase()}\n${speed.toFixed(2)} m/s · target ${GAITS[gait][1].toFixed(1)}`);
      },
      interaction: () => ({ label: 'Change gait → ' + GAITS[(gait + 1) % GAITS.length][0], action() { gait = (gait + 1) % GAITS.length; } }),
    };
  },
};
