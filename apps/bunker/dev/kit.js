import * as THREE from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

// The Soldier clips are in place (no root motion). These are the ground speeds
// at which each clip's feet roughly stop sliding; tune here if a gait looks off.
export const GAIT = { walk: 1.45, run: 4.1 };

// The model's front is -Z, so face a world direction with this yaw.
export const facing = (dx, dz) => Math.atan2(dx, dz) + Math.PI;

export const createSoldier = gltf => createCharacter(gltf);

// Any Mixamo-rigged glTF with idle/walk/run clips.
// clips: names of those clips in the file. flip: the model faces +Z (wrap it so it faces -Z like the Soldier).
// tint(material, meshName): recolor per character; materials are cloned first so tints don't leak.
export function createCharacter(gltf, { clips = { Idle: 'Idle', Walk: 'Walk', Run: 'Run' }, flip = false, tint = null } = {}) {
  const inner = cloneRig(gltf.scene);
  let model = inner;
  if (flip) { model = new THREE.Group(); inner.rotation.y = Math.PI; model.add(inner); }
  inner.traverse(node => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    if (tint) { node.material = node.material.clone(); tint(node.material, node.name); }
  });
  const mixer = new THREE.AnimationMixer(inner);
  const actions = {};
  // Only the locomotion clips play; extra poses in the file (TPose, additive poses) stay off.
  for (const [key, name] of Object.entries(clips)) {
    const clip = gltf.animations.find(c => c.name === name);
    if (!clip) continue;
    const action = mixer.clipAction(clip);
    action.play();
    action.setEffectiveWeight(key === 'Idle' ? 1 : 0);
    actions[key] = action;
  }
  // Blend idle -> walk -> run from a ground speed and scale playback to match it.
  function setSpeed(speed) {
    const walkMix = THREE.MathUtils.clamp(speed / GAIT.walk, 0, 1);
    const runMix = THREE.MathUtils.clamp((speed - GAIT.walk) / (GAIT.run - GAIT.walk), 0, 1);
    actions.Idle.setEffectiveWeight(1 - walkMix);
    actions.Walk.setEffectiveWeight(walkMix * (1 - runMix));
    actions.Run.setEffectiveWeight(walkMix * runMix);
    actions.TPose?.setEffectiveWeight(0);
    actions.Walk.timeScale = THREE.MathUtils.clamp(speed / GAIT.walk, .6, 1.8);
    actions.Run.timeScale = THREE.MathUtils.clamp(speed / GAIT.run, .6, 1.4);
  }
  setSpeed(0);
  return { model, mixer, actions, setSpeed };
}

// A flat sign whose text can be redrawn cheaply.
export function createLabel(text, { width = 3, lines = 1, color = '#d8e6e1', accent = '#d9b47a' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 768; canvas.height = 96 * lines + 32;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * canvas.height / canvas.width),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }));
  let last = '';
  mesh.userData.set = value => {
    if (value === last) return;
    last = value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0d1a20d8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, 10, canvas.height);
    String(value).split('\n').forEach((line, i) => {
      ctx.fillStyle = i ? '#9fb3b4' : color;
      ctx.font = i ? '34px monospace' : 'bold 46px monospace';
      ctx.fillText(line, 34, 66 + i * 92, canvas.width - 60);
    });
    texture.needsUpdate = true;
  };
  mesh.userData.set(text);
  return mesh;
}
