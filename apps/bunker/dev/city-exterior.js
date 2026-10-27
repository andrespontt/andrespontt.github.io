// Shared by the rendered cordon, body/projectile collision and approach routes.
// The six-metre south street has a three-metre central barrier, leaving a
// 1.5-metre passage on each side. Never put cones or props inside these lanes.
export const CORDON_BARRIERS = [
  ...[-15,15].flatMap(x=>[5.2,7.6,12.6].map(z=>({x,z,width:.7,depth:2.4}))),
  {x:0,z:17.6,width:3,depth:.7},
];
export const CORDON_SOLIDS = CORDON_BARRIERS.map(({x,z,width,depth})=>[x-width/2,0,z-depth/2,x+width/2,1.05,z+depth/2]);
export const APPROACHES = [
  {zone:'east',crossingAt:3},
  {zone:'west',crossingAt:3},
  {zone:'south',crossingAt:4},
];

export function approachSteps(index){
  const group=Math.floor(index/3),zone=index%3,spread=[0,.16,-.16,.08,-.08][group%5];
  if(zone===2){
    const side=group%2===0?-1:1,x=side*(2.2+spread);
    return [[spread,34],[spread,25.5],[spread,19.4],[x,18.8],[x,16.1],[side*3.2,7],[side*.45,2.7],[side*.3,-1.4]];
  }
  const side=zone===0?1:-1;
  // Pass through the 2.6 m opening between the side barriers, then around
  // the north end of the parked truck, instead of vaulting into its collider.
  return [[side*28,10+spread],[side*19.7,10+spread],[side*16,10+spread],[side*14.2,10+spread],[side*14.2,7.1],[side*10.5,7.1],[side*3.2,7],[side*.45,2.7],[side*.3,-1.4]];
}
