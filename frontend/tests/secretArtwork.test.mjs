import {test} from 'node:test';
import assert from 'node:assert/strict';
import {artworkPalette,colorizeArtworkPixels,inkAt,inkPalettes} from '../src/secretHitler/artwork.ts';

test('the same ink palette colors original policy/party/board/ballot art in both renderers',()=>{
 for(const name of ['board-liberal','policy-liberal','role-liberal','party-liberal','president'])assert.equal(artworkPalette(`/secret-hitler/${name}.webp`),'blue');
 for(const name of ['board-fascist-5','policy-fascist','role-hitler','party-fascist','ballot-nein','chancellor'])assert.equal(artworkPalette(`/secret-hitler/${name}.webp`),'red');
 assert.equal(artworkPalette('/secret-hitler/ballot-ja.webp'),'green');
 assert.equal(artworkPalette('/secret-hitler/card-back.svg'),undefined);
});

test('colored printing retains alpha, shading and readable light/dark contrast',()=>{
 for(const name of ['blue','red','green']){
  const pixels=new Uint8ClampedArray([0,0,0,255,128,128,128,128,255,255,255,0]);
  colorizeArtworkPixels(pixels,name);
  assert.deepEqual([...pixels.slice(0,3)],inkPalettes[name][0]);
  assert.deepEqual([...pixels.slice(8,11)],inkPalettes[name].at(-1));
  assert.deepEqual([pixels[3],pixels[7],pixels[11]],[255,128,0]);
  const dark=inkAt(0,name),mid=inkAt(128,name),light=inkAt(255,name);
  assert.ok(dark.every((value,i)=>value<mid[i]&&mid[i]<light[i]));
  assert.ok(name==='blue'?mid[2]>mid[0]:name==='red'?mid[0]>mid[2]:mid[1]>mid[0]);
 }
});
