import * as THREE from 'three';
import { facing } from '../kit.js';
import { angleDelta, damp, spring } from '../easing.js';
import { bone, solveTwoBone } from '../../rig.js';

// A drone follows a figure-eight. The body turns with a critically damped spring,
// both arms are solved with two-bone IK onto an aim line, and a laser shows the result.
// E toggles between aiming and relaxed (the IK weight eases in and out).
export default {
  id: 'aim',
  title: 'Aim tracking',
  summary: 'Body turns on a spring, IK arms aim at a moving drone.',
  create({ group, soldier, label }) {
    const s = soldier(); group.add(s.model);
    const drone = new THREE.Mesh(new THREE.SphereGeometry(.18, 16, 10), new THREE.MeshBasicMaterial({ color: '#ff8e72' }));
    group.add(drone);
    const laserGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const laser = new THREE.Line(laserGeometry, new THREE.LineBasicMaterial({ color: '#ff5a3c' }));
    laser.frustumCulled = false; group.add(laser);
    const readout = label('', { width: 2.6, lines: 2 }); readout.position.set(0, 3.3, -1.5); group.add(readout);
    const parts = Object.fromEntries(['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'Spine2'].map(n => [n, bone(s.model, n)]));
    const turn = { value: Math.PI, velocity: 0 };
    const target = new THREE.Vector3(), shoulder = new THREE.Vector3(), aimDir = new THREE.Vector3(), grip = new THREE.Vector3(), pole = new THREE.Vector3(), hand = new THREE.Vector3();
    const relaxed = new Map();
    let time = 0, aiming = true, weight = 1;
    return {
      update(dt) {
        time += dt;
        // Figure-eight drone path, in front of and around the soldier.
        drone.position.set(Math.sin(time * .55) * 4.5, 1.8 + Math.sin(time * 1.1) * 1.1, Math.sin(time * 1.1) * 1.6 + 2.4);
        group.localToWorld(target.copy(drone.position));
        // Body yaw: spring toward the drone direction (handles the ±π wrap).
        const desired = facing(drone.position.x, drone.position.z);
        turn.value = desired - angleDelta(turn.value, desired);
        spring(turn, desired, 1.1, dt);
        s.model.rotation.y = turn.value;
        s.setSpeed(0);
        s.mixer.update(dt);
        weight = damp(weight, aiming ? 1 : 0, 4, dt);
        if (weight < .01) { laser.visible = false; readout.userData.set('RELAXED\nE to raise weapon'); return; }
        // Keep the animated pose so the IK result can be blended over it.
        for (const node of Object.values(parts)) if (node) relaxed.set(node, node.quaternion.clone());
        s.model.updateWorldMatrix(true, true);
        parts.RightArm.getWorldPosition(shoulder);
        aimDir.subVectors(target, shoulder).normalize();
        const side = new THREE.Vector3().crossVectors(aimDir, new THREE.Vector3(0, 1, 0)).normalize();
        // Right (trigger) hand close to the shoulder, left (support) hand further along the line.
        grip.copy(shoulder).addScaledVector(aimDir, .42).addScaledVector(side, .04).y -= .06;
        pole.copy(shoulder).addScaledVector(side, .5).y -= .6;
        solveTwoBone(parts.RightArm, parts.RightForeArm, parts.RightHand, grip, pole);
        const support = shoulder.clone().addScaledVector(aimDir, .66).addScaledVector(side, -.12);
        support.y -= .1;
        pole.copy(shoulder).addScaledVector(side, -.7).y -= .7;
        solveTwoBone(parts.LeftArm, parts.LeftForeArm, parts.LeftHand, support, pole);
        if (weight < .999) for (const [node, q] of relaxed) node.quaternion.slerpQuaternions(q, node.quaternion.clone(), weight);
        s.model.updateWorldMatrix(true, true);
        parts.RightHand.getWorldPosition(hand);
        laser.visible = weight > .9;
        const position = laserGeometry.attributes.position;
        group.worldToLocal(hand); position.setXYZ(0, hand.x, hand.y, hand.z);
        position.setXYZ(1, drone.position.x, drone.position.y, drone.position.z); position.needsUpdate = true;
        const error = THREE.MathUtils.radToDeg(Math.abs(angleDelta(turn.value, desired)));
        readout.userData.set(`AIMING · weight ${weight.toFixed(2)}\nbody lag ${error.toFixed(1)}° · spring 1.1 Hz`);
      },
      interaction: () => ({ label: aiming ? 'Lower weapon' : 'Raise weapon', action() { aiming = !aiming; } }),
    };
  },
};
