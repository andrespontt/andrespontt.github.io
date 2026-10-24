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
  if(!isIndoors({x,z}))return z>8.5||Math.abs(x)>8.1?'The street':'Front entrance';
  if(x< -1 && z< -1)return 'Bedroom';
  if(x< -1)return 'Living room';
  if(z<.2)return 'Kitchen & dining';
  return x>5?'Reading corner':'Foyer';
}
export function createState(){return {playing:false,started:false,time:0,player:{x:-3,z:1.5,y:0,velocity:0,yaw:Math.PI,pitch:0},doorOpen:false,spray:false,tv:true,crouched:false,seated:null,escort:false,caught:false,guards:[{x:-.65,z:7},{x:2.65,z:7}],backup:'idle',backupTime:0,clown:{x:-4,z:15,mode:'watch',timer:18},captionTime:0,sprayCooldown:0};}
export const GUARD_RADIUS=2.8;
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
export function hasClearPath(a,b,colliders,doorOpen){
  const steps=Math.max(1,Math.ceil(distance(a,b)/.07));
  for(let i=1;i<steps;i++){
    const x=a.x+(b.x-a.x)*i/steps,z=a.z+(b.z-a.z)*i/steps;
    if(colliders.some(c=>!(c.id==='door'&&doorOpen)&&c.top>1&&c.bottom<1.6&&x>c.x&&x<c.x+c.w&&z>c.z&&z<c.z+c.d))return false;
  }
  return true;
}
export function isProtected(state,colliders=[]){
  return state.guards.some(g=>distance(g,state.player)<=GUARD_RADIUS&&hasClearPath(g,state.player,colliders,state.doorOpen));
}
function escortPosition(state,g,dt,colliders){
  const p=state.player;
  // Follow the walk direction, not every camera turn. Keep the chosen shoulder
  // until it becomes obstructed so the guard does not keep crossing the view.
  const formation=g.formation??={x:p.x,z:p.z,yaw:p.yaw,side:0};
  const dx=p.x-formation.x,dz=p.z-formation.z;
  if(Math.hypot(dx,dz)>.015){
    const heading=Math.atan2(-dx,-dz),angle=Math.atan2(Math.sin(heading-formation.yaw),Math.cos(heading-formation.yaw));
    formation.yaw+=angle*(1-Math.exp(-4*dt));formation.x=p.x;formation.z=p.z;
  }
  const flank=side=>({x:Math.max(-11,Math.min(11,p.x+Math.sin(formation.yaw)*.85+Math.cos(formation.yaw)*1.8*side)),z:Math.max(6.6,Math.min(17.3,p.z+Math.cos(formation.yaw)*.85-Math.sin(formation.yaw)*1.8*side))});
  if(!formation.side)formation.side=distance(g,flank(1))<=distance(g,flank(-1))?1:-1;
  let target=flank(formation.side);
  const alternate=flank(-formation.side);
  if((distance(target,p)<1.5||!canStand(target.x,target.z,colliders,state.doorOpen))&&distance(alternate,p)>=1.5&&canStand(alternate.x,alternate.z,colliders,state.doorOpen)){
    formation.side*=-1;target=alternate;
  }
  return target;
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
    if(!following)g.formation=null;
    let target=following?escortPosition(state,g,dt,colliders):{x:i?2.65:-.65,z:7};
    const threat=!['gone','flee','blocked','stunned'].includes(c.mode);
    const threatDistance=distance(c,state.player);
    if(following&&threat&&threatDistance<6&&threatDistance>=3.8&&distance(g,state.player)<=GUARD_RADIUS&&hasClearPath(state.player,c,colliders,state.doorOpen)){
      const tx=(c.x-state.player.x)/threatDistance,tz=(c.z-state.player.z)/threatDistance;
      // Watch an approaching threat from an offset position before committing
      // to a block. Keep a stable side rather than weaving across the player.
      g.coverSide??=((g.x-state.player.x)*tz-(g.z-state.player.z)*tx>=0?1:-1);
      target={x:state.player.x+tx*1.2+tz*1.5*g.coverSide,z:Math.max(6.6,state.player.z+tz*1.2-tx*1.5*g.coverSide)};
    }else if(!following||!threat||threatDistance>=6)g.coverSide=null;
    const atDoor=distance(g,entrance)<3.5&&distance(c,entrance)<4.2&&c.z>6.2;
    const nearPlayer=distance(g,state.player)<=GUARD_RADIUS&&distance(c,state.player)<3.8;
    const intercepting=threat&&(following?nearPlayer:atDoor||nearPlayer)&&hasClearPath(g,c,colliders,state.doorOpen);
    if(intercepting){
      const d=distance(g,c);
      if(d>1.05)target={x:c.x+(g.x-c.x)/d*.95,z:Math.max(6.6,c.z+(g.z-c.z)/d*.95)};
      else target=g;
      // An escort reacts to the clown without abandoning the person he covers.
      const reach=distance(target,state.player);
      if(following&&reach>2.4)target={x:state.player.x+(target.x-state.player.x)*2.4/reach,z:Math.max(6.6,state.player.z+(target.z-state.player.z)*2.4/reach)};
    }
    // The posted guard may intercept, but cannot be lured away with the player.
    if(i===0){
      const reach=distance(target,entrance);
      if(reach>2.6)target={x:entrance.x+(target.x-entrance.x)*2.6/reach,z:entrance.z+(target.z-entrance.z)*2.6/reach};
    }
    const d=distance(g,target),step=Math.min(d,2.6*dt),personalSpace=1.35;
    let dx=d>.001?(target.x-g.x)/d*step:0,dz=d>.001?(target.z-g.z)/d*step:0;
    const gap=distance(g,state.player);
    if(following&&distance({x:g.x+dx,z:g.z+dz},state.player)<personalSpace){
      const rx=gap>.001?(g.x-state.player.x)/gap:Math.cos(g.formation.yaw),rz=gap>.001?(g.z-state.player.z)/gap:-Math.sin(g.formation.yaw);
      if(gap<personalSpace){dx=rx*2.6*dt;dz=rz*2.6*dt;}
      else{const side=rx*(target.z-g.z)-rz*(target.x-g.x)>=0?1:-1;dx=-rz*side*step;dz=rx*side*step;}
    }else if(following&&!intercepting&&d<.45){dx=dz=0;}
    if(dx||dz)movePlayer(g,dx,dz,colliders,state.doorOpen);
    g.z=Math.max(6.6,g.z); // Guards stay outside; their bodies never block player movement.
  });
}
export function rainSettings(player,doorOpen){
  const inside=player.x>=-8&&player.x<=8&&player.z>=-6&&player.z<=6;
  if(!inside)return {gain:.12,cutoff:4000};
  const doorway=Math.max(0,1-Math.hypot(player.x-1,player.z-6)/7);
  return {gain:.018+doorway*(doorOpen?.052:.008),cutoff:550+doorway*(doorOpen?1800:300)};
}
// A straight pursuit can get wedged against furniture or send the clown into
// the apartment when the player is in a side alley. Reuse a small navigation
// grid only when the direct walking route is obstructed. Test every grid edge
// with the same body clearance as movement, including the current door state.
const navigationGrids=new WeakMap(),navigationRoutes=new WeakMap();
const GRID_STEP=.4,GRID_WIDTH=58,GRID_HEIGHT=59;
const gridPoint=index=>({x:-11.4+(index%GRID_WIDTH)*GRID_STEP,z:-5.6+Math.floor(index/GRID_WIDTH)*GRID_STEP});
function walkClear(a,b,colliders,doorOpen){
  const steps=Math.max(1,Math.ceil(distance(a,b)/.09));
  for(let i=1;i<=steps;i++)if(!canStand(a.x+(b.x-a.x)*i/steps,a.z+(b.z-a.z)*i/steps,colliders,doorOpen))return false;
  return true;
}
function navigationGrid(colliders,doorOpen){
  let pair=navigationGrids.get(colliders);
  if(!pair){pair=[];navigationGrids.set(colliders,pair);}
  const slot=doorOpen?1:0;
  if(!pair[slot])pair[slot]=Array.from({length:GRID_WIDTH*GRID_HEIGHT},(_,index)=>{
    const point=gridPoint(index);return {point,walkable:canStand(point.x,point.z,colliders,doorOpen),edges:null};
  });
  return pair[slot];
}
function routeTo(from,to,colliders,doorOpen){
  const grid=navigationGrid(colliders,doorOpen);
  function nearest(point){
    const gx=Math.round((point.x+11.4)/GRID_STEP),gz=Math.round((point.z+5.6)/GRID_STEP),candidates=[];
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
      const x=gx+dx,z=gz+dz;if(x<0||x>=GRID_WIDTH||z<0||z>=GRID_HEIGHT)continue;
      const index=z*GRID_WIDTH+x;if(grid[index].walkable)candidates.push(index);
    }
    candidates.sort((a,b)=>distance(point,grid[a].point)-distance(point,grid[b].point));
    return candidates.find(index=>walkClear(point,grid[index].point,colliders,doorOpen));
  }
  const start=nearest(from),goal=nearest(to);
  if(start===undefined||goal===undefined)return [];
  const cost=new Float64Array(grid.length).fill(Infinity),previous=new Int32Array(grid.length).fill(-1),closed=new Uint8Array(grid.length),heap=[];
  function push(index,priority){
    let i=heap.length;heap.push({index,priority});
    while(i>0){const parent=(i-1)>>1;if(heap[parent].priority<=priority)break;[heap[i],heap[parent]]=[heap[parent],heap[i]];i=parent;}
  }
  function pop(){
    const first=heap[0],last=heap.pop();
    if(heap.length){heap[0]=last;let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;if(heap[i].priority<=heap[child].priority)break;[heap[i],heap[child]]=[heap[child],heap[i]];i=child;}}
    return first.index;
  }
  cost[start]=0;push(start,distance(grid[start].point,grid[goal].point));
  while(heap.length){
    const index=pop();if(closed[index])continue;closed[index]=1;
    if(index===goal){const points=[to];for(let i=goal;i!==-1;i=previous[i])points.push(grid[i].point);return points.reverse();}
    const node=grid[index];
    if(!node.edges){
      node.edges=[];const gx=index%GRID_WIDTH,gz=Math.floor(index/GRID_WIDTH);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dz)continue;const x=gx+dx,z=gz+dz;
        if(x<0||x>=GRID_WIDTH||z<0||z>=GRID_HEIGHT)continue;
        const next=z*GRID_WIDTH+x;
        if(grid[next].walkable&&walkClear(node.point,grid[next].point,colliders,doorOpen))node.edges.push(next);
      }
    }
    for(const next of node.edges){
      if(closed[next])continue;const candidate=cost[index]+distance(node.point,grid[next].point);
      if(candidate>=cost[next])continue;cost[next]=candidate;previous[next]=index;push(next,candidate+distance(grid[next].point,grid[goal].point));
    }
  }
  return [];
}
function pursue(actor,target,speed,dt,colliders,doorOpen){
  let waypoint=target;
  if(walkClear(actor,target,colliders,doorOpen))navigationRoutes.delete(actor);
  else{
    let route=navigationRoutes.get(actor);
    if(route)route.retry-=dt;
    if(!route||route.doorOpen!==doorOpen||route.colliders!==colliders||distance(route.goal,target)>.6||(!route.points.length&&route.retry<=0)){
      route={goal:{...target},doorOpen,colliders,points:routeTo(actor,target,colliders,doorOpen),retry:.75};navigationRoutes.set(actor,route);
    }
    while(route.points.length&&distance(actor,route.points[0])<.12)route.points.shift();
    while(route.points.length>1&&walkClear(actor,route.points[1],colliders,doorOpen))route.points.shift();
    if(route.points.length)waypoint=route.points[0];
  }
  const d=distance(actor,waypoint),step=Math.min(d,dt*speed);
  if(d>.01)movePlayer(actor,(waypoint.x-actor.x)/d*step,(waypoint.z-actor.z)/d*step,colliders,doorOpen);
}
export function isIndoors(position){return position.x>-8.1&&position.x<8.1&&position.z<6.25;}
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
    pursue(c,{x:11,z:17.3},3.6,dt,colliders,state.doorOpen);
    if(c.timer<=0){c.mode='watch';c.timer=22;}
    return;
  }
  const outside=!isIndoors(state.player);
  const chase=outside||state.doorOpen||isIndoors(c);
  c.mode=chase?'approach':'watch';
  const target=chase?state.player:{x:-4+Math.sin(state.time*.18)*4,z:15};
  pursue(c,target,chase?3.15:.5,dt,colliders,state.doorOpen);
  const close=distance(c,state.player);
  const defender=state.guards.findIndex(g=>!(g.cooldown>0)&&distance(g,c)<=1.25&&hasClearPath(g,c,colliders,state.doorOpen));
  if(defender!==-1){
    const guard=state.guards[defender];guard.punch=.65;guard.cooldown=1.1;
    c.mode='blocked';c.timer=.65;c.defender=defender;
    return 'block';
  }
  if(chase&&close<.75&&hasClearPath(c,state.player,colliders,state.doorOpen)){state.caught=true;c.mode='caught';return 'caught';}
}
