// One layout for the visible furniture, walking and projectile collision.
// Safe room: a 6.4 m square in the back-right corner of the store (x .3 → 6.7, z -9.7 → -3.3).
// Walls are .25 m thick; the 2 m security door is in the front wall and slides east into a pocket.
export const SAFE_ROOM = { x0: .55, x1: 6.7, z0: -9.7, z1: -3.55 }; // inside faces
export const SAFE_DOOR_X = 3.6, SAFE_DOOR_Z = -3.43;
export const SAFE_WALL = [
  [.3,0,-9.7,.55,4.3,-3.3], // west wall
  [.55,0,-3.55,2.6,4.3,-3.3], [4.6,0,-3.55,6.7,4.3,-3.3], // front wall either side of the door
  [2.6,2.55,-3.55,4.6,4.3,-3.3], // over the door
];
export const MEETING_TABLE = [-4.4,0,-5.5,-1.6,.87,-2.65];
export const CHAIRS = [[-4.95,-4.8,Math.PI/2],[-4.95,-3.35,Math.PI/2],[-1.05,-4.8,-Math.PI/2],[-1.05,-3.35,-Math.PI/2],[-3,-2.05,Math.PI]];
export const STORE_FURNITURE = [
  MEETING_TABLE,
  ...CHAIRS.map(([x,z])=>[x-.3,0,z-.3,x+.3,1,z+.3]),
  [5.35,0,-2.7,6.5,1.02,-.9], // coffee / provisions counter
  [-6.6,0,-5.8,-6.05,2.8,-1.5], // shop shelving
  [-5.6,0,-9.6,-4.4,1.6,-8.4], // storeroom crates
  // Inside the safe room:
  [.6,0,-8.6,1.15,1.1,-5.6], // radio cabinet on the west wall
  [3.6,0,-9.6,5.9,.92,-8.7], // bench on the back wall
  [6.05,0,-8.3,6.6,1.3,-5.6], // emergency supplies on the east wall
];
export const INTERIOR_BLOCKS = [...SAFE_WALL,...STORE_FURNITURE].filter(b=>b[1]<1.7).map(b=>[b[0],b[2],b[3],b[5]]);
export const VIP_HOME = [-3,-6.15], VIP_REFUGE = [4.7,-7.9], ESCORT_REFUGE = [2.6,-5.3];
export const SAFE_APPROACH = [SAFE_DOOR_X,-2.65], SAFE_INSIDE = [SAFE_DOOR_X,-4.55];
export const safeDoorBounds = fraction => [SAFE_DOOR_X-.98+fraction*2.08,.03,-3.52,SAFE_DOOR_X+.98+fraction*2.08,2.54,-3.34];
export const inDoorway = p => Math.abs(p.x-SAFE_DOOR_X)<1.3 && Math.abs(p.z-SAFE_DOOR_Z)<.65;
export const inSafeRoom = p => p.x > SAFE_ROOM.x0 - .1 && p.z < SAFE_ROOM.z1 + .1;
