import test from 'node:test';
import assert from 'node:assert/strict';
import {cardOptions,cardTargets,canRespond} from '../src/gameTypes.ts';
const players=[{id:'a',role:'noble'},{id:'b',role:'noble'},{id:'king',role:'king'}];
test('role targeting hides king from noble targets and respects self-target metadata',()=>{
 assert.deepEqual(cardTargets(players,'noble','a','king').map(p=>p.id),['b']);
 assert.deepEqual(cardTargets(players,'two_nobles','a','king',true).map(p=>p.id),['a','b']);
 assert.deepEqual(cardTargets(players,'king','a','king').map(p=>p.id),['king']);
});
test('dynamic card options preserve server IDs, amounts and target mode',()=>{
 const options=[{id:'reward',label:'Reward',target:'player',amounts:[100,200,300]}];
 assert.deepEqual(cardOptions({id:'c',type:'catalog-key',target:'none',options}),options);
 assert.equal(cardOptions({id:'old',description:'Legacy',target:'player'})[0].target,'player');
});
test('only eligible pending voters can respond and server denial is authoritative',()=>{
 assert.equal(canRespond({eligible_ids:['a'],votes:{}},'a'),true);
 assert.equal(canRespond({eligible_ids:['a'],votes:{a:'no'}},'a'),false);
 assert.equal(canRespond({eligible_ids:['a'],can_respond:false},'a'),false);
 assert.equal(canRespond({player_id:'a'},'b'),false);
 assert.equal(canRespond({can_respond:true},undefined),false);
});
