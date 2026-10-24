import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canShootTarget,delegateSeat,facingCenter,freshExecution,officeSeat,positionOnPath,seatingPath,seatingPlan} from '../src/secretHitler/spatial.ts';
const players=Array.from({length:10},(_,seat)=>({id:`p${seat}`,seat,alive:true}));
test('government has reserved opposite endpoints; normal delegates retain stable side chairs',()=>{
 const plan=seatingPlan(players,'p2','p5');
 assert.deepEqual(plan.get('p2'),officeSeat('president'));
 assert.deepEqual(plan.get('p5'),officeSeat('chancellor'));
 assert.deepEqual(plan.get('p3'),delegateSeat(3));
 assert.equal(new Set([...plan.values()].map(p=>`${p.x}:${p.z}`)).size,10);
 assert.equal(facingCenter({x:0,z:6}),0);
});
test('corpse stays in its occupied chair and new official takes adjacent chair at same end',()=>{
 const dead=players.map(p=>p.id==='p2'?{...p,alive:false,eliminated_office:'president',eliminated_office_slot:0}:p);
 const plan=seatingPlan(dead,'p7','p5');
 assert.deepEqual(plan.get('p2'),officeSeat('president',0));
 assert.deepEqual(plan.get('p7'),officeSeat('president',1));
 assert.deepEqual(seatingPlan(dead,'p7','p5',new Map()).get('p2'),plan.get('p2'));
});
test('seating transitions go around the solid tabletop and arrive exactly at office chair',()=>{
 for(let seat=0;seat<10;seat++)for(const office of ['president','chancellor']){
  const from=delegateSeat(seat),to=officeSeat(office),path=seatingPath(from,to);
  assert.deepEqual(positionOnPath(path,0),{x:from.x,z:from.z});
  assert.deepEqual(positionOnPath(path,1),{x:to.x,z:to.z});
  for(let i=0;i<=100;i++){
   const point=positionOnPath(path,i/100);
   assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));
   assert.ok(Math.abs(point.x)>=3.5||Math.abs(point.z)>=5.25,`Path entered tabletop from ${seat} to ${office}: ${JSON.stringify(point)}`);
  }
 }
});
test('gun cannot target self, dead delegates, ineligible targets or fire without execution permission',()=>{
 const eligible=['p2'];
 assert.equal(canShootTarget('p0','p2',true,players,eligible),true);
 assert.equal(canShootTarget('p0','p2',false,players,eligible),false);
 assert.equal(canShootTarget('p0','p0',true,players,['p0']),false);
 assert.equal(canShootTarget('p0','p3',true,players,eligible),false);
 assert.equal(canShootTarget('p0','p2',true,players.map(p=>p.id==='p2'?{...p,alive:false}:p),eligible),false);
 assert.equal(canShootTarget('p0','p2',true,players.map(p=>p.id==='p0'?{...p,alive:false}:p),eligible),false);
});
test('execution effects only play for a fresh server event after connection baseline',()=>{
 const event={id:'shot1',actor_id:'p0',target_id:'p2'};
 assert.equal(freshExecution(undefined,event),false);
 assert.equal(freshExecution('shot1',event),false);
 assert.equal(freshExecution(null,event),true);
 assert.equal(freshExecution('shot1',{...event,id:'shot2'}),true);
 assert.equal(freshExecution('shot1',null),false);
});
