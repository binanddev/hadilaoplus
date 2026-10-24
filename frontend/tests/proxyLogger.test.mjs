import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withWebSocketDiagnostics} from '../proxyLogger.ts';

function harness(){
 const errors=[],warnings=[];
 const source={error:(...args)=>errors.push(args),warn:(...args)=>warnings.push(args),hasWarned:false};
 return{errors,warnings,source,logger:withWebSocketDiagnostics(source)};
}
test('Windows WebSocket abort produces one visible warning instead of duplicate error stacks',()=>{
 const h=harness(),error=Object.assign(new Error('write aborted'),{code:'ECONNABORTED'});
 h.logger.error('\u001b[31mws proxy error:\u001b[39m\nstack',{error});
 h.logger.error('ws proxy socket error:\nstack',{error});
 assert.equal(h.errors.length,0);assert.equal(h.warnings.length,1);
 assert.match(h.warnings[0][0],/ECONNABORTED/);
});
test('real backend/proxy errors and HTTP aborts retain their original diagnostics',()=>{
 const h=harness();
 for(const [message,code]of [['ws proxy error: refused','ECONNREFUSED'],['ws proxy socket error: reset','ECONNRESET'],['http proxy error: aborted','ECONNABORTED'],['Unexpected runtime error','ECONNABORTED']]){
  const options={error:Object.assign(new Error(message),{code})};
  h.logger.error(message,options);
  assert.equal(h.errors.at(-1)[0],message);assert.equal(h.errors.at(-1)[1],options);
 }
 assert.equal(h.errors.length,4);assert.equal(h.warnings.length,0);
 h.source.hasWarned=true;assert.equal(h.logger.hasWarned,true);
});
