import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FinaleAudio} from '../src/secretHitler/finaleAudio.ts';
import {finaleShotTimes} from '../src/secretHitler/finale.ts';

const plan=(id='final-1')=>({id,winner:'liberal',winnerIds:['a','b'],loserIds:['c','d'],targets:['c','d'],celebrants:['a','b']});
function harness(){
 const sources=[];let resumed=0;
 const parameter=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({disconnected:false,connect(){},disconnect(){this.disconnected=true;}});
 const source=kind=>{const value={...node(),kind,frequency:parameter(),starts:[],stops:[],start(time){this.starts.push(time);},stop(time){this.stops.push(time);}};sources.push(value);return value;};
 const context={currentTime:10,sampleRate:1000,state:'running',destination:{},resume(){resumed++;return Promise.resolve();},createOscillator:()=>source('bell'),createGain:()=>({...node(),gain:parameter()}),createBuffer:(_,count)=>({getChannelData:()=>new Float32Array(count)}),createBufferSource:()=>source('shot'),createBiquadFilter:()=>({...node(),frequency:parameter()})};
 return {sources,context,audio:new FinaleAudio(()=>context),resumed:()=>resumed};
}

test('finale audio only starts on a new confirmed live result after a gesture',()=>{
 const h=harness();h.audio.observe(null);h.audio.observe(plan());assert.equal(h.sources.length,0);
 h.audio.unlock();h.audio.observe(plan());assert.equal(h.sources.length,0,'Unlock does not replay a muted historical result');
 h.audio.observe(null);h.audio.observe(plan('next'));
 assert.equal(h.sources.filter(s=>s.kind==='bell').length,24);
 assert.equal(h.sources.filter(s=>s.kind==='shot').length,2);
 const count=h.sources.length;h.audio.observe(plan('next'));assert.equal(h.sources.length,count);
 h.audio.dispose();
});

test('finale shots align with the scene timeline and the score is finite',()=>{
 const h=harness();h.audio.unlock();h.audio.observe(null);h.audio.observe(plan());
 const shots=h.sources.filter(source=>source.kind==='shot');
 shots.forEach((shot,index)=>assert.equal(shot.starts[0],10.035+finaleShotTimes(plan())[index]));
 assert.ok(h.sources.every(source=>source.starts.length===1&&source.stops.length===1));
 assert.ok(h.sources.every(source=>source.stops[0]>source.starts[0]));
 assert.equal(h.resumed(),1);h.audio.dispose();
});

test('mute, reconnect, rematch and disposal cancel all remaining scheduled sound',()=>{
 const h=harness();h.audio.unlock();h.audio.observe(null);h.audio.observe(plan());
 h.audio.setEnabled(false);assert.ok(h.sources.every(source=>source.disconnected&&source.stops.at(-1)===undefined));
 const count=h.sources.length;h.audio.setEnabled(true);h.audio.resetBaseline();h.audio.observe(plan('missed'));assert.equal(h.sources.length,count);
 h.audio.observe(null);h.audio.observe(plan('fresh'));assert.ok(h.sources.length>count);
 h.audio.observe(null);assert.ok(h.sources.every(source=>source.disconnected));
 h.audio.dispose();h.audio.observe(plan('after-dispose'));assert.ok(h.sources.every(source=>source.disconnected));
});
