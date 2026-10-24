import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import {configureSceneRendering} from '../src/sceneRendering.ts';

// Run the engine's actual tick/render decision with an offline graphics device.
// Only the GPU submission itself is replaced by a counter.
function scene(pixelRatio){
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:pixelRatio}});
 const canvas={id:'render-budget-test',width:1280,height:720};
 const app=new pc.AppBase(canvas),options=new pc.AppOptions();
 options.graphicsDevice=new pc.NullGraphicsDevice(canvas);
 options.componentSystems=[];options.resourceHandlers=[];app.init(options);
 let clock=1000,renders=0,updates=0,elapsed=0;
 const visibility=new EventTarget();visibility.hidden=false;
 app.on('update',dt=>{updates++;elapsed+=dt;});
 app.render=()=>{renders++;};
 const dispose=configureSceneRendering(app,visibility,()=>clock);
 return{app,visibility,dispose,get renders(){return renders;},get updates(){return updates;},get elapsed(){return elapsed;},
  tick(time){clock=1000+time;app.tick(clock);},
  hide(hidden){visibility.hidden=hidden;visibility.dispatchEvent(new Event('visibilitychange'));},
  destroy(){dispose();app.destroy();if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete globalThis.window;}
 };
}

for(const refresh of [30,60,120,144,240])test(`limits GPU renders to 30 FPS at ${refresh} Hz without slowing updates`,()=>{
 const harness=scene();
 try{
  for(let i=0;i<refresh*5;i++)harness.tick(i*1000/refresh);
  assert.equal(harness.updates,refresh*5,'No game presentation update is dropped');
  assert.ok(Math.abs(harness.renders-150)<=1,`Expected 150 renders, received ${harness.renders}`);
  assert.ok(Math.abs(harness.elapsed-(5-1/refresh))<.001,'Animation clock preserves real elapsed time');
 }finally{harness.destroy();}
});

test('slow frames do not trigger catch-up renders or starve the scene',()=>{
 const harness=scene();
 try{
  for(const time of [0,100,300,1000,1001,1002])harness.tick(time);
  assert.equal(harness.renders,4);
  harness.tick(1034);assert.equal(harness.renders,5);
 }finally{harness.destroy();}
});

test('hidden tabs stop rendering, keep updates, and draw immediately on return',()=>{
 const harness=scene();
 try{
  harness.tick(0);assert.equal(harness.renders,1);
  harness.hide(true);
  // A stale resize/asset request must not wake the GPU in a hidden tab.
  harness.app.renderNextFrame=true;
  for(let i=1;i<=60;i++)harness.tick(i*1000/60);
  assert.equal(harness.renders,1);assert.equal(harness.updates,61);
  harness.hide(false);harness.tick(1001);
  assert.equal(harness.renders,2);
  harness.tick(1002);assert.equal(harness.renders,2);
 }finally{harness.destroy();}
});

for(const ratio of [undefined,.75,1,1.5,2,3])test(`3D pixel ratio ${ratio} avoids supersampling`,()=>{
 const harness=scene(ratio);
 try{assert.equal(harness.app.graphicsDevice.maxPixelRatio,ratio<1?ratio:1);}
 finally{harness.destroy();}
});

test('cleanup removes render and visibility handlers and tolerates repeated disposal',()=>{
 const harness=scene();
 try{
  harness.tick(0);harness.dispose();harness.dispose();
  assert.equal(harness.app.hasEvent('framerender'),false);
  assert.equal(harness.app.autoRender,true);
  harness.app.renderNextFrame=true;harness.hide(true);
  assert.equal(harness.app.renderNextFrame,true,'Disposed visibility handler must not touch the app');
 }finally{harness.destroy();}
});
