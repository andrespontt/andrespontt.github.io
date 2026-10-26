// CPU state survives visits. Render resources do not.
export function disposeScene(scene){
 const geometries=new Set(),materials=new Set(),textures=new Set();
 scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material||[])){materials.add(material);for(const value of Object.values(material)){if(value?.isTexture)textures.add(value);}for(const uniform of Object.values(material.uniforms||{})){if(uniform?.value?.isTexture)textures.add(uniform.value);}}});
 if(scene.background?.isTexture)textures.add(scene.background);if(scene.environment?.isTexture)textures.add(scene.environment);
 for(const value of textures)value.dispose();for(const value of materials)value.dispose();for(const value of geometries)value.dispose();
 scene.clear();
 return {geometries:geometries.size,materials:materials.size,textures:textures.size};
}
export class AreaManager{
 constructor(loaders,{dispose=disposeScene,onDispose=()=>{}}={}){this.loaders=loaders;this.dispose=dispose;this.onDispose=onDispose;this.current=null;this.id=null;this.saved={};this.busy=false;this.lastDisposed=null;}
 // options are passed to createArea (e.g. { linked: true } for the City drone feed).
 async go(id,options={}){
  if(this.busy||id===this.id)return false;
  // 'dev/aim' loads the 'dev' module with variant 'aim'; each variant keeps its own saved state.
  const [base,variant]=id.split('/');const loader=this.loaders[id]||this.loaders[base];
  if(!loader)throw new Error('Unknown area: '+id);
  this.busy=true;
  try{
   // Keep the current area intact if the module download fails.
   const module=await loader();
   const next=await module.createArea(this.saved[id]||{},{variant,...options});
   if(!next?.scene||!next.spawn||typeof next.move!=='function'){next?.dispose?.();if(next?.scene)this.dispose(next.scene);throw new Error('Invalid area contract: '+id);}
   if(this.current){this.saved[this.id]=this.current.snapshot?.()||{};this.current.dispose?.();this.lastDisposed=this.dispose(this.current.scene);this.onDispose(this.lastDisposed);}
   this.current=next;this.id=id;return true;
  }finally{this.busy=false;}
 }
}

