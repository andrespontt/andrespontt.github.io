import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AreaManager,disposeScene} from './area-manager.mjs';
test('area visits lazy-load only their module, release previous scene and restore plain state',async()=>{
 const calls=[],disposed=[];let value=false;
 const loaders=Object.fromEntries(['outside','vehicle','bunker'].map(id=>[id,async()=>{calls.push(id);return {createArea(saved){if(id==='vehicle')value=!!saved.doorOpen;return {scene:{id},spawn:{x:0,z:0},move(){},snapshot(){return id==='vehicle'?{doorOpen:value}:{}}};}};}]));
 const manager=new AreaManager(loaders,{dispose:scene=>{disposed.push(scene.id);return {};}});
 await manager.go('outside');assert.deepEqual(calls,['outside']);await manager.go('vehicle');value=true;await manager.go('bunker');await manager.go('vehicle');assert.equal(value,true);assert.deepEqual(disposed,['outside','vehicle','bunker']);assert.equal(manager.id,'vehicle');assert.equal(await manager.go('vehicle'),false);
});
test('module failures retain working area, release busy flag and permit retry',async()=>{
 const area={scene:{},spawn:{x:0,z:0},move(){}};let fail=true;
 const manager=new AreaManager({outside:async()=>({createArea:()=>area}),bunker:async()=>{if(fail)throw Error('offline');return {createArea:()=>({...area})};}},{dispose(){}});
 await manager.go('outside');await assert.rejects(manager.go('bunker'));assert.equal(manager.current,area);assert.equal(manager.busy,false);fail=false;assert.equal(await manager.go('bunker'),true);
});
test('overlapping clicks cannot race transitions',async()=>{
 let resolve;const loader=new Promise(r=>resolve=r);const manager=new AreaManager({outside:()=>loader,vehicle:async()=>{throw Error('should not load');}});
 const pending=manager.go('outside');assert.equal(await manager.go('vehicle'),false);resolve({createArea:()=>({scene:{},spawn:{x:0,z:0},move(){}})});await pending;assert.equal(manager.id,'outside');
});
test('dispose deduplicates shared geometry, textures and materials including shader uniforms',()=>{
 let g=0,m=0,t=0,cleared=false;const texture={isTexture:true,dispose(){t++;}},geometry={dispose(){g++;}},material={map:texture,uniforms:{map:{value:texture}},dispose(){m++;}};
 const scene={background:texture,traverse(fn){fn({geometry,material});fn({geometry,material:[material]});},clear(){cleared=true;}};
 assert.deepEqual(disposeScene(scene),{geometries:1,materials:1,textures:1});assert.deepEqual([g,m,t,cleared],[1,1,1,true]);
});
test('variant ids share one module loader but keep separate state',async()=>{
 const seen=[];const manager=new AreaManager({outside:async()=>({createArea:()=>({scene:{},spawn:{x:0,z:0},move(){}})}),dev:async()=>({createArea(saved,{variant}){seen.push([variant,saved.n||0]);return {scene:{},spawn:{x:0,z:0},move(){},snapshot:()=>({n:(saved.n||0)+1})};}})},{dispose(){return {};}});
 await manager.go('dev/aim');await manager.go('dev/rope');await manager.go('dev/aim');
 assert.deepEqual(seen,[['aim',0],['rope',0],['aim',1]]);assert.equal(manager.id,'dev/aim');await assert.rejects(manager.go('nope/x'));
});
