import { createCabin } from '../cabin.js';
import { moveInCabin } from '../movement.mjs';
export async function createArea(saved={}){
 const scene=await createCabin();let doorOpen=Boolean(saved.doorOpen);
 const door=scene.userData.privateDoor;door.position.x=doorOpen?1.65:0;
 return {scene,eyeHeight:2.3,spawn:{x:0,z:-1.6,yaw:0,pitch:-.08},
  move(p,dx,dz){moveInCabin(p,dx,dz,doorOpen&&door.position.x>1.45);},
  getInteraction(p){
   if(Math.abs(p.z+8.15)<2.2&&Math.abs(p.x)<1.3)return {label:doorOpen?'Close private room':'Open your private room',action(){if(doorOpen&&Math.abs(p.z+8.15)<.55)return;doorOpen=!doorOpen;}};
   if(Math.hypot(p.x-1.7,p.z-1.1)<2)return {label:'Disembark · Snowfield',destination:'outside',entry:'vehicle'};
   return null;
  },
  update(dt,{weather}={}){door.position.x+=((doorOpen?1.65:0)-door.position.x)*Math.min(1,dt*9);scene.userData.updateBackdrop?.(dt,weather);},
  snapshot(){return {doorOpen};}
 };
}
