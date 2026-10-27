import {plan} from './city-paths.js';

const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const routeDistance=a=>{
  let x=a.x,z=a.z,total=0;
  for(const p of a.path||[]){total+=Math.hypot(p[0]-x,p[1]-z);[x,z]=p;}
  return total;
};

// Visual speed comes from actual displacement, so a blocked person does not run in place.
// Empty paths mean "no route", not "arrived". The caller keeps its explicit destination.
export function followRoute(actor,dt,{speed,move,peers=[],gap=.62}={}){
  if(dt<=0)return false;
  const point=actor.path?.[0];
  if(!point){actor.speed=0;actor.motionSpeed=0;return false;}
  const dx=point[0]-actor.x,dz=point[1]-actor.z,d=Math.hypot(dx,dz);
  actor.motionSpeed=(actor.motionSpeed||0)+(Math.min(speed,actor.path.length===1?Math.max(.25,d*3):speed)-(actor.motionSpeed||0))*(1-Math.exp(-dt*8));
  const step=Math.min(d,actor.motionSpeed*dt),x=actor.x,z=actor.z;
  if(d>.001){
    const nx=x+dx/d*step,nz=z+dz/d*step;
    const yielding=peers.some(p=>p!==actor&&p.state!=='down'&&Math.hypot(nx-p.x,nz-p.z)<gap&&Math.hypot(nx-p.x,nz-p.z)<Math.hypot(x-p.x,z-p.z)-1e-5);
    if(!yielding)move(actor,nx-x,nz-z);
    actor.yaw=(actor.yaw||0)+angle(actor.yaw||0,Math.atan2(dx,dz)+Math.PI)*(1-Math.exp(-dt*8));
  }
  actor.speed=Math.hypot(actor.x-x,actor.z-z)/dt;
  actor.blockedFor=step>.002&&actor.speed<.08?(actor.blockedFor||0)+dt:0;
  if(Math.hypot(point[0]-actor.x,point[1]-actor.z)<.045){
    actor.path.shift();actor.blockedFor=0;
    if(!actor.path.length){actor.speed=actor.motionSpeed=0;return true;}
  }
  return false;
}

// Steering retains the planner's adjusted endpoint and measures progress to the
// current corner, not the final destination (a valid detour may initially go away).
export function navigate(actor,tx,tz,step,dt,{move,rects}){
  if(dt<=0)return null;
  let nav=actor.navigation;
  if(!nav||Math.hypot(nav.goal[0]-tx,nav.goal[1]-tz)>.15){
    nav=actor.navigation={goal:[tx,tz],route:[[tx,tz]],best:Infinity,stalled:0,retry:0,planned:false,arrived:false};
  }
  actor.lost=false;actor.navArrived=nav.arrived;nav.retry=Math.max(0,nav.retry-dt);
  if(nav.arrived)return null;
  if(!nav.route.length){actor.lost=true;if(nav.retry>0)return null;nav.stalled=2;}
  const p=nav.route[0]||nav.goal,dx=p[0]-actor.x,dz=p[1]-actor.z,d=Math.hypot(dx,dz);
  const before=[actor.x,actor.z],s=Math.min(step,d);
  if(d>.001&&nav.route.length)move(actor,dx/d*s,dz/d*s);
  const left=Math.hypot(p[0]-actor.x,p[1]-actor.z);
  if(left<nav.best-.04){nav.best=left;nav.stalled=0;}else if(step>.001)nav.stalled+=dt;
  if(nav.route.length&&left<.08){
    nav.route.shift();nav.best=Infinity;nav.stalled=0;
    if(!nav.route.length){nav.arrived=true;actor.navArrived=true;}
  }
  if(nav.stalled>.8&&nav.retry===0){
    nav.route=plan([actor.x,actor.z],nav.goal,rects([actor.x,actor.z],nav.goal),.3);
    nav.planned=true;nav.best=Infinity;nav.stalled=0;nav.retry=1;
    actor.lost=!nav.route.length;
  }
  const mx=actor.x-before[0],mz=actor.z-before[1];
  return Math.hypot(mx,mz)>.0001?Math.atan2(mx,mz)+Math.PI:null;
}

export function friendlyInLine(shooter,target,friends,radius=.4){
  const dx=target.x-shooter.x,dz=target.z-shooter.z,length2=dx*dx+dz*dz;
  if(length2<.01)return false;
  return friends.some(p=>{
    if(p===shooter||p.state==='down'||p.state==='wait'||p.state==='escaped')return false;
    const t=((p.x-shooter.x)*dx+(p.z-shooter.z)*dz)/length2;
    return t>.02&&t<.95&&Math.hypot(p.x-shooter.x-t*dx,p.z-shooter.z-t*dz)<radius;
  });
}
