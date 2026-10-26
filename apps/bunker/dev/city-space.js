// Solid city geometry shared by walking, sight lines and projectiles.
// Boxes are [minX, minY, minZ, maxX, maxY, maxZ]. Door openings remain open.
// Display windows in the store front: [minX, maxX]. Openings run from the sill (1.25) to 2.45.
export const WINDOWS = [[-5,-2.8],[2.8,5]];
export const STORE_FRONT = [
  [-7,0,1.2,-5,4.4,1.5],[-2.8,0,1.2,-1,4.4,1.5],
  [1,0,1.2,2.8,4.4,1.5],[5,0,1.2,7,4.4,1.5],
  [-1,2.6,1.2,1,4.4,1.5],
  ...WINDOWS.flatMap(([a,b])=>[[a,0,1.2,b,1.25,1.5],[a,2.45,1.2,b,4.4,1.5]]),
  // Boards nailed across the top of each window leave a firing slit from the sill to ~1.95.
  ...WINDOWS.map(([a,b])=>[a,1.95,1.08,b,2.45,1.2]),
];
// Wrecks, a dumpster and crates outside the cordon that intruders hide behind.
// Car boxes are loose bounds around the rotated wrecks, up to the bonnet line (you can see over the roof).
export const COVER_PROPS = [
  [22.85,0,6.72,26.15,1.25,11.28],[23.25,0,4.07,27.75,1.25,6.93],[21.5,0,11,24.5,1.25,15.6],
  [-26.15,0,7.22,-22.85,1.25,11.78],[-23.8,0,2.36,-21.2,1.25,6.84],[-21.6,0,13.6,-20.2,1.3,15],
  [1.4,0,21.5,2.9,1.4,23.3],[-2.9,0,20,-1.7,1.1,21],
];
// Burning barrels on the street: [x, z, castsLight].
export const FIRE_BARRELS = [[-19.1,14.9,true],[18.6,9.5,true],[-18.6,6.8,false],[-2.4,26.5,true],[9.8,15.2,false]];
export const SOLIDS = [
  ...COVER_PROPS,
  ...FIRE_BARRELS.map(([x,z])=>[x-.3,0,z-.3,x+.3,.9,z+.3]),
  // Store interior: cooler bank, storeroom crates and desk.
  [-6.5,0,-7.7,-1.2,2.3,-7.12],[1.2,0,-7.7,5.6,2.3,-7.12],[-5.6,0,-9.6,-4.4,1.6,-8.4],[2,0,-9.6,3.6,.8,-8.9],
  [-27,0,-12,-7.4,10.5,1.5],[9.6,0,-12,27,13,1.5],
  [-27,0,16.5,-3,12,30],[3,0,16.5,27,9,30],
  [-7,0,-10,-6.7,7.6,1.2],[6.7,0,-10,7,7.6,-7.8],[6.7,0,-6.2,7,7.6,1.2],
  [6.7,2.4,-7.8,7,7.6,-6.2],[-7,0,-10,7,7.6,-9.7],
  ...STORE_FRONT,
  [-7,4.4,1.2,7,7.6,1.5],[-7.2,7.6,-10.2,7.2,8.1,1.7],[-6.7,4.3,-9.7,6.7,4.4,1.2],
  [-6.7,0,-7.9,-1,4.4,-7.7],[1,0,-7.9,6.7,4.4,-7.7],[-1,2.5,-7.9,1,4.4,-7.7],
  [-3.9,0,-6.2,-3.1,1.45,-2.4],[3.1,0,-6.2,3.9,1.45,-2.4],[3.2,0,-.95,6.2,1.05,-.35],
  [-13.7,0,7.7,-11.5,2.1,12.3],[11.5,0,7.7,13.7,2.1,12.3],
  [4.1,0,9.8,8.5,1.25,12],[-9.2,0,4.5,-4.8,1.25,6.7],
  [7.6,0,-9,9.2,1.3,-7.2],
  ...[-15,15].flatMap(x=>[5.2,7.6,12.6].map(z=>[x-.35,0,z-1.2,x+.35,1.05,z+1.2])),
  ...[-1.3,1.3].map(x=>[x-1.2,0,17.25,x+1.2,1.05,17.95]),
];

export function firstObstruction(origin,dir,maxDistance=60,boxes=SOLIDS) {
  let nearest=maxDistance;
  for(const b of boxes){
    let enter=0,exit=nearest;
    for(let i=0;i<3;i++){
      const key=['x','y','z'][i],o=origin[key],d=dir[key];
      if(Math.abs(d)<1e-9){if(o<b[i]||o>b[i+3]){exit=-1;break;}continue;}
      let a=(b[i]-o)/d,c=(b[i+3]-o)/d;if(a>c)[a,c]=[c,a];
      enter=Math.max(enter,a);exit=Math.min(exit,c);if(enter>exit)break;
    }
    if(enter<=exit&&exit>=0)nearest=Math.min(nearest,enter);
  }
  return nearest;
}

export function sphereEntry(origin,dir,center,radius){
  const x=center.x-origin.x,y=center.y-origin.y,z=center.z-origin.z,along=x*dir.x+y*dir.y+z*dir.z;
  const d2=x*x+y*y+z*z-along*along;if(d2>radius*radius)return Infinity;
  const half=Math.sqrt(Math.max(0,radius*radius-d2));return along+half<0?Infinity:Math.max(0,along-half);
}

export function moveThroughCity(p,dx,dz){
  const radius=.26;
  const blocked=(x,z)=>Math.abs(x)>31||z< -21||z>34||SOLIDS.some(b=>b[1]<1.7&&b[4]>.25&&x>b[0]-radius&&x<b[3]+radius&&z>b[2]-radius&&z<b[5]+radius);
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
  for(let i=0;i<steps;i++){if(!blocked(p.x+dx/steps,p.z))p.x+=dx/steps;if(!blocked(p.x,p.z+dz/steps))p.z+=dz/steps;}
  return p;
}
