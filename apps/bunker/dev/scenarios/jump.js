import * as THREE from 'three';
import { GAIT, facing } from '../kit.js';
import { EASINGS } from '../easing.js';

// Run-up and ballistic jump over a crate: take-off speed comes from the apex
// height (v = √(2gh)), so air time and landing point follow real gravity.
// E switches between Earth, Moon and Mars gravity.
const WORLDS = [['Earth', 9.81], ['Mars', 3.71], ['Moon', 1.62]];
const HALF = 6.5, APEX = .85, RUN = GAIT.run * .9;

export default {
  id: 'jump',
  title: 'Jump arc · gravity',
  summary: 'Ballistic jump over a crate on Earth, Mars or the Moon.',
  yaw: Math.PI / 2,
  create({ group, soldier, label }) {
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(1.2, HALF * 2 + 2), new THREE.MeshStandardMaterial({ color: '#2c3d43', roughness: 1 }));
    lane.rotation.x = -Math.PI / 2; lane.position.y = .01; group.add(lane);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.1, .6, .6), new THREE.MeshStandardMaterial({ color: '#8a6a43', roughness: .9 }));
    crate.position.set(0, .3, 0); group.add(crate);
    const s = soldier(); group.add(s.model);
    // Predicted arc for the current gravity.
    const arcGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 40 }, () => new THREE.Vector3()));
    const arc = new THREE.Line(arcGeometry, new THREE.LineDashedMaterial({ color: '#b7e5e2', dashSize: .15, gapSize: .1 }));
    arc.frustumCulled = false; group.add(arc);
    const readout = label('', { width: 2.8, lines: 2 }); readout.position.set(2.3, 2.2, 0); group.add(readout);
    let world = 0, z = -HALF, dir = 1, y = 0, vy = 0, airborne = false, turning = 0, landed = 0;
    const takeoff = () => {
      const g = WORLDS[world][1], v = Math.sqrt(2 * g * APEX);
      return { g, v, air: 2 * v / g, distance: RUN * 2 * v / g };
    };
    function drawArc() {
      const { g, v, air } = takeoff(), p = arcGeometry.attributes.position;
      const start = -dir * RUN * air / 2;
      for (let i = 0; i < p.count; i++) { const t = air * i / (p.count - 1); p.setXYZ(i, 0, .05 + v * t - g * t * t / 2, start + dir * RUN * t); }
      p.needsUpdate = true; arc.computeLineDistances();
    }
    drawArc();
    return {
      update(dt) {
        const { g, v, air, distance } = takeoff();
        if (turning > 0) {
          turning = Math.max(0, turning - dt);
          const p = 1 - turning / .9;
          s.model.rotation.y = facing(0, -dir) + Math.PI * EASINGS.easeInOutSine(p);
          s.setSpeed(.8);
          if (!turning) drawArc();
        } else {
          z += dir * RUN * dt;
          // Leave the ground half the jump distance before the crate.
          if (!airborne && dir * z > -distance / 2 && dir * z < 0) { airborne = true; vy = v; }
          if (airborne) { vy -= g * dt; y += vy * dt; if (y <= 0) { y = 0; airborne = false; landed = .25; } }
          if (dir * z >= HALF) { z = dir * HALF; dir = -dir; turning = .9; }
          s.model.rotation.y = facing(0, dir);
          landed = Math.max(0, landed - dt);
          // In the air the legs slow down; landing briefly dips speed for weight.
          s.setSpeed(airborne ? RUN * .35 : RUN * (1 - landed * .8));
        }
        s.model.position.set(0, y, z);
        s.mixer.update(dt);
        readout.userData.set(`${WORLDS[world][0].toUpperCase()} g=${g} m/s²\nair ${air.toFixed(2)} s · range ${distance.toFixed(1)} m`);
      },
      interaction: () => ({ label: 'Gravity → ' + WORLDS[(world + 1) % WORLDS.length][0], action() { world = (world + 1) % WORLDS.length; drawArc(); } }),
    };
  },
};
