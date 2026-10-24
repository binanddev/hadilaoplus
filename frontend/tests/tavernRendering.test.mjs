import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as ts from 'typescript';
import * as pc from 'playcanvas';
import * as presentation from '../src/cardPresentation.ts';
import * as maps from '../src/maps.ts';
import * as worlds from '../src/worlds.ts';
import * as details from '../src/characterDetail.ts';
import * as rendering from '../src/sceneRendering.ts';
import * as geometry from '../src/sceneGeometry.ts';

const source=readFileSync(new URL('../src/Tavern.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const jsx={jsx:()=>null,jsxs:()=>null};
function scene(props){
 const globals=new Map(),effects=[],refs=[],cleanups=[];let app;
 const set=(key,value)=>{globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
 class Canvas{
  width=1280;height=720;clientWidth=1280;clientHeight=720;style={};listeners=new Map();
  getContext(){return new Proxy({measureText:()=>({width:10})},{get:(target,key)=>target[key]??(()=>{})});}
  addEventListener(name,callback){this.listeners.set(name,callback);}removeEventListener(name){this.listeners.delete(name);}setPointerCapture(){}
 }
 const canvas=new Canvas();canvas.id='tavern-rendering-test';
 set('HTMLCanvasElement',Canvas);set('window',{devicePixelRatio:2,innerWidth:1280,innerHeight:720});
 set('document',{hidden:false,createElement:()=>new Canvas(),getElementById:()=>null,addEventListener(){},removeEventListener(){}});
 set('ResizeObserver',class{observe(){}disconnect(){}});
 class Application extends pc.AppBase{
  constructor(canvas,configuration){super(canvas);assert.equal(configuration.graphicsDeviceOptions.powerPreference,'high-performance');const options=new pc.AppOptions();options.graphicsDevice=new pc.NullGraphicsDevice(canvas);options.componentSystems=[pc.RenderComponentSystem,pc.CameraComponentSystem,pc.LightComponentSystem];options.resourceHandlers=[];options.batchManager=pc.BatchManager;this.init(options);app=this;}
  start(){}setCanvasResolution(){}resizeCanvas(){}
 }
 const react={useRef(value){const ref={current:refs.length===0?canvas:value};refs.push(ref);return ref;},useState(value){return[value,()=>{}];},useEffect(callback){effects.push(callback);}};
 const modules={'react':react,'react/jsx-runtime':jsx,'playcanvas':{...pc,Application},'./cardPresentation.ts':presentation,'./maps':maps,'./worlds':worlds,'./characterDetail':details,'./sceneRendering':rendering,'./sceneGeometry':geometry};
 const restore=()=>{for(const[key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 try{const module={exports:{}};new Function('require','module','exports',compiled)(name=>{if(!(name in modules))throw Error(name);return modules[name];},module,module.exports);module.exports.Tavern(props);effects.forEach(callback=>{const cleanup=callback();if(cleanup)cleanups.push(cleanup);});}
 catch(error){restore();throw error;}
 return{app,canvas,update(data,frames=1){refs[2].current=data;for(let i=0;i<frames;i++){app.fire('update',.04);app.batcher.updateAll();}},destroy(){try{cleanups.reverse().forEach(fn=>fn());}finally{restore();}}};
}
const players=Array.from({length:6},(_,seat)=>({id:'p'+seat,name:'Player '+seat,seat,gold:5,ready:true,hand_count:3,character:['regent','rogue','scholar','knight','merchant','jester'][seat]}));

for(const mapId of ['tavern','island','garden','abbey'])test(`${mapId}: batches fixed scenery, keeps every actor and animated prop, and survives rebuilds`,t=>{
 const props={mapId,players,myId:'p0',kingSeat:1,currentPlayerId:'p1'},s=scene(props);
 try{
  s.update(props,3);
  const group=s.app.batcher.getGroupByName('table and room'),batches=s.app.batcher.getBatches(group.id);
  const original=batches.reduce((sum,b)=>sum+b.origMeshInstances.length,0);
  assert.ok(original>batches.length*2,'Fixed table/room geometry submits less than half as many draws');
  t.diagnostic(`Table/room: ${original} separate meshes -> ${batches.length} static submissions`);
  assert.equal(s.app.root.findByName('seated rogue p1').enabled,true);
  const flame=s.app.root.findByName('candle flame');assert.equal(flame.render.batchGroupId,-1);
  const before=flame.getLocalScale().clone();s.update(props,5);assert.ok(before.distance(flame.getLocalScale())>.001);
  const king=s.app.root.findByName('seated rogue p1').findByName('royal throne');assert.equal(king.enabled,true);
  s.update({...props,kingSeat:2},1);assert.equal(king.enabled,false);
  const rebuilt={...props,players:players.map(p=>p.id==='p1'?{...p,character:'scholar'}:p)};
  s.update(rebuilt,2);assert.ok(s.app.root.findByName('seated scholar p1'));
  assert.equal(s.app.root.findByName('seated rogue p1'),null);
  const staticGroup=s.app.batcher.getGroupByName('table and room');assert.equal(s.app.batcher.getBatches(staticGroup.id).length,batches.length,'Changing costumes must not rebuild or discard scenery');
  const lights=s.app.root.findComponents('light').filter(light=>light.type!=='directional');
  assert.equal(s.app.scene.lighting.maxLightsPerCell,lights.length);
 }finally{s.destroy();}
});

test('card, bomb and transfer effects remain dynamic; camera input and reduced motion still work',()=>{
 const props={mapId:'abbey',players,myId:'p0',kingSeat:1},s=scene(props);
 try{
  s.update(props,2);const camera=s.app.root.findByName('seated camera');const before=camera.getEulerAngles().clone();
  s.canvas.listeners.get('pointermove')({buttons:2,movementX:60,movementY:15});s.update(props);
  assert.ok(before.distance(camera.getEulerAngles())>1);
  const bomb={...props,event:{id:'bomb-1',type:'bomb',actor_id:'p1'}};s.update(bomb,2);
  assert.equal(s.app.root.findByName('bomb').enabled,true);assert.equal(s.app.root.findByName('bomb').render.batchGroupId,-1);
  s.update(bomb,60);assert.equal(s.app.root.findByName('bomb').enabled,false);
  s.update({...props,event:{id:'transfer-1',type:'transfer',actor_id:'p1',target_id:'p2'}},2);
  assert.equal(s.app.root.findByName('flying coin').enabled,true);
  s.update({...props,reduced:true},2);const flame=s.app.root.findByName('candle flame'),still=flame.getLocalScale().clone();
  s.update({...props,reduced:true},10);assert.equal(still.distance(flame.getLocalScale()),0);
 }finally{s.destroy();}
});
