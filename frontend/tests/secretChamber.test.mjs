import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as ts from 'typescript';
import * as pc from 'playcanvas';
import * as spatial from '../src/secretHitler/spatial.ts';
import * as artwork from '../src/secretHitler/artwork.ts';
import * as finale from '../src/secretHitler/finale.ts';
import * as cameraSettings from '../src/secretHitler/cameraSettings.ts';
import {createSceneDisposer} from '../src/secretHitler/sceneLifecycle.ts';
import * as sceneRendering from '../src/sceneRendering.ts';
import * as sceneGeometry from '../src/sceneGeometry.ts';

const require=createRequire(import.meta.url);
const source=readFileSync(new URL('../src/secretHitler/Chamber.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;

// Exercise the real component effect and PlayCanvas entities without a browser,
// GPU, server, or changes to the game's saved sessions.
function scene(props){
 const effects=[],refs=[],cleanups=[],globals=new Map();let app,refIndex=0;
 const setGlobal=(key,value)=>{globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
 class TestCanvas{
  constructor(){this.id='immersive-chamber-test';this.width=1280;this.height=720;this.clientWidth=1280;this.clientHeight=720;this.style={};}
  getContext(){return new Proxy({measureText:()=>({width:10})},{get:(target,key)=>target[key]??(()=>{})});}
  addEventListener(){}removeEventListener(){}setPointerCapture(){}getBoundingClientRect(){return{left:0,top:0,width:1280,height:720};}
 }
 const canvas=new TestCanvas();
 setGlobal('HTMLCanvasElement',TestCanvas);
 setGlobal('window',{innerWidth:1280,innerHeight:720,addEventListener(){},removeEventListener(){}});
 setGlobal('document',{createElement:()=>new TestCanvas(),getElementById:()=>null,addEventListener(){},removeEventListener(){}});
 setGlobal('Image',class{naturalWidth=32;naturalHeight=32;set src(value){} });
 setGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 class OfflineApplication extends pc.AppBase{
  constructor(canvas,configuration){super(canvas);assert.equal(configuration.graphicsDeviceOptions.powerPreference,'high-performance');const options=new pc.AppOptions();options.graphicsDevice=new pc.NullGraphicsDevice(canvas);options.componentSystems=[pc.RenderComponentSystem,pc.CameraComponentSystem,pc.LightComponentSystem];options.resourceHandlers=[];options.batchManager=pc.BatchManager;this.init(options);app=this;}
  start(){}setCanvasResolution(){}resizeCanvas(){}
 }
 const hooks={useRef(value){const ref={current:refIndex++===0?canvas:value};refs.push(ref);return ref;},useState(value){return[typeof value==='function'?value():value,()=>{}];},useEffect(callback){effects.push(callback);}};
 const fakeRequire=name=>name==='react'?hooks:name==='playcanvas'?{...pc,Application:OfflineApplication}:name==='./spatial'?spatial:name==='./artwork'?artwork:name==='./finale'?finale:name==='./cameraSettings'?cameraSettings:name==='./sceneLifecycle'?{createSceneDisposer}:name==='../sceneRendering'?sceneRendering:name==='../sceneGeometry'?sceneGeometry:name.endsWith('.css')?{}:require(name);
 const module={exports:{}};
 const restore=()=>{for(const [key,descriptor]of globals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 try{
  new Function('require','module','exports',compiled)(fakeRequire,module,module.exports);
  module.exports.Chamber(props);
  effects.forEach(effect=>{const cleanup=effect();if(cleanup)cleanups.push(cleanup);});
 }catch(error){restore();throw error;}
 return{get app(){return app;},update(data,frames=1){refs[1].current=data;for(let i=0;i<frames;i++)app.fire('update',.04);},destroy(){try{cleanups.reverse().forEach(fn=>fn());}finally{restore();}}};
}
const players=Array.from({length:5},(_,seat)=>({id:`p${seat}`,name:`Player ${seat}`,seat,alive:true}));
const initial={players,myId:'p0',phase:'nomination',snapshotEpoch:1,seatHeight:1};

test('chamber batches fixed architecture while keeping policy boards, office chairs and effects dynamic',t=>{
 const harness=scene(initial);
 try{
  harness.update(initial,3);
  const group=harness.app.batcher.getGroupByName('chamber architecture and delegate chairs');
  const batches=harness.app.batcher.getBatches(group.id);
  const original=batches.reduce((sum,batch)=>sum+batch.origMeshInstances.length,0);
  assert.ok(original>batches.length*2);
  t.diagnostic(`Chamber fixed geometry: ${original} separate meshes -> ${batches.length} static submissions`);
  for(const name of ['original fascist board','enacted liberal policy','enacted fascist policy','flying enacted policy','table pistol slide','moving sealed card packet']){
   assert.equal(harness.app.root.findByName(name).render.batchGroupId,-1,`${name} must retain independent visibility/material/transform`);
  }
  const chair=harness.app.root.findByName('president end chair');
  assert.equal(chair.findByName('chair seat').render.batchGroupId,-1);
 }finally{harness.destroy();}
});

test('real chamber renders first-person eye and switches eliminated viewer to observer camera',()=>{
 const harness=scene(initial);
 try{
  harness.update(initial,5);
  const camera=harness.app.root.findByName('camera');
  assert.ok(camera,'Scene built a real camera');
  assert.ok(Math.abs(camera.getPosition().x-spatial.delegateSeat(0).x)<.01);
  assert.ok(camera.getPosition().y<3,'Living viewer uses seated eye height');
  const dead={...initial,players:players.map(p=>p.id==='p0'?{...p,alive:false}:p)};
  harness.update(dead,100);
  assert.ok(camera.getPosition().y>5,'Eliminated viewer uses elevated observer camera');
  assert.ok(harness.app.root.findByName('delegate p0'),'Corpse remains in the scene');
 }finally{harness.destroy();}
});

test('real chamber moves elected officials, finishes seating and gates the held gun',()=>{
 const changes=[];const props={...initial,onSeatingChange:value=>changes.push(value)};
 const harness=scene(props);
 try{
  harness.update(props,2);
  const elected={...props,presidentId:'p0',chancellorId:'p1',phase:'president_discard'};
  harness.update(elected,1);assert.ok(changes.includes(true));
  harness.update(elected,100);assert.equal(changes.at(-1),false);
  const president=harness.app.root.findByName('delegate p0').getPosition();
  assert.ok(Math.abs(president.x)<.01&&Math.abs(president.z+6.25)<.01);
  const gun=harness.app.root.findByName('first person pistol');assert.equal(gun.enabled,false);
  harness.update({...elected,phase:'executive',gunArmed:true,eligibleTargetIds:['p2']},2);
  assert.equal(gun.enabled,true);
  harness.update({...elected,gunArmed:false},2);assert.equal(gun.enabled,false);
 }finally{harness.destroy();}
});

test('real chamber suppresses historical shots on initial load and reconnect',()=>{
 const harness=scene({players:[]});
 try{
  harness.update({players:[]},5);
  const event={id:'old',actor_id:'p1',target_id:'p2'};
  const connected={...initial,executionEvent:event};
  harness.update(connected,1);
  const flash=harness.app.root.findByName('execution muzzle flash');
  assert.equal(flash.enabled,false,'Loading a room must not replay a previous shot');
  harness.update({...connected,snapshotEpoch:2,executionEvent:{...event,id:'missed'}},1);
  assert.equal(flash.enabled,false,'Reconnect establishes a new baseline');
  harness.update({...connected,snapshotEpoch:2,executionEvent:{...event,id:'live'}},1);
  assert.equal(flash.enabled,true,'A newly confirmed live shot produces the muzzle effect');
 }finally{harness.destroy();}
});

test('other delegates see the execution president holding a world pistol',()=>{
 const props={...initial,executionPresidentId:'p1'};
 const harness=scene(props);
 try{
  harness.update(props,2);
  const remote=harness.app.root.findByName('held pistol p1');
  const local=harness.app.root.findByName('held pistol p0');
  assert.equal(remote.enabled,true);
  assert.equal(local.enabled,false);
  harness.update({...props,executionPresidentId:undefined},2);
  assert.equal(remote.enabled,false,'Gun is put away after the execution authority ends');
 }finally{harness.destroy();}
});

test('eye rises 27cm without moving the table and living players can switch to third person',()=>{
 const harness=scene(initial);
 try{
  harness.update(initial,5);
  const camera=harness.app.root.findByName('camera');
  assert.ok(Math.abs(camera.getPosition().y-2.45)<.001);
  assert.ok(Math.abs(harness.app.root.findByName('table top').getPosition().y-1.52)<.001);
  assert.ok(Math.abs(harness.app.root.findByName('inset green felt').getPosition().y-1.675)<.001);
  harness.update({...initial,viewMode:'third'},80);
  assert.ok(camera.getPosition().y>5);
  harness.update({...initial,viewMode:'first'},80);
  assert.ok(Math.abs(camera.getPosition().y-2.45)<.001);
 }finally{harness.destroy();}
});

test('officials finish walking and dressing before the action gate opens',()=>{
 const changes=[],props={...initial,onSeatingChange:value=>changes.push(value)};
 const harness=scene(props);
 try{
  harness.update(props,2);
  const hanging=harness.app.root.findByName('hanging president coat 0');
  assert.equal(hanging.enabled,true);
  const elected={...props,presidentId:'p0',chancellorId:'p1',phase:'president_discard'};
  harness.update(elected,64);
  assert.equal(changes.at(-1),true,'Dressing continues after the walk ends');
  harness.update(elected,50);
  assert.equal(changes.at(-1),false);
  assert.equal(harness.app.root.findByName('worn president coat p0').enabled,true);
  assert.equal(harness.app.root.findByName('worn chancellor coat p1').enabled,true);
  assert.equal(hanging.enabled,false,'The hanging coat is no longer duplicated while worn');
 }finally{harness.destroy();}
});

test('attendants keep votes sealed, reveal all colors only from the public result, and clear on rematch',()=>{
 const props={...initial,phase:'voting',votedIds:[],ballotEvent:null};
 const harness=scene(props);
 try{
  harness.update(props,2);
  assert.ok(harness.app.root.findByName('ballot attendant left'));
  assert.ok(harness.app.root.findByName('ballot attendant right'));
  harness.update({...props,votedIds:['p0']},15);
  assert.equal(Boolean(harness.app.root.findByName('revealed ballot p0')),false);
  const result={...props,phase:'president_discard',votedIds:players.map(p=>p.id),ballotEvent:{id:'result-1',votes:{p0:true,p1:false,p2:true,p3:false,p4:true}}};
  harness.update(result,130);
  const yes=harness.app.root.findByName('revealed ballot p0');
  const no=harness.app.root.findByName('revealed ballot p1');
  assert.ok(yes&&no,'Staff have placed the revealed result cards');
  assert.equal(yes.render.material===no.render.material,false,'Ja and Nein use distinct printed materials');
  harness.update({...props,phase:'lobby'},2);
  assert.equal(Boolean(harness.app.root.findByName('revealed ballot p0')),false);
 }finally{harness.destroy();}
});

function finaleResult(){
 const result={code:'ENDING',version:40,phase:'finished',winner:'liberal',players,
  known_roles:players.map(p=>({id:p.id,role:p.id==='p1'?'fascist':p.id==='p2'?'hitler':'liberal'}))};
 return {...initial,phase:'finished',finale:finale.buildFinalePlan(result)};
}

test('live finale makes staff shoot losers and surviving winners dance without changing the game',()=>{
 const harness=scene(initial),before=structuredClone(players);
 try{
  harness.update(initial,3);
  const ended=finaleResult();harness.update(ended,1);
  assert.equal(harness.app.root.findByName('ceremony pistol left').enabled,true);
  harness.update(ended,80);
  assert.ok(harness.app.root.findByName('camera').getPosition().y>5);
  assert.ok(harness.app.root.findByName('delegate p1').findByName('delegate body').getLocalEulerAngles().x>30);
  assert.ok(harness.app.root.findByName('delegate p2').findByName('delegate body').getLocalEulerAngles().x>30);
  const winner=harness.app.root.findByName('delegate p0');
  const first=winner.findByName('delegate body').getPosition().clone();
  harness.update(ended,4);
  const second=winner.findByName('delegate body').getPosition();
  assert.ok(first.distance(second)>.001,'Surviving winner is dancing');
  assert.deepEqual(players,before,'The ending never mutates authoritative alive states');
  harness.update({...initial,phase:'lobby',finale:null},3);
  assert.ok(Math.abs(harness.app.root.findByName('delegate p1').findByName('delegate body').getLocalEulerAngles().x)<1,'Rematch restores a living idle pose');
  assert.equal(harness.app.root.findByName('ceremony pistol left').enabled,false);
 }finally{harness.destroy();}
});

test('joining a completed game skips ceremony gunfire and respects reduced motion',()=>{
 const ended=finaleResult(),harness=scene(ended);
 try{
  harness.update(ended,2);
  assert.equal(harness.app.root.findByName('ceremony pistol left').enabled,false);
  assert.equal(harness.app.root.findByName('ceremony flash left').enabled,false);
  assert.ok(harness.app.root.findByName('delegate p1').findByName('delegate body').getLocalEulerAngles().x>30);
  harness.update({...ended,snapshotEpoch:2,reduced:true},3);
  assert.equal(harness.app.root.findByName('ceremony flash right').enabled,false);
  const winner=harness.app.root.findByName('delegate p0');
  const pose=winner.getPosition().clone();harness.update({...ended,snapshotEpoch:2,reduced:true},8);
  assert.ok(pose.distance(winner.getPosition())<.001);
 }finally{harness.destroy();}
});

test('seat height slider doubles the personal eye height without changing the table or others',()=>{
 const harness=scene(initial);
 try{
  harness.update(initial,3);
  const other=harness.app.root.findByName('delegate p2').getPosition().clone();
  harness.update({...initial,seatHeight:2},90);
  assert.ok(Math.abs(harness.app.root.findByName('camera').getPosition().y-4.9)<.001);
  assert.ok(Math.abs(harness.app.root.findByName('inset green felt').getPosition().y-1.675)<.001);
  assert.ok(other.distance(harness.app.root.findByName('delegate p2').getPosition())<.001);
  harness.update({...initial,seatHeight:undefined},90);
  assert.ok(Math.abs(harness.app.root.findByName('camera').getPosition().y-3.0625)<.001);
 }finally{harness.destroy();}
});

test('legislators hold and select printed cards privately, then pass a sealed packet',()=>{
 const props={...initial,phase:'president_discard',presidentId:'p0',chancellorId:'p1',ownHand:['liberal','fascist','liberal'],selectedCardIndex:1};
 const harness=scene(props);
 try{
  harness.update(props,3);
  const first=harness.app.root.findByName('held card p0 0');
  const second=harness.app.root.findByName('held card p0 1');
  const third=harness.app.root.findByName('held card p0 2');
  assert.equal(third.enabled,true);
  assert.ok(first.getPosition().y>1.7,'Held cards stay above the tabletop, not hidden inside it');
  assert.equal(first.render.material===second.render.material,false);
  assert.ok(second.getLocalPosition().y>first.getLocalPosition().y);
  const privateFace=first.render.material;
  harness.update({...props,myId:'p2',ownHand:[]},3);
  assert.equal(first.render.material===second.render.material,true,'Other viewers only see identical card backs');
  assert.equal(first.render.material===privateFace,false);
  const passed={...props,phase:'chancellor_discard',myId:'p2',ownHand:[],publicAction:{id:'pass-1',kind:'discard',actor_id:'p0'}};
  harness.update(passed,1);
  assert.equal(harness.app.root.findByName('moving sealed card packet').enabled,true);
  harness.update(passed,30);
  assert.equal(harness.app.root.findByName('moving sealed card packet').enabled,false);
  assert.equal(harness.app.root.findByName('card holding hand p1').enabled,true);
  assert.equal(harness.app.root.findByName('card holding hand p0').enabled,false);
 }finally{harness.destroy();}
});

test('table pistol waits at the president place and idle motion respects reduced effects',()=>{
 const harness=scene(initial);
 try{
  harness.update(initial,3);
  const tableGun=harness.app.root.findByName('president table pistol');
  assert.equal(tableGun.enabled,true);
  const body=harness.app.root.findByName('delegate p2').findByName('delegate body');
  const first=body.getPosition().clone();harness.update(initial,20);
  assert.ok(first.distance(body.getPosition())>.001);
  harness.update({...initial,gunArmed:true,phase:'executive',executionPresidentId:'p0'},2);
  assert.equal(tableGun.enabled,false);
  harness.update({...initial,reduced:true},2);
  const still=body.getPosition().clone();harness.update({...initial,reduced:true},20);
  assert.ok(still.distance(body.getPosition())<.001);
 }finally{harness.destroy();}
});
