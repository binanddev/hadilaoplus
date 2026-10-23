import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundTracker,GameAudio} from '../src/sound.ts';
const snapshot=(event,king='p1',phase='playing')=>({code:'ROOM1',phase,king_id:king,...(event?{last_event:event}:{})});
test('initial and repeated snapshots are silent; live action sounds once',()=>{
 const tracker=new SoundTracker();const first=snapshot({id:'old',type:'bomb'});
 assert.deepEqual(tracker.observe(first),[]);
 assert.deepEqual(tracker.observe(first),[]);
 const next=snapshot({id:'new',type:'theft'});
 assert.deepEqual(tracker.observe(next),['card','coins']);
 assert.deepEqual(tracker.observe(next),[]);
});
test('reconnect establishes a silent baseline even if an action was missed',()=>{
 const tracker=new SoundTracker();tracker.observe(snapshot({id:'first',type:'tax'}));tracker.reset();
 assert.deepEqual(tracker.observe(snapshot({id:'missed',type:'bomb'},'p2')),[]);
 assert.deepEqual(tracker.observe(snapshot({id:'live',type:'shield'},'p1')),['card','shield','royal']);
});
test('new rooms do not replay events; dealing and restart shuffle',()=>{
 const tracker=new SoundTracker();tracker.observe(snapshot(undefined,'','lobby'));
 assert.deepEqual(tracker.observe(snapshot(undefined,'p1','playing')),['shuffle','royal']);
 tracker.observe(snapshot(undefined,'p1','finished'));
 assert.deepEqual(tracker.observe(snapshot(undefined,'p1','playing')),['shuffle']);
 assert.deepEqual(tracker.observe({...snapshot({id:'existing',type:'bomb'}),code:'ROOM2'}),[]);
});
test('audio waits for a gesture; mute silences and stops sources; disposal closes context/listeners',()=>{
 const previousDocument=globalThis.document,previousContext=globalThis.AudioContext;
 const listeners=new Map();const contexts=[];
 class FakeNode{gain={value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}};frequency={value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}};Q={value:0};stopped=false;connect(){}disconnect(){}addEventListener(){}start(){}stop(){this.stopped=true}}
 class FakeContext{state='running';sampleRate=8000;currentTime=0;destination={};nodes=[];constructor(){contexts.push(this)}make(){const n=new FakeNode();this.nodes.push(n);return n}createGain(){return this.make()}createOscillator(){return this.make()}createBufferSource(){return this.make()}createBiquadFilter(){return this.make()}createBuffer(_channels,n){return {getChannelData:()=>new Float32Array(n)}}resume(){this.state='running';return Promise.resolve()}close(){this.state='closed';return Promise.resolve()}}
 globalThis.document={addEventListener:(type,cb)=>listeners.set(type,cb),removeEventListener:(type,cb)=>{if(listeners.get(type)===cb)listeners.delete(type)}};
 globalThis.AudioContext=FakeContext;
 let audio;
 try{audio=new GameAudio(true);audio.unlock();audio.play('coins');assert.equal(contexts.length,0);
 audio.setMuted(false);audio.play('coins');assert.equal(contexts.length,0);
 listeners.get('pointerdown')();assert.equal(contexts.length,1);
 audio.play('coins');assert.ok(contexts[0].nodes.length>1);
 const created=contexts[0].nodes.length;audio.setMuted(true);audio.play('bomb');assert.equal(contexts[0].nodes.length,created);assert.ok(contexts[0].nodes.some(n=>n.stopped));
 audio.dispose();assert.equal(contexts[0].state,'closed');assert.equal(listeners.size,0);audio.unlock();assert.equal(contexts.length,1);
 }finally{audio?.dispose();globalThis.document=previousDocument;globalThis.AudioContext=previousContext}
});
