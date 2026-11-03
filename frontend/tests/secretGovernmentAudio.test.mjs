import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GovernmentAudio} from '../src/secretHitler/governmentAudio.ts';
const game=(version,phase,extra={})=>({code:'ROOM',version,phase,round:1,players:[],president_id:'a',chancellor_id:'b',nominee_id:'b',...extra});
function harness(){
 const sources=[];
 const parameter=()=>({setValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({disconnected:false,connect(){},disconnect(){this.disconnected=true;}});
 const source=kind=>{const value={...node(),kind,frequency:parameter(),starts:[],stops:[],start(time){this.starts.push(time);},stop(time){this.stops.push(time);}};sources.push(value);return value;};
 const context={currentTime:10,sampleRate:1000,state:'running',destination:{},resume:()=>Promise.resolve(),createOscillator:()=>source('bell'),createGain:()=>({...node(),gain:parameter()}),createBuffer:(_,count)=>({getChannelData:()=>new Float32Array(count)}),createBufferSource:()=>source('clap'),createBiquadFilter:()=>({...node(),frequency:parameter()})};
 return{sources,audio:new GovernmentAudio(()=>context)};
}
test('approval sound plays a finite bell and applause once for a live successful election',()=>{
 const h=harness();h.audio.unlock();h.audio.observe(game(1,'voting'));h.audio.observe(game(2,'president_discard'));
 assert.equal(h.sources.filter(s=>s.kind==='bell').length,4);assert.equal(h.sources.filter(s=>s.kind==='clap').length,24);
 assert.ok(h.sources.every(s=>s.starts.length===1&&s.stops.length===1&&s.stops[0]>s.starts[0]&&s.stops[0]<14));
 h.audio.observe(game(2,'president_discard'));h.audio.observe(game(1,'voting'));h.audio.observe(game(3,'president_discard'));assert.equal(h.sources.length,28);h.audio.dispose();
});
test('historical snapshots, failed elections, locked audio and reconnect do not applaud',()=>{
 const h=harness();h.audio.observe(game(1,'voting'));h.audio.observe(game(2,'president_discard'));h.audio.unlock();h.audio.observe(game(3,'president_discard'));assert.equal(h.sources.length,0);
 h.audio.resetBaseline();h.audio.observe(game(4,'president_discard'));assert.equal(h.sources.length,0);
 h.audio.observe(game(5,'voting',{round:2}));h.audio.observe(game(6,'nomination',{round:3}));assert.equal(h.sources.length,0);h.audio.dispose();
});
test('mute, reset, rematch and dispose cancel pending approval audio',()=>{
 const h=harness();h.audio.unlock();h.audio.observe(game(1,'voting'));h.audio.observe(game(2,'president_discard'));
 h.audio.setEnabled(false);assert.ok(h.sources.every(s=>s.disconnected&&s.stops.at(-1)===undefined));
 h.audio.setEnabled(true);h.audio.observe(game(3,'voting',{round:2}));h.audio.observe(game(4,'president_discard',{round:2}));assert.equal(h.sources.length,56);
 h.audio.resetBaseline();assert.ok(h.sources.every(s=>s.disconnected));
 h.audio.observe(game(5,'voting',{round:3}));h.audio.observe(game(6,'president_discard',{round:3}));h.audio.observe(game(7,'lobby'));assert.ok(h.sources.every(s=>s.disconnected));
 const count=h.sources.length;h.audio.dispose();h.audio.observe(game(8,'voting',{round:4}));h.audio.observe(game(9,'president_discard',{round:4}));assert.equal(h.sources.length,count);
});
test('same office holders can be applauded again in a new match with a newer approval version',()=>{
 const h=harness();h.audio.unlock();h.audio.observe(game(1,'voting'));h.audio.observe(game(2,'president_discard'));h.audio.observe(game(3,'finished'));h.audio.observe(game(4,'lobby'));
 h.audio.observe(game(5,'voting'));h.audio.observe(game(6,'president_discard'));assert.equal(h.sources.length,56);h.audio.dispose();
});
