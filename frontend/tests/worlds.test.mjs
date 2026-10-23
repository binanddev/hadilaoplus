import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {maps,mapById} from '../src/maps.ts';
import {buildWorld} from '../src/worlds.ts';
import {detailCharacter} from '../src/characterDetail.ts';

// Exercise real engine components and static batching without opening a server or GPU.
function offlineScene(){
 const canvas={id:'offline-scene',width:800,height:600},device=new pc.NullGraphicsDevice(canvas),app=new pc.AppBase(canvas);
 const options=new pc.AppOptions();options.graphicsDevice=device;options.componentSystems=[pc.RenderComponentSystem,pc.LightComponentSystem];options.resourceHandlers=[];options.batchManager=pc.BatchManager;app.init(options);
 const materials=[];
 const group=(name,parent=app.root)=>{const e=new pc.Entity(name);parent.addChild(e);return e};
 const mat=(hex,metal=0,emissive=false)=>{const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(hex);m.metalness=metal;if(emissive)m.emissive=m.diffuse.clone();m.update();materials.push(m);return m};
 const mesh=(name,type,p,s,m,parent)=>{const e=group(name,parent);e.addComponent('render',{type,material:m});e.setLocalPosition(...p);e.setLocalScale(...s);return e};
 const beam=(a,b,w,m,parent=app.root)=>{const e=mesh('beam','box',a,[w,w,new pc.Vec3(...a).distance(new pc.Vec3(...b))],m,parent);return e};
 const light=(p,color,intensity,range)=>{const e=group('light');e.addComponent('light',{type:'omni',color:new pc.Color().fromString(color),intensity,range});e.setPosition(...p);return e};
 return {app,group,mat,mesh,beam,light,dispose(){materials.forEach(m=>m.destroy());app.destroy()}};
}
function finiteHierarchy(root){
 for(const entity of [root,...root.find(()=>true)]){
  assert.ok([entity.getPosition().x,entity.getPosition().y,entity.getPosition().z,entity.getLocalScale().x,entity.getLocalScale().y,entity.getLocalScale().z].every(Number.isFinite),`Invalid transform: ${entity.name}`);
 }
}
test('map catalog keeps tavern plus two daylight maps and one night map; unknown saved IDs fall back',()=>{
 assert.equal(maps.length,4);assert.equal(maps.filter(m=>m.time.startsWith('Ngày')).length,2);assert.equal(mapById('obsolete').id,'tavern');
});
for(const id of ['island','garden','abbey'])test(`${id}: build actual geometry, batch static architecture, animate and dispose offline`,()=>{
 const kit=offlineScene();
 try{
  const world=buildWorld(id,kit);
  const expected={island:'moored sailboat',garden:'garden rabbit',abbey:'firefly trail'};
  assert.ok(world.root.findByName(expected[id]));
  for(const t of [0,.016,1.5,35,3600]){world.update(t,false);finiteHierarchy(world.root);}
  world.update(100,true);const before=world.root.findByName(expected[id]).getWorldTransform().clone();
  world.update(101,true);assert.deepEqual([...world.root.findByName(expected[id]).getWorldTransform().data],[...before.data]);
  assert.ok(kit.app.batcher._batchList.length>0,'Static scenery should batch');
 }finally{kit.dispose()}
});
test('all six detailed costumes build on articulated body parts and survive blinking/reduced motion',()=>{
 const k=offlineScene();
 try{const batch=k.app.batcher.addGroup('animated costumes',true,30);for(const kind of ['regent','rogue','scholar','knight','merchant','jester']){
  const root=k.group(kind),upper=k.group('upper',root),head=k.group('head',upper),arms=[k.group('left',upper),k.group('right',upper)];
  const animate=detailCharacter(k,kind,head,upper,arms,root,k.mat('#cfa380'),k.mat('#59674a'));
  for(const t of [0,1,100])animate(t,false,2);animate(101,true,2);finiteHierarchy(root);
  assert.ok(root.findByName('individual finger'));assert.ok(root.findByName('personal bread plate'));
  for(const part of upper.find(e=>Boolean(e.render)))part.render.batchGroupId=batch.id;
 }k.app.batcher.generate([batch.id]);k.app.batcher.updateAll();assert.ok(k.app.batcher._batchList.length>0);
 }finally{k.dispose()}
});
