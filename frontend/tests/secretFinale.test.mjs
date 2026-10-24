import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFinalePlan,finaleBeat,finaleShotTimes,celebrationStarts,finaleDuration} from '../src/secretHitler/finale.ts';

function result(winner='liberal'){
 return {code:'FINAL',version:21,phase:'finished',winner,
  players:Array.from({length:5},(_,seat)=>({id:`p${seat}`,seat,alive:seat!==3})),
  known_roles:[{id:'p0',role:'liberal'},{id:'p1',role:'fascist'},{id:'p2',role:'hitler'},{id:'p3',role:'liberal'},{id:'p4',role:'liberal'}]};
}

test('finale requires confirmed result and fully revealed roles; Hitler belongs to fascist team',()=>{
 const game=result();
 assert.equal(buildFinalePlan({...game,phase:'executive'}),null);
 assert.equal(buildFinalePlan({...game,known_roles:game.known_roles.slice(0,3)}),null);
 const liberal=buildFinalePlan(game);
 assert.deepEqual(liberal.targets,['p1','p2']);
 assert.deepEqual(liberal.celebrants,['p0','p4']);
 assert.deepEqual(buildFinalePlan(result('fascist')).winnerIds,['p1','p2']);
 assert.deepEqual(buildFinalePlan(result('fascist')).targets,['p0','p4']);
});

test('staff shoot each living loser once before winners celebrate; state stays untouched',()=>{
 const game=result(),before=structuredClone(game),plan=buildFinalePlan(game);
 const times=finaleShotTimes(plan);
 assert.equal(finaleBeat(plan,0).stage,'announce');
 assert.deepEqual(finaleBeat(plan,times[0]-.01).defeatedIds,[]);
 assert.deepEqual(finaleBeat(plan,times[0]+.01).defeatedIds,['p1']);
 assert.equal(finaleBeat(plan,times[0]+.01).muzzleFlash,true);
 assert.equal(finaleBeat(plan,times[0]+.2).muzzleFlash,false);
 assert.deepEqual(finaleBeat(plan,times[1]+.01).defeatedIds,['p1','p2']);
 assert.equal(finaleBeat(plan,celebrationStarts(plan)+.1).stage,'celebrate');
 assert.equal(finaleBeat(plan,finaleDuration(plan)+1).stage,'complete');
 assert.deepEqual(game,before);
});

test('already eliminated losers are not shot again and dead winners are not revived',()=>{
 const game=result();game.players[1].alive=false;game.players[2].alive=false;
 const plan=buildFinalePlan(game);
 assert.deepEqual(plan.targets,[]);
 assert.deepEqual(plan.celebrants,['p0','p4']);
 assert.deepEqual(finaleShotTimes(plan),[]);
 assert.equal(finaleBeat(plan,celebrationStarts(plan)+1).stage,'celebrate');
});
