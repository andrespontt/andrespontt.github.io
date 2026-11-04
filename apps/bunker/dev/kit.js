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
// clipsFrom: another Mixamo glTF whose clips (named in `clips`) are copied onto this rig, for models without their own.
export function createCharacter(gltf, { clips = { Idle: 'Idle', Walk: 'Walk', Run: 'Run' }, flip = false, tint = null, clipsFrom = null } = {}) {
  const inner = cloneRig(gltf.scene);
  let model = inner;
  if (flip) { model = new THREE.Group(); inner.rotation.y = Math.PI; model.add(inner); }
  inner.traverse(node => {
    if (clipsFrom && node.isBone) node.userData.keepTwist = true; // its bone axes aren't Mixamo's (see aimBone in rig.js)
    if (!node.isMesh) return;
    node.frustumCulled = false;
    if (tint) { node.material = node.material.clone(); tint(node.material, node.name); }
  });
  const mixer = new THREE.AnimationMixer(inner);
  const actions = {};
  // Only the locomotion clips play; extra poses in the file (TPose, additive poses) stay off.
  for (const [key, name] of Object.entries(clips)) {
    const clip = clipsFrom ? borrowedClip(gltf, clipsFrom, name) : gltf.animations.find(c => c.name === name);
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

// Rigs with Mixamo bone names don't always share bone axes or rest poses (the Rocketbox people are 3ds Max Bipeds
// standing in an A-pose), so a clip can't be played on another rig as it is. Instead the target's limbs are first
// lined up with the source's rest pose, then each bone copies the source bone's turn away from that pose, in world
// space, and the hips travel scaled by leg length. Baked once per model, clip and source.
const borrowed = new WeakMap();
function borrowedClip(gltf, source, name) {
  if (!borrowed.has(gltf)) borrowed.set(gltf, { bake: retargeter(source, gltf), clips: new Map() });
  const entry = borrowed.get(gltf);
  if (!entry.clips.has(name)) { const clip = source.animations.find(c => c.name === name); entry.clips.set(name, clip ? entry.bake(clip) : null); }
  return entry.clips.get(name);
}

function retargeter(sourceGltf, targetGltf, fps = 30) {
  const src = cloneRig(sourceGltf.scene), tgt = cloneRig(targetGltf.scene);
  const bonesOf = root => { const map = {}; root.traverse(o => { if (o.isBone) map[o.name] = o; }); return map; };
  const S = bonesOf(src), T = bonesOf(tgt), order = [];
  tgt.traverse(o => { if (o.isBone && S[o.name]) order.push(o.name); }); // parents before children
  src.updateMatrixWorld(true); tgt.updateMatrixWorld(true);
  const worldQ = o => o.getWorldQuaternion(new THREE.Quaternion()), worldP = o => o.getWorldPosition(new THREE.Vector3());
  const parentQ = new THREE.Quaternion(), p = new THREE.Vector3();
  // Point each target limb bone the way the source's rest pose does (A-pose arms out to a T, and so on). The spine
  // and neck keep the target's own posture; straightening them to the source's tips the head back.
  for (const n of order) {
    const next = n.replace(/mixamorig/, '').replace(/^(Left|Right)?(.*)$/, (_, side = '', b) => {
      const chain = { Shoulder: 'Arm', Arm: 'ForeArm', ForeArm: 'Hand', Hand: 'HandMiddle1', UpLeg: 'Leg', Leg: 'Foot', Foot: 'ToeBase' };
      return chain[b] ? side + chain[b] : /^Hand\w+[12]$/.test(b) ? side + b.replace(/\d$/, d => +d + 1) : '';
    });
    const c = next && 'mixamorig' + next;
    if (!c || !S[c] || !T[c]) continue;
    const want = worldP(S[c]).sub(worldP(S[n])).normalize(), have = worldP(T[c]).sub(worldP(T[n])).normalize();
    const world = new THREE.Quaternion().setFromUnitVectors(have, want).multiply(worldQ(T[n]));
    T[n].quaternion.copy(T[n].parent.getWorldQuaternion(parentQ).invert().multiply(world)); T[n].updateMatrixWorld(true);
  }
  const offset = Object.fromEntries(order.map(n => [n, worldQ(S[n]).invert().multiply(worldQ(T[n]))]));
  const hips = 'mixamorigHips', restS = worldP(S[hips]), restT = worldP(T[hips]), ratio = restT.y / restS.y;
  return clip => {
    const mixer = new THREE.AnimationMixer(src), action = mixer.clipAction(clip).play();
    const frames = Math.max(2, Math.round(clip.duration * fps)), times = [], turns = order.map(() => []), path = [];
    for (let f = 0; f <= frames; f++) {
      const t = clip.duration * f / frames; times.push(t); mixer.setTime(t); src.updateMatrixWorld(true);
      order.forEach((n, i) => {
        T[n].parent.getWorldQuaternion(parentQ);
        T[n].quaternion.copy(parentQ.invert().multiply(worldQ(S[n]).multiply(offset[n])));
        T[n].updateMatrixWorld(true); turns[i].push(...T[n].quaternion.toArray());
      });
      p.copy(restT).addScaledVector(worldP(S[hips]).sub(restS), ratio); T[hips].parent.worldToLocal(p); path.push(p.x, p.y, p.z);
    }
    action.stop(); mixer.uncacheRoot(src);
    return new THREE.AnimationClip(clip.name, clip.duration, [
      ...order.map((n, i) => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, turns[i])),
      new THREE.VectorKeyframeTrack(hips + '.position', times, path),
    ]);
  };
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
