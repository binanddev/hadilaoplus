import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildActionLabels} from '../src/secretHitler/actionLabels.ts';
const base={players:[{id:'a',name:'An',alive:true,ready:true},{id:'b',name:'Bình',alive:true,ready:false},{id:'c',name:'Chi',alive:false}],president_id:'a',chancellor_id:'b',nominee_id:'b',voted_ids:[],power:null,power_used:false};
test('overhead labels identify the named actor and public phase',()=>{
 assert.match(buildActionLabels({...base,phase:'nomination'}).a,/Tổng thống An đang đề cử thủ tướng/);
 assert.match(buildActionLabels({...base,phase:'chancellor_discard'}).b,/Thủ tướng Bình đang chọn chính sách/);
 assert.match(buildActionLabels({...base,phase:'executive',power:'execution'}).a,/đang chọn người hành quyết/);
 assert.match(buildActionLabels({...base,phase:'voting'}).c,/Chi đã bị loại/);
});
test('hidden voting labels reveal completion only, never the vote or private hand',()=>{
 const labels=buildActionLabels({...base,phase:'voting',voted_ids:['a'],votes:{a:false},hand:['fascist'],role:'hitler'});
 assert.match(labels.a,/đã niêm phong phiếu/);assert.match(labels.b,/đang bỏ phiếu tín nhiệm/);
 assert.doesNotMatch(Object.values(labels).join(' '),/Nein|Ja|Hitler|Phát xít/);
});
