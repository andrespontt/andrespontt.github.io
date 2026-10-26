import * as THREE from 'three';

// Original expedition transport inspired by the broad, low APC silhouette in Aliens.
export function createExpeditionVehicle(){
 const root=new THREE.Group();root.name='Expedition APC — Nomad 07';
 const armor=new THREE.MeshStandardMaterial({color:'#64716c',metalness:.5,roughness:.72});
 const edge=new THREE.MeshStandardMaterial({color:'#303d3e',metalness:.65,roughness:.6});
 const rubber=new THREE.MeshStandardMaterial({color:'#111b22',roughness:1});
 const glass=new THREE.MeshStandardMaterial({color:'#153746',metalness:.7,roughness:.2,emissive:'#427b88',emissiveIntensity:.25});
 const snow=new THREE.MeshStandardMaterial({color:'#bbcfdf',roughness:1});
 const lamp=new THREE.MeshBasicMaterial({color:'#fff0cf'}),amber=new THREE.MeshBasicMaterial({color:'#ffad48'});
 function part(geometry,material,x,y,z){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);root.add(m);return m;}
 function box(w,h,d,x,y,z,material=armor){return part(new THREE.BoxGeometry(w,h,d),material,x,y,z);}
 // Chamfered longitudinal profile, extruded across the vehicle's width.
 const profile=new THREE.Shape();profile.moveTo(-4.5,1.05);profile.lineTo(4.5,1.05);profile.lineTo(4.8,1.65);profile.lineTo(3.3,2.8);profile.lineTo(-3.6,2.8);profile.lineTo(-4.5,2.1);profile.closePath();
 const hull=new THREE.ExtrudeGeometry(profile,{depth:3.7,bevelEnabled:true,bevelThickness:.12,bevelSize:.12,bevelSegments:1,steps:1});
 // Shape x becomes vehicle z, extrusion becomes vehicle x; front is positive z.
 hull.rotateY(-Math.PI/2);hull.translate(1.85,0,0);part(hull,armor,0,0,0);
 box(3.2,.4,7.7,0,.95,0,edge);
 for(const x of [-2.02,2.02])for(const z of [-2.8,2.8]){
  const wheelStart=root.children.length;
  const tire=part(new THREE.CylinderGeometry(1.12,1.12,.85,20),rubber,x,1.08,z);tire.rotation.z=Math.PI/2;
  const hub=part(new THREE.CylinderGeometry(.57,.57,.89,12),edge,x,1.08,z);hub.rotation.z=Math.PI/2;
  const cap=part(new THREE.CylinderGeometry(.28,.28,.94,8),armor,x,1.08,z);cap.rotation.z=Math.PI/2;
  for(let i=0;i<16;i++){const a=i*Math.PI/8;const tread=box(.91,.14,.3,x,1.08+Math.cos(a)*1.1,z+Math.sin(a)*1.1,rubber);tread.rotation.x=a;}
  const wheel=new THREE.Group();wheel.position.set(x,1.08,z);root.updateMatrixWorld(true);root.add(wheel);wheel.updateMatrixWorld(true);
  for(const piece of root.children.slice(wheelStart,-1))wheel.attach(piece);
  wheel.userData.keepRound=true;
  box(.98,.16,2.65,x,2.3,z);box(.94,.07,2.5,x,2.41,z,snow);
 }
 // Wide split windshield on the sloping nose, protected by armored ribs.
 for(const x of [-.86,.86]){const window=box(1.5,.64,.08,x,2.38,4.18,glass);window.rotation.x=-.91;}
 box(3.9,.3,.35,0,1.23,4.85,edge);
 for(const x of [-1.43,1.43]){
  box(.68,.36,.24,x,1.68,4.87,edge);box(.48,.21,.05,x,1.68,5.01,lamp);
  const light=new THREE.SpotLight('#d5e9ff',65,24,.36,.65,1.3);light.position.set(x,1.7,5.05);light.target.position.set(x,.05,18);root.add(light,light.target);
  box(.16,.12,.06,x,2.45,3.64,amber);
  box(.22,.2,.08,x,1.7,-4.61,new THREE.MeshBasicMaterial({color:'#ce4935'}));
 }
 // Side access hatch, recessed panels, tow loops and rear ventilation.
 for(const side of [-1,1]){
  box(.08,1.05,2.1,side*1.99,1.82,0,edge);box(.1,.85,1.85,side*2.04,1.85,0);
  box(.13,.1,.4,side*2.12,1.9,.55,edge);box(.75,.15,2,side*2.1,.65,0,edge);
  for(let j=0;j<5;j++)box(.08,.6,.07,side*1.99,2.05,-1.4-j*.18,edge);
 }
 box(3.35,.07,5.7,0,2.96,-.1,snow);
 // Low roof-mounted sensor turret and expedition equipment.
 part(new THREE.CylinderGeometry(.85,.95,.22,12),edge,0,3.1,-1.1);
 box(1.45,.42,1.35,0,3.4,-1.1);box(.85,.25,.18,0,3.45,-.36,glass);
 box(.3,.3,1.7,.55,3.43,-.1,edge);box(.32,.16,.12,.55,3.43,.8,lamp);
 for(const x of [-1.13,1.13]){box(.6,.5,1.2,x,3.15,-2.8,edge);box(.63,.07,1.23,x,3.43,-2.8,snow);}
 box(.055,2.1,.055,-1.1,4,-2.5,edge);box(.055,1.5,.055,1.1,3.8,-2.5,edge);
 const label=document.createElement('canvas');label.width=512;label.height=128;const c=label.getContext('2d');c.fillStyle='#d3d8c6';c.font='bold 70px monospace';c.fillText('NOMAD / 07',12,87);
 const decal=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(label),transparent:true,polygonOffset:true,polygonOffsetFactor:-1});
 for(const side of [-1,1]){const m=part(new THREE.PlaneGeometry(2,.5),decal,side*2.105,1.85,0);m.rotation.y=side*Math.PI/2;}
 // Small armored crew windows along both sides.
 for(const side of [-1,1])for(const z of [-2.6,-1.3,0,1.3,2.6]){box(.1,.48,.72,side*2.01,2.38,z,edge);box(.12,.32,.53,side*2.07,2.38,z,glass);}
 // Extend the hull and wheelbase by 50%, preserving round tires.
 for(const piece of root.children){piece.position.z*=1.5;if(!piece.userData.keepRound)piece.scale.z*=1.5;}
 // Rear quarters extension retains the armored transport profile.
 box(3.7,1.8,4.2,0,1.95,-8.85,armor);box(3.8,.1,4.3,0,2.9,-8.85,snow);box(3.8,.25,.25,0,1.15,-11,edge);
 return root;
}




