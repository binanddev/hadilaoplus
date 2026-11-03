import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ActionNarrator,narrationText} from '../src/secretHitler/narration.ts';

const players=[{id:'a',name:'An'},{id:'b',name:'Bình'}];
const event=(id,kind='vote',extra={})=>({id,kind,actor_id:'a',...extra});
function harness(){
 const spoken=[],listeners=new Map();let canceled=0;
 const engine={voices:[],speak:value=>spoken.push(value),cancel:()=>canceled++,getVoices(){return this.voices;},addEventListener:(type,listener)=>listeners.set(type,listener),removeEventListener:(type,listener)=>{if(listeners.get(type)===listener)listeners.delete(type);}};
 const narrator=new ActionNarrator(engine,()=>({}));
 return{engine,narrator,spoken,listeners,canceled:()=>canceled};
}

test('public action narration never reads hidden roles, policies or individual votes',()=>{
 assert.equal(narrationText(event('1','vote',{vote:false,role:'hitler',hand:['fascist']}),players),'An đã bỏ phiếu.');
 assert.equal(narrationText(event('2','discard',{index:1,hand:['fascist'],discarded:'fascist'}),players),'An đã xử lý chính sách. Hồ sơ được chuyển tiếp.');
 assert.equal(narrationText(event('3','power',{power:'investigate',target_id:'b',private_info:{party:'fascist'}}),players),'An đã điều tra đảng tịch của Bình.');
 assert.equal(narrationText(event('4','discard',{policy:'liberal'}),players),'Chính sách Tự do đã được ban hành.');
 assert.equal(narrationText(event('5','unknown',{text:'secret'}),players),'');
});

test('voice is gesture gated and initial/reconnected snapshots stay silent',()=>{
 const h=harness();h.narrator.observe(event('baseline'),players);h.narrator.observe(event('before-gesture'),players);
 assert.equal(h.spoken.length,0);
 h.narrator.unlock();h.narrator.observe(event('live'),players);assert.equal(h.spoken.length,1);
 h.narrator.observe(event('live'),players);assert.equal(h.spoken.length,1);
 h.narrator.resetBaseline();assert.equal(h.canceled(),1);
 h.narrator.observe(event('missed'),players);assert.equal(h.spoken.length,1);
 h.narrator.observe(event('next'),players);assert.equal(h.spoken.length,2);
 h.narrator.dispose();
});

test('voice uses Vietnamese voice when available and bounds the backlog',()=>{
 const h=harness();h.engine.voices=[{lang:'en-US',name:'English'},{lang:'vi-VN',name:'Vietnamese'}];h.listeners.get('voiceschanged')();
 h.narrator.unlock();h.narrator.observe(event('0'),players);
 h.narrator.observe(event('1','nominate',{target_id:'b'}),players);
 assert.equal(h.spoken[0].lang,'vi-VN');assert.equal(h.spoken[0].voice.name,'Vietnamese');
 h.narrator.observe(event('2','ready',{ready:false}),players);
 h.narrator.observe(event('3','ready',{ready:true}),players);
 h.narrator.observe(event('4','start'),players);
 h.spoken[0].onend();assert.equal(h.spoken[1].text,'An đã sẵn sàng.');
 h.spoken[1].onend();assert.equal(h.spoken[2].text,'Hội đồng bắt đầu. Hãy xem vai trò riêng của bạn.');
 h.narrator.dispose();
});

test('mute and cleanup stop active speech, queued speech and stale callbacks',()=>{
 const h=harness();h.narrator.unlock();h.narrator.observe(event('0'),players);h.narrator.observe(event('1'),players);
 const staleEnd=h.spoken[0].onend;h.narrator.observe(event('2'),players);
 h.narrator.setEnabled(false);staleEnd();assert.equal(h.spoken.length,1);assert.equal(h.canceled(),1);
 h.narrator.observe(event('3'),players);h.narrator.setEnabled(true);h.narrator.observe(event('4'),players);assert.equal(h.spoken.length,2);
 const stale=h.spoken[1].onend;h.narrator.dispose();stale();h.narrator.observe(event('5'),players);
 assert.equal(h.spoken.length,2);assert.equal(h.listeners.size,0);
 assert.equal(new ActionNarrator(undefined,()=>({})).supported,false);
});

const game=(version,phase,extra={})=>({code:'ROOM',version,phase,round:1,players,president_id:'a',chancellor_id:'b',nominee_id:'b',...extra});
test('phase narration speaks invitations once and ignores individual ballot updates and old snapshots',()=>{
 const h=harness();h.narrator.unlock();h.narrator.observeGame(game(1,'lobby'));
 h.narrator.observeGame(game(2,'nomination'));
 assert.match(h.spoken[0].text,/Xin kính mời An/);
 h.spoken[0].onend();
 h.narrator.observeGame(game(3,'voting'));
 assert.match(h.spoken[1].text,/đã chọn Bình/);
 h.spoken[1].onend();
 h.narrator.observeGame(game(4,'voting',{presentation_event:event('v1')}));
 h.narrator.observeGame(game(4,'voting',{presentation_event:event('v1')}));
 h.narrator.observeGame(game(2,'nomination'));
 assert.equal(h.spoken.length,2);
 h.narrator.observeGame(game(5,'president_discard'));
 assert.match(h.spoken[2].text,/Xin chúc mừng chính quyền/);
 h.narrator.resetBaseline();h.narrator.observeGame(game(6,'chancellor_discard'));assert.equal(h.spoken.length,3);
 h.narrator.dispose();
});
test('one speech engine has one owner; old controllers and callbacks cannot speak again',()=>{
 const h=harness();h.narrator.unlock();h.narrator.observe(event('0'),players);h.narrator.observe(event('1'),players);
 const stale=h.spoken[0].onend;
 const second=new ActionNarrator(h.engine,()=>({}));second.unlock();second.observe(event('0'),players);
 second.observe(event('2'),players);assert.equal(h.canceled(),1);assert.equal(h.spoken.length,2);
 stale();h.narrator.observe(event('3'),players);assert.equal(h.spoken.length,2);
 second.dispose();
});
test('reminders deduplicate keys and event history cannot replay a previous action',()=>{
 const h=harness();h.narrator.unlock();h.narrator.observe(event('0'),players);h.narrator.observe(event('1'),players);h.spoken[0].onend();
 h.narrator.observe(event('2'),players);h.spoken[1].onend();h.narrator.observe(event('1'),players);assert.equal(h.spoken.length,2);
 h.narrator.remind('turn:1','Đề nghị tổng thống đưa ra quyết định.');h.narrator.remind('turn:1','Đề nghị tổng thống đưa ra quyết định.');assert.equal(h.spoken.length,3);
 h.spoken[2].onend();h.narrator.remind('turn:2','Đề nghị tổng thống đưa ra quyết định.');assert.equal(h.spoken.length,4);h.narrator.dispose();
});
