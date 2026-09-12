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
export function createState(){return {playing:false,started:false,time:0,player:{x:-3,z:1.5,y:0,velocity:0,yaw:Math.PI,pitch:0},doorOpen:false,spray:false,tv:true,crouched:false,seated:null,escort:false,caught:false,guards:[{x:-.65,z:7},{x:2.65,z:7}],backup:'idle',backupTime:0,clown:{x:-4,z:15,mode:'watch',timer:18},captionTime:0,sprayCooldown:0};}
export const GUARD_RADIUS=2.8;
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function clearPath(a,b,colliders,doorOpen){
  const steps=Math.max(1,Math.ceil(distance(a,b)/.07));
  for(let i=1;i<steps;i++){
    const x=a.x+(b.x-a.x)*i/steps,z=a.z+(b.z-a.z)*i/steps;
    if(colliders.some(c=>!(c.id==='door'&&doorOpen)&&c.top>1&&c.bottom<1.6&&x>c.x&&x<c.x+c.w&&z>c.z&&z<c.z+c.d))return false;
  }
  return true;
}
export function isProtected(state,colliders=[]){
  return state.guards.some(g=>distance(g,state.player)<=GUARD_RADIUS&&clearPath(g,state.player,colliders,state.doorOpen));
}
export function updateGuards(state,dt,colliders=[]){
  if(state.caught)return;
  const entrance={x:1,z:6.8},c=state.clown;
  state.guards.forEach((g,i)=>{
    g.punch=Math.max(0,(g.punch||0)-dt);
    g.cooldown=Math.max(0,(g.cooldown||0)-dt);
    if(g.punch>0)return;
    // Hayes always holds the doorway. Rivera can escort the player outside.
    const following=i===1&&state.escort&&state.player.z>6.3;
    let target=following?{x:Math.max(-11,Math.min(11,state.player.x+.8)),z:Math.max(6.6,state.player.z-.8)}:{x:i?2.65:-.65,z:7};
    const threat=!['gone','flee','blocked','stunned'].includes(c.mode);
    const atDoor=distance(g,entrance)<3.5&&distance(c,entrance)<4.2&&c.z>6.2;
    const nearPlayer=distance(g,state.player)<=GUARD_RADIUS&&distance(c,state.player)<3.8;
    if(threat&&(atDoor||nearPlayer)&&clearPath(g,c,colliders,state.doorOpen)){
      const d=distance(g,c);
      if(d>1.05)target={x:c.x+(g.x-c.x)/d*.95,z:Math.max(6.6,c.z+(g.z-c.z)/d*.95)};
      else target=g;
    }
    const d=distance(g,target),step=Math.min(d,2.6*dt);
    if(d>.001)movePlayer(g,(target.x-g.x)/d*step,(target.z-g.z)/d*step,colliders,state.doorOpen);
    g.z=Math.max(6.6,g.z); // Guards stay outside; their bodies never block player movement.
  });
}
export function rainSettings(player,doorOpen){
  const inside=player.x>=-8&&player.x<=8&&player.z>=-6&&player.z<=6;
  if(!inside)return {gain:.12,cutoff:4000};
  const doorway=Math.max(0,1-Math.hypot(player.x-1,player.z-6)/7);
  return {gain:.018+doorway*(doorOpen?.052:.008),cutoff:550+doorway*(doorOpen?1800:300)};
}
export function updateClown(state,dt,colliders=[]) {
  if(state.caught)return;
  const c=state.clown;c.timer-=dt;
  if(state.backup==='arrived'){c.mode='gone';return;}
  if(c.mode==='blocked'){
    if(c.timer<=.45){
      const guard=state.guards[c.defender];
      if(guard){
        const d=Math.max(.01,distance(c,guard));
        const outward=distance(c,{x:1,z:6.8})<3;
        movePlayer(c,(c.x-guard.x)/d*.65,(outward?Math.max(.5,(c.z-guard.z)/d):(c.z-guard.z)/d)*.65,colliders,state.doorOpen);
      }
      c.mode='stunned';c.timer=.45;return 'guard';
    }
    return;
  }
  if(c.mode==='stunned'){
    if(c.timer<=0){c.mode='flee';c.timer=7;}
    return;
  }
  if(c.mode==='flee'){
    const exit=c.z<6.35?{x:1,z:Math.abs(c.x-1)>.4?5.4:6.7}:{x:11,z:17.3};
    const distanceToExit=distance(c,exit),step=Math.min(distanceToExit,dt*3.6);
    if(distanceToExit>.01)movePlayer(c,(exit.x-c.x)/distanceToExit*step,(exit.z-c.z)/distanceToExit*step,colliders,state.doorOpen);
    if(c.timer<=0){c.mode='watch';c.timer=22;}
    return;
  }
  const outside=state.player.z>6.25;
  const chase=outside||state.doorOpen||c.z<6;
  c.mode=chase?'approach':'watch';
  let target=chase?state.player:{x:-4+Math.sin(state.time*.18)*4,z:15};
  // Route through the entrance rather than walking through the facade.
  if(chase&&c.z>6.35&&state.player.z<6.35)target={x:1,z:Math.abs(c.x-1)>.4?6.65:5.4};
  if(chase&&c.z<5.7&&state.player.z>6.35)target={x:1,z:Math.abs(c.x-1)>.4?5.4:6.7};
  const d=distance(c,target),step=Math.min(d,dt*(chase?3.15:.5));
  if(d>.01)movePlayer(c,(target.x-c.x)/d*step,(target.z-c.z)/d*step,colliders,state.doorOpen);
  const close=distance(c,state.player);
  const defender=state.guards.findIndex(g=>!(g.cooldown>0)&&distance(g,c)<=1.25&&clearPath(g,c,colliders,state.doorOpen));
  if(defender!==-1){
    const guard=state.guards[defender];guard.punch=.65;guard.cooldown=1.1;
    c.mode='blocked';c.timer=.65;c.defender=defender;
    return 'block';
  }
  if(chase&&close<.75&&clearPath(c,state.player,colliders,state.doorOpen)){state.caught=true;c.mode='caught';return 'caught';}
}
