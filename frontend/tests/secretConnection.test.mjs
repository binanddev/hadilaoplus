import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectSecretRoom } from '../src/secretHitler/connection.ts';

function harness({base='',failSocket=false}={}) {
  const sockets=[],states=[],statuses=[],errors=[],timers=new Map();
  let next=0,current=null;
  const cleanup=connectSecretRoom({code:'ABCDEF',player_id:'me',token:'private +/?&='},base,
    state=>states.push(state),message=>statuses.push(message),message=>errors.push(message),ws=>{current=ws;},{
      origin:'https://friends.example',
      createSocket:url=>{if(failSocket)throw new Error('blocked');const ws={url,closed:false,close(...args){this.closed=true;this.closeArgs=args;}};sockets.push(ws);return ws;},
      schedule:(callback,delay)=>{timers.set(++next,{callback,delay});return next;},
      cancel:id=>timers.delete(id),
    });
  const flush=()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(job=>job.callback());};
  return {sockets,states,statuses,errors,timers,flush,cleanup,current:()=>current};
}

test('Secret Hitler discarded StrictMode mount opens no socket',()=>{
  const h=harness();h.cleanup();h.flush();assert.equal(h.sockets.length,0);assert.equal(h.current(),null);
});

test('Secret Hitler secure connection uses separate namespace and preserves encoded token',()=>{
  const h=harness({base:'https://api.example/ignored?old=1#fragment'});h.flush();
  const url=new URL(h.sockets[0].url);
  assert.equal(url.protocol,'wss:');assert.equal(url.hostname,'api.example');
  assert.equal(url.pathname,'/ws/secret-hitler/rooms/ABCDEF/');
  assert.equal(url.searchParams.get('token'),'private +/?&=');assert.equal(url.searchParams.size,1);assert.equal(url.hash,'');
  h.sockets[0].onopen();assert.equal(h.statuses.at(-1),'Đã kết nối');h.cleanup();
});

test('Secret Hitler transient close reconnects once and obsolete callbacks cannot overwrite replacement',()=>{
  const h=harness();h.flush();const first=h.sockets[0],staleMessage=first.onmessage,staleClose=first.onclose;
  first.onclose({code:1006});assert.equal(h.current(),null);assert.equal(h.timers.size,1);
  assert.equal([...h.timers.values()][0].delay,2000);
  h.flush();assert.equal(h.sockets.length,2);const replacement=h.current();
  staleMessage({data:JSON.stringify({type:'state',state:{private:'stale'}})});staleClose({code:1006});
  assert.equal(h.states.length,0);assert.equal(h.current(),replacement);assert.equal(h.timers.size,0);
  replacement.onmessage({data:JSON.stringify({type:'state',state:{version:2}})});assert.deepEqual(h.states,[{version:2}]);h.cleanup();
});

test('Secret Hitler cleanup clears retries and suppresses all saved callbacks',()=>{
  const h=harness();h.flush();const ws=h.sockets[0],open=ws.onopen,message=ws.onmessage,close=ws.onclose;
  h.cleanup();const statusCount=h.statuses.length;
  open();message({data:JSON.stringify({type:'state',state:'stale'})});close({code:1006});h.flush();
  assert.equal(h.states.length,0);assert.equal(h.statuses.length,statusCount);assert.equal(h.sockets.length,1);
  assert.equal(h.timers.size,0);assert.equal(ws.closed,true);assert.equal(h.current(),null);
  assert.deepEqual(ws.closeArgs,[1000,'Leaving room']);
  assert.equal(ws.onopen,null);assert.equal(ws.onmessage,null);assert.equal(ws.onclose,null);
  const retry=harness();retry.flush();retry.sockets[0].onclose({code:1006});retry.cleanup();retry.flush();assert.equal(retry.sockets.length,1);
});

test('Secret Hitler invalid session stops retrying and reports recoverable lobby guidance',()=>{
  const h=harness();h.flush();h.sockets[0].onclose({code:4403});
  assert.equal(h.timers.size,0);assert.equal(h.current(),null);assert.equal(h.statuses.at(-1),'Phiên không hợp lệ');
  assert.match(h.errors.at(-1),/Về sảnh/);h.flush();assert.equal(h.sockets.length,1);h.cleanup();
});

test('Secret Hitler protocol errors are reported without breaking later state updates',()=>{
  const h=harness();h.flush();const ws=h.sockets[0];
  ws.onmessage({data:'<html>bad gateway'});assert.match(h.errors.at(-1),/Không đọc được/);
  ws.onmessage({data:JSON.stringify({type:'error',message:'Không phải lượt của bạn.'})});assert.equal(h.errors.at(-1),'Không phải lượt của bạn.');
  ws.onmessage({data:JSON.stringify({type:'state',state:{version:3}})});assert.deepEqual(h.states,[{version:3}]);h.cleanup();
});

test('Secret Hitler invalid URL or blocked socket reports error without uncaught exceptions',()=>{
  for(const options of [{base:'http://['},{base:'file:///secret'},{failSocket:true}]){
    const h=harness(options);assert.doesNotThrow(h.flush);assert.equal(h.current(),null);
    assert.equal(h.statuses.at(-1),'Không thể kết nối');assert.equal(h.errors.length,1);assert.equal(h.timers.size,0);h.cleanup();
  }
});
