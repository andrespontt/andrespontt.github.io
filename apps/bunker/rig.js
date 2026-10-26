import * as THREE from 'three';

// Small procedural posing helpers for the Mixamo Soldier rig.
// Bone names lose the ':' when Three.js loads them: 'mixamorig:Hips' -> 'mixamorigHips'.
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const dir = new THREE.Vector3(), bend = new THREE.Vector3(), elbow = new THREE.Vector3(), local = new THREE.Vector3();

export const bone = (root, name) => root.getObjectByName('mixamorig' + name);

// Rotate `boneObj` so the direction to its child points at a world-space target.
export function aimBone(boneObj, child, targetWorld) {
  if (!boneObj?.parent || !child) return false;
  boneObj.parent.updateWorldMatrix(true, false);
  local.copy(targetWorld);
  boneObj.parent.worldToLocal(local);
  local.sub(boneObj.position);
  const axis = child.position.clone().normalize();
  if (local.lengthSq() < 1e-10 || axis.lengthSq() < 1e-10) return false;
  boneObj.quaternion.setFromUnitVectors(axis, local.normalize());
  boneObj.updateWorldMatrix(false, true);
  return true;
}

// Two-bone IK (upper arm/forearm or thigh/shin). `pole` is a world point the middle joint bends toward.
export function solveTwoBone(root, mid, end, target, pole) {
  if (!root || !mid || !end) return false;
  root.updateWorldMatrix(true, true);
  root.getWorldPosition(a); mid.getWorldPosition(b); end.getWorldPosition(c);
  const upper = a.distanceTo(b), lower = b.distanceTo(c);
  dir.subVectors(target, a);
  const reach = THREE.MathUtils.clamp(dir.length(), Math.abs(upper - lower) + 1e-4, upper + lower - 1e-4);
  dir.normalize();
  bend.subVectors(pole, a);
  bend.addScaledVector(dir, -bend.dot(dir));
  if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0).addScaledVector(dir, -dir.y);
  bend.normalize();
  const cos = (upper * upper + reach * reach - lower * lower) / (2 * upper * reach);
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  elbow.copy(a).addScaledVector(dir, upper * cos).addScaledVector(bend, upper * sin);
  const goal = c.copy(a).addScaledVector(dir, reach);
  aimBone(root, mid, elbow);
  aimBone(mid, end, goal);
  return true;
}

// Move a rigged model so its hips land on a world point (keeps the skeleton untouched).
export function placeHips(model, worldPoint) {
  model.updateWorldMatrix(true, true);
  const hips = bone(model, 'Hips');
  if (!hips) return;
  hips.getWorldPosition(a);
  model.position.add(b.subVectors(worldPoint, a));
  model.updateWorldMatrix(true, true);
}

// --- Combat poses (used by dev scenarios) -------------------------------------
const saved = new Map(), foot = new THREE.Vector3(), forward = new THREE.Vector3(), poleTmp = new THREE.Vector3();
const shoulder = new THREE.Vector3(), aimDir = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const grip = new THREE.Vector3(), support = new THREE.Vector3(), bendPole = new THREE.Vector3();

// Crouch by lowering the whole model and solving the legs back onto the feet.
// Call after the mixer update; `depth` is metres the hips drop (0 = standing).
export function crouch(model, depth) {
  if (depth < .005) return;
  model.updateWorldMatrix(true, true);
  model.getWorldDirection(forward).multiplyScalar(-1).setY(0).normalize(); // the Soldier's front is -Z
  const feet = ['Left', 'Right'].map(side => bone(model, side + 'Foot')?.getWorldPosition(new THREE.Vector3()));
  model.position.y -= depth;
  model.updateWorldMatrix(true, true);
  ['Left', 'Right'].forEach((side, i) => {
    if (!feet[i]) return;
    foot.copy(feet[i]);
    poleTmp.copy(foot).addScaledVector(forward, 1.2).y += .6;
    solveTwoBone(bone(model, side + 'UpLeg'), bone(model, side + 'Leg'), bone(model, side + 'Foot'), foot, poleTmp);
  });
}

// Shoulder a rifle toward a world target. `weight` blends from the animated pose (0) to full aim (1).
// Returns the right/left hand world positions so a weapon mesh can be placed between them.
export function aimRifle(model, target, weight = 1) {
  const parts = ['RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'].map(n => bone(model, n));
  if (parts.some(p => !p) || weight < .01) return null;
  saved.clear();
  for (const p of parts) saved.set(p, p.quaternion.clone());
  model.updateWorldMatrix(true, true);
  parts[0].getWorldPosition(shoulder);
  aimDir.subVectors(target, shoulder).normalize();
  right.crossVectors(aimDir, up).normalize();
  grip.copy(shoulder).addScaledVector(aimDir, .42).addScaledVector(right, .04); grip.y -= .06;
  bendPole.copy(shoulder).addScaledVector(right, .5); bendPole.y -= .6;
  solveTwoBone(parts[0], parts[1], parts[2], grip, bendPole);
  support.copy(shoulder).addScaledVector(aimDir, .66).addScaledVector(right, -.12); support.y -= .1;
  bendPole.copy(shoulder).addScaledVector(right, -.7); bendPole.y -= .7;
  solveTwoBone(parts[3], parts[4], parts[5], support, bendPole);
  if (weight < .999) for (const [p, q] of saved) p.quaternion.slerpQuaternions(q, p.quaternion.clone(), weight);
  model.updateWorldMatrix(true, true);
  return { right: parts[2].getWorldPosition(new THREE.Vector3()), left: parts[5].getWorldPosition(new THREE.Vector3()), dir: aimDir.clone() };
}

// One-handed pistol aim with the right arm. Returns the hand position and aim direction.
export function aimPistol(model, target, weight = 1) {
  const arm = bone(model, 'RightArm'), fore = bone(model, 'RightForeArm'), hand = bone(model, 'RightHand');
  if (!arm || !fore || !hand || weight < .01) return null;
  saved.clear();
  for (const p of [arm, fore, hand]) saved.set(p, p.quaternion.clone());
  model.updateWorldMatrix(true, true);
  arm.getWorldPosition(shoulder);
  aimDir.subVectors(target, shoulder).normalize();
  right.crossVectors(aimDir, up).normalize();
  grip.copy(shoulder).addScaledVector(aimDir, .52);
  bendPole.copy(shoulder).addScaledVector(right, .4); bendPole.y -= .5;
  solveTwoBone(arm, fore, hand, grip, bendPole);
  if (weight < .999) for (const [p, q] of saved) p.quaternion.slerpQuaternions(q, p.quaternion.clone(), weight);
  model.updateWorldMatrix(true, true);
  return { hand: hand.getWorldPosition(new THREE.Vector3()), dir: aimDir.clone() };
}
