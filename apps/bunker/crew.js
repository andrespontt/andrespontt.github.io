import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { bone, placeHips, solveTwoBone } from './rig.js';

export const soldierUrl = new URL('./assets/Soldier.glb', import.meta.url).href;

// Seat and wheel layout shared with cabin.js so drivers always fit their controls.
export const DRIVER = { floor: .725, seatTop: 1.2, seatZ: 2.9, wheelY: 1.52, wheelZ: 3.32 };

function poseDriver(soldier, x) {
  const { floor, seatTop, seatZ, wheelY, wheelZ } = DRIVER;
  for (const side of ['Left', 'Right']) {
    // The model faces +Z after its half-turn, so its left hand is on world +X.
    const s = side === 'Left' ? 1 : -1;
    const target = new THREE.Vector3(x + s * .27, wheelY - .02, wheelZ + .02);
    const pole = new THREE.Vector3(x + s * .7, seatTop + .1, seatZ + .1);
    solveTwoBone(bone(soldier, side + 'Arm'), bone(soldier, side + 'ForeArm'), bone(soldier, side + 'Hand'), target, pole);
    const ankle = new THREE.Vector3(x + s * .16, floor + .1, seatZ + .72);
    const knee = new THREE.Vector3(x + s * .2, seatTop + 1, seatZ + 1.2);
    solveTwoBone(bone(soldier, side + 'UpLeg'), bone(soldier, side + 'Leg'), bone(soldier, side + 'Foot'), ankle, knee);
  }
}

export async function addSeatedDrivers(scene) {
  const gltf = await new GLTFLoader().loadAsync(soldierUrl);
  const poseClip = gltf.animations.find(clip => clip.name === 'TPose');
  for (const x of [-1.15, 1.15]) {
    const soldier = cloneRig(gltf.scene);
    soldier.position.set(x, 0, DRIVER.seatZ);
    soldier.rotation.y = Math.PI;
    if (poseClip) {
      const mixer = new THREE.AnimationMixer(soldier);
      const pose = mixer.clipAction(poseClip);
      pose.play();
      mixer.setTime(0);
      pose.paused = true;
    }
    scene.add(soldier);
    placeHips(soldier, new THREE.Vector3(x, DRIVER.seatTop + .1, DRIVER.seatZ - .08));
    poseDriver(soldier, x);
  }
}
