import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_EYE_HEIGHT,DEFAULT_SEAT_HEIGHT,sanitizeSeatHeight,seatEyeHeight} from '../src/secretHitler/cameraSettings.ts';
test('personal seat height defaults higher and safely ranges up to twice the previous eye height',()=>{
 assert.equal(sanitizeSeatHeight(null),DEFAULT_SEAT_HEIGHT);
 assert.equal(sanitizeSeatHeight('invalid'),DEFAULT_SEAT_HEIGHT);
 assert.equal(sanitizeSeatHeight(Infinity),DEFAULT_SEAT_HEIGHT);
 assert.equal(sanitizeSeatHeight(.2),1);
 assert.equal(sanitizeSeatHeight(9),2);
 assert.equal(seatEyeHeight(2),BASE_EYE_HEIGHT*2);
 assert.ok(seatEyeHeight(undefined)>BASE_EYE_HEIGHT);
});
