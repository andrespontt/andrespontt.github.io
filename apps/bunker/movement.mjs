export const cabinBounds={minX:-2.12,maxX:2.12,minZ:-12.05,maxZ:4.05};
export const obstacles=[ [-2.5,-.8,-8.25,-8.05],[.8,2.5,-8.25,-8.05], [-2.4,-.8,-12,-9.4],[1.1,2.5,-12,-10.2],[.5,1.3,-11.6,-10.6],[1.4,2.5,-9.3,-8.4],
 [-2.5,-.85,-6.8,-4.3], // communications bench
 [.9,2.5,-6.8,-3.8], // bunks
 [-2.5,-.95,-3.4,-1], // galley
 [1,2.5,-2.8,-.6], // crew seating
 [-2.5,-1.1,.2,1.8], // lockers
 [-2.5,2.5,4.1,5.2], // dashboard
 [-1.65,-.65,2.4,3.4],[.65,1.65,2.4,3.4] // pilot seats
];
export function moveInCabin(position,dx,dz,doorOpen=false){
 const radius=.28;
 const free=(x,z)=>x>=cabinBounds.minX&&x<=cabinBounds.maxX&&z>=cabinBounds.minZ&&z<=cabinBounds.maxZ&&(doorOpen||!(z> -8.6&&z< -7.7))&&!obstacles.some(([a,b,c,d])=>x>a-radius&&x<b+radius&&z>c-radius&&z<d+radius);
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
 for(let i=0;i<steps;i++){if(free(position.x+dx/steps,position.z))position.x+=dx/steps;if(free(position.x,position.z+dz/steps))position.z+=dz/steps;}
 return position;
}

