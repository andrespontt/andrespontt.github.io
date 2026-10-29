import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { bone, placeHips, solveTwoBone, aimBone } from './rig.js';

export const soldierUrl = new URL('./assets/Soldier.glb', import.meta.url).href;

// Seat and wheel layout shared with cabin.js so drivers always fit their controls.
export const DRIVER = { floor: .725, seatTop: 1.2, seatZ: 2.9, wheelY: 1.52, wheelZ: 3.32 };

// Local workstation coordinates: the operator looks down -Z; the complete
// station is turned toward the east wall by bunker.js.
export const OPERATOR_STATIONS = [-2.55,-.65];
export const COMMAND_GUARDS = [{x:-1.85,z:3.65,yaw:-.18},{x:1.85,z:3.65,yaw:.18}];

export function addCommandStaff(scene,gltf){
  const operators=[],guards=[],mixers=[];
  const vector=(frame,x,y,z)=>frame.localToWorld(new THREE.Vector3(x,y,z));
  const prepare=()=>{
    const model=cloneRig(gltf.scene);
    model.traverse(n=>{if(n.isMesh)n.frustumCulled=false;});
    return model;
  };
  for(const [index,z] of OPERATOR_STATIONS.entries()){
    const frame=new THREE.Group();frame.position.set(3,0,z);frame.rotation.y=-Math.PI/2;scene.add(frame);
    const model=prepare();frame.add(model);
    const pose=gltf.animations.find(c=>c.name==='TPose');
    if(pose){const mixer=new THREE.AnimationMixer(model);mixer.clipAction(pose).play();mixer.setTime(0);mixers.push(mixer);}
    // placeHips assumes the model's parent has no rotation, so translate in
    // local station coordinates before rotating the complete station.
    frame.rotation.y=0;frame.updateWorldMatrix(true,true);
    placeHips(model,vector(frame,0,.66,-.08));
    frame.rotation.y=-Math.PI/2;frame.updateWorldMatrix(true,true);
    for(const side of ['Left','Right']){
      const s=side==='Left'?-1:1;
      solveTwoBone(bone(model,side+'UpLeg'),bone(model,side+'Leg'),bone(model,side+'Foot'),vector(frame,s*.16,.12,-.55),vector(frame,s*.18,.95,-1));
      aimBone(bone(model,side+'Foot'),bone(model,side+'ToeBase'),vector(frame,s*.16,.08,-.78));
    }
    operators.push({frame,model,index});
  }
  const weaponMaterial=new THREE.MeshStandardMaterial({color:'#27302d',metalness:.55,roughness:.65});
  const weaponGeometry=new THREE.BoxGeometry(1,1,1);
  for(const {x,z,yaw} of COMMAND_GUARDS){
    const model=prepare();model.position.set(x,.035,z);model.rotation.y=yaw;scene.add(model);
    // The asset's Idle is a combat crouch. Start from its upright rest pose
    // instead, with planted feet and hands resting together behind the waist.
    const mixer=new THREE.AnimationMixer(model),rest=gltf.animations.find(c=>c.name==='TPose');
    if(rest){mixer.clipAction(rest).play();mixer.setTime(0);}mixers.push(mixer);
    model.updateWorldMatrix(true,true);
    const hips=model.worldToLocal(bone(model,'Hips').getWorldPosition(new THREE.Vector3()));
    for(const side of ['Left','Right']){
      const s=side==='Left'?-1:1,foot=model.worldToLocal(bone(model,side+'Foot').getWorldPosition(new THREE.Vector3()));
      solveTwoBone(bone(model,side+'UpLeg'),bone(model,side+'Leg'),bone(model,side+'Foot'),vector(model,s*.21,foot.y,foot.z),vector(model,s*.21,.6,-.5));
      aimBone(bone(model,side+'Foot'),bone(model,side+'ToeBase'),vector(model,s*.25,foot.y-.04,foot.z-.23));
    }
    const resting=[];model.traverse(n=>{if(n.isBone)resting.push([n,n.quaternion.clone()]);});
    const rifle=new THREE.Group();scene.add(rifle);
    for(const [w,h,d,px,py,pz] of [[.075,.12,.4,0,0,.1],[.055,.06,.28,0,.02,.43],[.095,.16,.19,0,-.01,-.17],[.06,.16,.07,0,-.12,.02],[.065,.18,.1,0,-.12,.2]]){
      const part=new THREE.Mesh(weaponGeometry,weaponMaterial);part.scale.set(w,h,d);part.position.set(px,py,pz);rifle.add(part);
    }
    guards.push({model,rifle,hips,resting,x,z,yaw});
  }
  function update(time,dt){
    for(const {frame,model,index} of operators){
      frame.updateWorldMatrix(true,true);
      for(const side of ['Left','Right']){
        const s=side==='Left'?-1:1,tap=Math.max(0,Math.sin(time*3.4+index*2+s))* .008;
        solveTwoBone(bone(model,side+'Arm'),bone(model,side+'ForeArm'),bone(model,side+'Hand'),vector(frame,s*.2,1.025+tap,-.41),vector(frame,s*.55,.85,-.15));
        aimBone(bone(model,side+'Hand'),bone(model,side+'HandMiddle1'),vector(frame,s*.2,1.01+tap,-.61));
      }
    }
    for(const g of guards){
      for(const [joint,q] of g.resting)joint.quaternion.copy(q);
      const spine=bone(g.model,'Spine2');if(spine)spine.rotation.x+=Math.sin(time*1.2+g.x)*.006;
      const head=bone(g.model,'Head');if(head)head.rotation.y+=Math.sin(time*.3+g.x)*.08;
      g.model.updateWorldMatrix(true,true);
      for(const side of ['Left','Right']){
        const s=side==='Left'?-1:1;
        solveTwoBone(bone(g.model,side+'Arm'),bone(g.model,side+'ForeArm'),bone(g.model,side+'Hand'),vector(g.model,s*.27,g.hips.y+.08,.28),vector(g.model,s*.65,g.hips.y+.2,.12));
        aimBone(bone(g.model,side+'Hand'),bone(g.model,side+'HandMiddle1'),vector(g.model,s*.27,g.hips.y-.06,.24));
        // Curl the actual finger joints around the lowered weapon, rather than
        // leaving the open, straight fingers from the T-pose beside the grip.
        const axis=new THREE.Vector3(1,0,0).transformDirection(g.model.matrixWorld);
        for(const finger of ['Index','Middle','Ring','Pinky'])for(let joint=1;joint<=3;joint++){
          const digit=bone(g.model,side+'Hand'+finger+joint);if(!digit)continue;
          const parentRotation=digit.parent.getWorldQuaternion(new THREE.Quaternion());
          const localAxis=axis.clone().applyQuaternion(parentRotation.invert());
          digit.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(localAxis,joint===1?.55:.9));
          digit.updateWorldMatrix(false,true);
        }
      }
      // The hands carry the rifle across the lower back; never attach a weapon
      // to an unrelated fixed offset or tuck the forearms through the torso.
      const right=bone(g.model,'RightHand').getWorldPosition(new THREE.Vector3());
      const left=bone(g.model,'LeftHand').getWorldPosition(new THREE.Vector3());
      right.y-=.055;left.y-=.055;
      g.rifle.position.copy(right);g.rifle.lookAt(left);
    }
  }
  update(0,0);
  return {update,dispose(){for(const mixer of mixers){mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());}}};
}

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
