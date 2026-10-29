import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';

// Use the same vendored Three.js as the browser; no npm copy or renderer needed.
registerHooks({resolve(specifier,context,next){
  if(specifier==='three')return {url:new URL('../vendor/three.module.min.js',import.meta.url).href,shortCircuit:true};
  if(specifier.startsWith('three/addons/'))return {url:new URL('../vendor/three-addons/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
const THREE=await import('three');
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {addCommandStaff,OPERATOR_STATIONS,COMMAND_GUARDS}=await import('./crew.js');
const {bone}=await import('./rig.js');

async function loadRig(){
  const binary=await readFile(new URL('./assets/Soldier.glb',import.meta.url)),length=binary.readUInt32LE(12);
  const json=JSON.parse(binary.subarray(20,20+length).toString());
  // Textures are irrelevant to pose checks and require browser image decoding.
  for(const mesh of json.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  json.materials=[];json.textures=[];json.images=[];
  const text=Buffer.from(JSON.stringify(json));const padding=(4-text.length%4)%4;
  const chunk=Buffer.concat([text,Buffer.alloc(padding,32)]),bin=binary.subarray(20+length);
  const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+chunk.length+bin.length,8);header.writeUInt32LE(chunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const buffer=Buffer.concat([header,chunk,bin]);
  return new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.length),'');
}

test('operators stay seated with feet under the desks and actual rigged hands on keyboards',async()=>{
  const gltf=await loadRig(),scene=new THREE.Scene(),staff=addCommandStaff(scene,gltf);
  for(const time of [0,1,30,300]){
    staff.update(time,1/30);scene.updateMatrixWorld(true);
    OPERATOR_STATIONS.forEach((z,index)=>{
      const frame=scene.children[index],model=frame.children[0];
      const local=name=>frame.worldToLocal(bone(model,name).getWorldPosition(new THREE.Vector3()));
      assert.ok(local('Hips').distanceTo(new THREE.Vector3(0,.66,-.08))<.005,'pelvis stays on seat');
      for(const side of ['Left','Right']){
        const hand=local(side+'Hand'),foot=local(side+'Foot'),knee=local(side+'Leg');
        assert.ok(Math.abs(hand.z+.41)<.035&&Math.abs(hand.y-1.025)<.035,`${side} hand reaches keyboard: ${hand.toArray()}`);
        assert.ok(Math.abs(foot.z+.55)<.025&&Math.abs(foot.y-.12)<.025,`${side} foot rests under desk`);
        assert.ok(knee.y>foot.y+.2&&knee.z<-.2,'bent seated leg, not a standing pose');
      }
    });
  }
  staff.dispose();
});

test('guards stay upright at ease with visible arms holding rifles across the lower back',async()=>{
  const scene=new THREE.Scene(),staff=addCommandStaff(scene,await loadRig());
  for(let i=0;i<300;i++)staff.update(i/30,1/30);
  for(const [index,g] of COMMAND_GUARDS.entries()){
    const model=scene.children[2+index*2],rifle=scene.children[3+index*2];
    assert.equal(model.position.x,g.x);assert.equal(model.position.z,g.z);
    const local=name=>model.worldToLocal(bone(model,name).getWorldPosition(new THREE.Vector3()));
    for(const side of ['Left','Right']){
      const hand=local(side+'Hand'),hips=local('Hips');
      assert.ok(hand.z>.15&&hand.y<hips.y+.13,`${side} hand relaxed behind waist: ${hand.toArray()}`);
      assert.ok(local(side+'ToeBase').z<local(side+'Foot').z-.04,'boots face forward');
    }
    assert.ok(local('Head').y>1.4,'upright, not in a combat crouch');
    assert.ok(local('LeftFoot').distanceTo(local('RightFoot'))>.36,'feet comfortably apart');
    assert.ok(rifle.visible);
    const right=bone(model,'RightHand').getWorldPosition(new THREE.Vector3()),left=bone(model,'LeftHand').getWorldPosition(new THREE.Vector3());
    right.y-=.055;left.y-=.055;
    assert.ok(rifle.position.distanceTo(right)<.002,'weapon is actually carried by right hand');
    assert.ok(rifle.getWorldDirection(new THREE.Vector3()).dot(left.clone().sub(right).normalize())>.999,'left hand supports the barrel');
    for(const side of ['Left','Right'])assert.ok(Math.abs(local(side+'ForeArm').x)>.3,'elbows stay outside torso armor');
    assert.ok(Math.abs(g.x)>.3+1.25,'central entrance walkway stays free');
  }
  staff.dispose();
});
