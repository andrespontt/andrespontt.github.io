// One layout for the visible furniture, walking and projectile collision.
export const SAFE_WALL = [
  [-6.7,0,-7.05,-1,4.3,-6.8], [1,0,-7.05,6.7,4.3,-6.8],
  [-1,2.55,-7.05,1,4.3,-6.8],
];
export const MEETING_TABLE = [-4.4,0,-5.5,-1.6,.87,-2.65];
export const CHAIRS = [[-4.95,-4.8,Math.PI/2],[-4.95,-3.35,Math.PI/2],[-1.05,-4.8,-Math.PI/2],[-1.05,-3.35,-Math.PI/2],[-3,-2.05,Math.PI]];
export const STORE_FURNITURE = [
  MEETING_TABLE,
  ...CHAIRS.map(([x,z])=>[x-.3,0,z-.3,x+.3,1,z+.3]),
  [5.35,0,-5.9,6.5,1.02,-1.8], // coffee / provisions counter
  [1.7,0,-6.65,4.7,1.1,-6.1], // radio cabinet
  [-6.6,0,-5.8,-6.05,2.8,-1.5], // shop shelving
  [-6.3,0,-9.4,-4.2,.8,-8.5], // safe room bench
  [3.2,0,-9.4,5.9,.85,-8.7], // emergency supplies
];
export const INTERIOR_BLOCKS = [...SAFE_WALL,...STORE_FURNITURE].filter(b=>b[1]<1.7).map(b=>[b[0],b[2],b[3],b[5]]);
export const VIP_HOME = [-3,-6.15], VIP_REFUGE = [-2.5,-8.5], ESCORT_REFUGE = [1.5,-8.15];
export const SAFE_APPROACH = [0,-6.15], SAFE_INSIDE = [0,-8.05];
export const safeDoorBounds = fraction => [-.98-fraction*2.08,.03,-7.02,.98-fraction*2.08,2.54,-6.84];
export const inDoorway = p => Math.abs(p.x)<1.3 && Math.abs(p.z+6.93)<.65;
