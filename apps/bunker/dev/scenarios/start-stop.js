import * as THREE from 'three';
import { GAIT, facing } from '../kit.js';
import { EASINGS } from '../easing.js';

// Sprint between two marks. Each leg's speed profile is driven by an easing curve,
// then the soldier eases through a 180° turn. E cycles the curve.
const CURVES = ['easeInOutCubic', 'easeInOutSine', 'linear', 'easeOutQuad', 'easeInQuad'];
const LANE = 10, LEG_TIME = 4.2, TURN_TIME = .9, PAUSE = .5;

export default {
  id: 'start-stop',
  title: 'Start · stop easing',
  summary: 'Sprint between two marks with eased starts, stops and turns.',
  yaw: Math.PI / 2, // lane runs across the viewer
  create({ group, soldier, label }) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, LANE + 2), new THREE.MeshStandardMaterial({ color: '#2c3d43', roughness: 1 }));
    lane.rotation.x = -Math.PI / 2; lane.position.y = .01; group.add(lane);
    for (const z of [-LANE / 2, LANE / 2]) { const mark = new THREE.Mesh(new THREE.BoxGeometry(1.3, .02, .08), new THREE.MeshBasicMaterial({ color: '#d9b47a' })); mark.position.set(0, .02, z); group.add(mark); }
    const s = soldier(); group.add(s.model);
    const readout = label('', { width: 2.8, lines: 2 }); readout.position.set(2.2, 2.2, 0); group.add(readout);
    let curve = 0, phase = 'pause', t = 0, from = -LANE / 2, dir = 1, prevZ = from, speed = 0;
    return {
      update(dt) {
        t += dt;
        const ease = EASINGS[CURVES[curve]];
        let z = prevZ, yaw = facing(0, dir);
        if (phase === 'pause' && t > PAUSE) { phase = 'run'; t = 0; }
        if (phase === 'run') {
          const p = Math.min(1, t / LEG_TIME);
          // Ease the position over the leg as a symmetric go-and-stop profile.
          z = from + dir * LANE * ease(p);
          if (p >= 1) { phase = 'turn'; t = 0; }
        } else if (phase === 'turn') {
          const p = Math.min(1, t / TURN_TIME);
          yaw = facing(0, dir) + Math.PI * EASINGS.easeInOutSine(p);
          if (p >= 1) { phase = 'pause'; t = 0; from += dir * LANE; dir = -dir; yaw = facing(0, dir); }
        }
        speed = dt > 0 ? Math.abs(z - prevZ) / dt : 0;
        prevZ = z;
        s.model.position.set(0, 0, z);
        s.model.rotation.y = yaw;
        // Turning on the spot reads as a slow walk.
        s.setSpeed(phase === 'turn' ? .8 : Math.min(speed, GAIT.run * 1.3));
        s.mixer.update(dt);
        readout.userData.set(`${CURVES[curve]}\n${speed.toFixed(2)} m/s · ${phase}`);
      },
      interaction: () => ({ label: 'Speed curve → ' + CURVES[(curve + 1) % CURVES.length], action() { curve = (curve + 1) % CURVES.length; } }),
    };
  },
};
