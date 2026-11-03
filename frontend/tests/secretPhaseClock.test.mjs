import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phaseClock} from '../src/secretHitler/phaseClock.ts';

test('card reminders start after government seating, repeat every twenty seconds without choosing cards',()=>{
 const game={phase:'president_discard',phase_started_at:100,legislative_available_at:110};
 assert.equal(phaseClock(game,105).preparation,5);
 assert.equal(phaseClock(game,129.9).reminder,0);
 assert.equal(phaseClock(game,130).reminder,1);
 assert.equal(phaseClock(game,150).reminder,2);
 assert.equal(phaseClock(game,150).remaining,20);
 assert.equal(phaseClock({...game,phase:'chancellor_discard',phase_started_at:170},190).reminder,1);
});

test('discussion countdown uses absolute server deadline and remains at zero while waiting for update',()=>{
 const game={phase:'discussion',discussion_ends_at:230};
 assert.equal(phaseClock(game,200).remaining,30);
 assert.equal(phaseClock(game,230.1).remaining,0);
 assert.equal(phaseClock(game,250).choosing,false);
 assert.equal(phaseClock({phase:'finished'},250).reminder,0);
});
