import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {batchStaticGeometry,configureSceneLighting,createDetailPrimitives} from '../src/sceneGeometry.ts';

function scene(){
 const canvas={id:'scene-geometry-test',width:1280,height:720},app=new pc.AppBase(canvas);
 const options=new pc.AppOptions();options.graphicsDevice=new pc.NullGraphicsDevice(canvas);
 options.componentSystems=[pc.RenderComponentSystem,pc.LightComponentSystem];options.resourceHandlers=[];options.batchManager=pc.BatchManager;app.init(options);
 const materials=[];
 const material=()=>{const result=new pc.StandardMaterial();result.update();materials.push(result);return result;};
 const entity=(name,parent=app.root)=>{const result=new pc.Entity(name);parent.addChild(result);return result;};
 return{app,entity,material,destroy(){materials.forEach(m=>m.destroy());app.destroy();}};
}

test('static batching retains triangles, UVs, materials and shadow flags while reducing submissions',()=>{
 const s=scene();
 try{
  const material=s.material(),entities=[];
  for(let i=0;i<60;i++){
   const e=s.entity('stone '+i);e.addComponent('render',{type:'box',material,castShadows:i%2===0});e.setPosition(i%6,Math.floor(i/6)*.2,0);entities.push(e);
  }
  const original=entities.flatMap(e=>e.render.meshInstances);
  const indices=original.reduce((sum,mi)=>sum+mi.mesh.primitive[0].count,0);
  batchStaticGeometry(s.app,entities,'stonework');
  const batches=s.app.batcher.getBatches(s.app.batcher.getGroupByName('stonework').id);
  assert.equal(batches.length,2,'Only split for distinct shadow flags');
  assert.equal(batches.reduce((sum,b)=>sum+b.meshInstance.mesh.primitive[0].count,0),indices);
  assert.ok(batches.every(b=>b.meshInstance.material===material));
  assert.ok(batches.every(b=>b.origMeshInstances.every(mi=>mi.castShadow===b.meshInstance.castShadow)));
  for(const b of batches){const uv=[];b.meshInstance.mesh.getUvs(0,uv);assert.ok(uv.length>0);}
 }finally{s.destroy();}
});

test('moving, hidden, transparent and already batched objects stay out of static groups',()=>{
 const s=scene();
 try{
  const material=s.material(),moving=s.entity('moving');moving.tags.add('moving-scenery');
  const hidden=s.entity('hidden');hidden.enabled=false;
  const transparent=s.material();transparent.blendType=pc.BLEND_NORMAL;transparent.opacity=.2;transparent.update();
  const candidates=[s.entity('windblown',moving),s.entity('hidden coat',hidden),s.entity('smoke'),s.entity('existing'),s.entity('fixed')];
  candidates.forEach((e,i)=>e.addComponent('render',{type:'box',material:i===2?transparent:material}));
  const existing=s.app.batcher.addGroup('existing',true,10);candidates[3].render.batchGroupId=existing.id;
  batchStaticGeometry(s.app,candidates,'fixed');
  assert.equal(candidates[0].render.batchGroupId,-1);assert.equal(candidates[1].render.batchGroupId,-1);assert.equal(candidates[2].render.batchGroupId,-1);
  assert.equal(candidates[3].render.batchGroupId,existing.id);
  assert.equal(candidates[4].render.batchGroupId,s.app.batcher.getGroupByName('fixed').id);
 }finally{s.destroy();}
});

test('lighting grid keeps every local light including disabled effects and preserves directional shadows',()=>{
 const s=scene();
 try{
  const sun=s.entity('moon');sun.addComponent('light',{type:'directional',castShadows:true});
  for(let i=0;i<5;i++){const e=s.entity('torch');e.addComponent('light',{type:'omni'});e.enabled=i!==4;}
  const originalCells=s.app.scene.lighting.cells.clone();configureSceneLighting(s.app);
  assert.equal(s.app.scene.lighting.maxLightsPerCell,5);assert.equal(s.app.scene.lighting.maxLights,5);
  assert.equal(s.app.scene.lighting.shadowsEnabled,false);assert.equal(sun.light.castShadows,true);
  assert.deepEqual(s.app.scene.lighting.cells,originalCells);
  const local=s.entity('shadowed local');local.addComponent('light',{type:'omni',castShadows:true});
  configureSceneLighting(s.app);assert.equal(s.app.scene.lighting.shadowsEnabled,true);assert.equal(s.app.scene.lighting.maxLightsPerCell,6);
 }finally{s.destroy();}
});

test('sized lighting buffers retain all simultaneous lights with less storage and no cell overflow',t=>{
 const s=scene(),clusters=new pc.WorldClusters(s.app.graphicsDevice);
 try{
  const lights=[];
  for(let i=0;i<7;i++){const e=s.entity('light '+i);e.addComponent('light',{type:'omni',intensity:2,range:10});e.light.light.visibleThisFrame=true;lights.push(e.light.light);}
  const lighting=s.app.scene.lighting;
  clusters.update(lights,lighting);const original=clusters.clusters.byteLength;
  configureSceneLighting(s.app);clusters.update(lights,lighting);
  assert.equal(clusters.usedLights.length,8,'All seven lights plus the reserved empty slot remain');
  assert.ok(Math.max(...clusters.counts)>=7,'An overlapping cell must retain all seven lights');
  assert.ok(clusters.clusters.byteLength<original/30);
  t.diagnostic(`Light-index buffer: ${original} -> ${clusters.clusters.byteLength} bytes, same seven lights`);
 }finally{clusters.destroy();s.destroy();}
});

test('tiny spheres share smooth geometry with 65% fewer triangles; large shapes retain full geometry',()=>{
 const s=scene(),primitives=createDetailPrimitives(s.app);
 try{
  const material=s.material(),tiny=s.entity('small button'),other=s.entity('finger'),large=s.entity('head');
  primitives.addRender(tiny,'sphere',[.03,.03,.03],material,false);
  primitives.addRender(other,'sphere',[.035,.075,.14],material,false);
  primitives.addRender(large,'sphere',[.48,.58,.46],material,true);
  const expanding=s.entity('expanding smoke');primitives.addRender(expanding,'sphere',[.1,.1,.1],material,false,false);
  const mesh=tiny.render.meshInstances[0].mesh,full=large.render.meshInstances[0].mesh;
  assert.equal(mesh,other.render.meshInstances[0].mesh);
  assert.equal(mesh.primitive[0].count,504);assert.equal(full.primitive[0].count,1440);
  assert.equal(expanding.render.meshInstances[0].mesh,full,'Small initial effects that grow large retain the original mesh');
  assert.equal(tiny.render.castShadows,false);assert.equal(large.render.castShadows,true);
  const normals=[],uvs=[];mesh.getNormals(normals);mesh.getUvs(0,uvs);assert.ok(normals.length>0&&uvs.length>0);
  tiny.destroy();other.destroy();assert.ok(mesh.vertexBuffer,'Pool retains mesh during character replacement');
  const replacement=s.entity('replacement button');primitives.addRender(replacement,'sphere',[.03,.03,.03],material);
  assert.equal(replacement.render.meshInstances[0].mesh,mesh);
  primitives.dispose();primitives.dispose();assert.ok(mesh.vertexBuffer,'Live instances still own the mesh');
  replacement.destroy();assert.equal(mesh.vertexBuffer,null,'Last instance releases GPU buffer before device destruction');
 }finally{primitives.dispose();s.destroy();}
});
