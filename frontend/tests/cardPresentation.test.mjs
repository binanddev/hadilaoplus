import test from 'node:test';
import assert from 'node:assert/strict';
import {presentationKind} from '../src/cardPresentation.ts';
import {SoundTracker} from '../src/sound.ts';

test('new role deck cards trigger their relevant cues, not just the old eight names',()=>{
  assert.equal(presentationKind('k_royal_bomb'),'bomb');
  assert.equal(presentationKind('n_royal_bomb'),'bomb');
  assert.equal(presentationKind('k_kings_eye'),'shield');
  assert.equal(presentationKind('n_meat_for_meat'),'mad_king');
  assert.equal(presentationKind('n_sub_rosa'),'inspect');
  assert.equal(presentationKind('k_sub_rosa'),'inspect');
  const tracker=new SoundTracker();
  tracker.observe({code:'ROOM',phase:'playing',king_id:'a'});
  assert.deepEqual(tracker.observe({code:'ROOM',phase:'playing',king_id:'a',last_event:{id:'inspect',type:'k_sub_rosa'}}),['card','shuffle']);
  assert.deepEqual(tracker.observe({code:'ROOM',phase:'playing',king_id:'a',last_event:{id:'blast',type:'n_royal_bomb'}}),['card','bomb']);
});
