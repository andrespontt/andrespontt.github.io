// Kinematic walking only: no dynamic rigid bodies. Substeps prevent tunnelling
// through thin walls, and separate axis resolution lets the player slide along them.
export function canStand(x,z,colliders,doorOpen=false) {
  const r=.23;
  if(x < -11.5 || x > 11.5 || z < -5.65 || z > 17.6)return false;
  return !colliders.some(c=>!(c.id==='door' && doorOpen) && c.top>.15 && c.bottom<1.7 && x+r>c.x && x-r<c.x+c.w && z+r>c.z && z-r<c.z+c.d);
}
export function movePlayer(player,dx,dz,colliders,doorOpen) {
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.09));
  for(let i=0;i<steps;i++) {
    if(canStand(player.x+dx/steps,player.z,colliders,doorOpen))player.x+=dx/steps;
    if(canStand(player.x,player.z+dz/steps,colliders,doorOpen))player.z+=dz/steps;
  }
}
export function roomAt(x,z) {
  if(z>6.1)return z>8.5?'The street':'Front entrance';
  if(x< -1 && z< -1)return 'Bedroom';
  if(x< -1)return 'Living room';
  if(z<.2)return 'Kitchen & dining';
  return x>5?'Reading corner':'Foyer';
}
export function createState(){return {playing:false,started:false,time:0,player:{x:-3,z:1.5,y:0,velocity:0,yaw:Math.PI,pitch:0},doorOpen:false,spray:false,tv:true,crouched:false,seated:null,escort:false,backup:'idle',backupTime:0,clown:{x:-4,z:15,mode:'watch',timer:18},captionTime:0,sprayCooldown:0};}
export function updateClown(state,dt) {
  const c=state.clown;c.timer-=dt;
  if(state.backup==='arrived'){c.mode='gone';return;}
  if(c.mode==='flee'){
    c.x+=dt*3;c.z=Math.min(18,c.z+dt*2);
    if(c.timer<=0){c.mode='watch';c.timer=22;c.x=-4;c.z=15;}
  } else {
    const outside=state.player.z>8;
    c.mode=outside?'approach':'watch';
    const tx=outside?state.player.x:-4+Math.sin(state.time*.18)*4;
    const tz=outside?state.player.z:15;
    const d=Math.hypot(tx-c.x,tz-c.z);
    if(d>.1){c.x+=(tx-c.x)/d*dt*(outside?1.5:.5);c.z+=(tz-c.z)/d*dt*(outside?1.5:.5);}
    c.z=Math.max(8.7,c.z); // The guards always hold the threshold.
    if(outside && d<2.8){c.mode='flee';c.timer=7;return 'guard';}
  }
}
