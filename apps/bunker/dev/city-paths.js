// Visibility-graph paths around furniture. Unlike a single-obstacle detour this
// also handles a chair, table and partition blocking the same route.
export function plan(from,to,rects,margin=.28) {
  const boxes=rects.map(([a,b,c,d])=>[a-margin,b-margin,c+margin,d+margin]);
  const inside=(p,r)=>p[0]>r[0]+1e-6&&p[0]<r[2]-1e-6&&p[1]>r[1]+1e-6&&p[1]<r[3]-1e-6;
  const clear=(a,b)=>!boxes.some(r=>{
    let lo=0,hi=1;
    for(let k=0;k<2;k++){
      const v=b[k]-a[k];
      if(Math.abs(v)<1e-9){if(a[k]<=r[k]+1e-6||a[k]>=r[k+2]-1e-6)return false;continue;}
      let p=(r[k]+1e-6-a[k])/v,q=(r[k+2]-1e-6-a[k])/v;if(p>q)[p,q]=[q,p];
      lo=Math.max(lo,p);hi=Math.min(hi,q);if(lo>=hi)return false;
    }
    return lo<hi&&hi>1e-6&&lo<1-1e-6;
  });
  if(clear(from,to))return [[...to]];
  const nodes=[from,to,...boxes.flatMap(([a,b,c,d])=>[[a,b],[c,b],[c,d],[a,d]]).filter(p=>!boxes.some(r=>inside(p,r)))];
  const distance=nodes.map(()=>Infinity),previous=[],done=new Set();distance[0]=0;
  while(done.size<nodes.length){
    let n=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(n<0||distance[i]<distance[n]))n=i;
    if(n<0||!Number.isFinite(distance[n]))break;
    if(n===1){const path=[];for(let at=1;at!==0;at=previous[at])path.unshift([...nodes[at]]);return path;}
    done.add(n);
    for(let j=0;j<nodes.length;j++)if(!done.has(j)&&clear(nodes[n],nodes[j])){
      const d=distance[n]+Math.hypot(nodes[n][0]-nodes[j][0],nodes[n][1]-nodes[j][1]);
      if(d<distance[j]){distance[j]=d;previous[j]=n;}
    }
  }
  return []; // Stay in place instead of walking through a wall when no path exists.
}
