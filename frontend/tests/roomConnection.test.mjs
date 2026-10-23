import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectRoom } from '../src/roomConnection.ts';

function harness() {
  let id = 0;
  const timers = new Map();
  const sockets = [];
  const states = [];
  let invalid = 0;
  const socketRef = { current: null };
  const cleanup = connectRoom({
    session: { code: 'ABCDEF', token: 'secret' }, base: '', origin: 'http://localhost:5173', socketRef,
    onState: value => states.push(value), onStatus: () => {}, onError: () => {}, onInvalid: () => invalid++,
    schedule: callback => { timers.set(++id, callback); return id; }, cancel: key => timers.delete(key),
    createSocket: url => { const ws = { url, closed: false, close() { this.closed = true; } }; sockets.push(ws); return ws; },
  });
  const flush = () => { const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn()); };
  return { cleanup, flush, sockets, states, timers, socketRef, invalid: () => invalid };
}

test('discarded StrictMode mount opens no socket', () => {
  const h = harness(); h.cleanup(); h.flush(); assert.equal(h.sockets.length, 0);
});
test('leaving detaches callbacks and never schedules reconnect', () => {
  const h = harness(); h.flush(); const ws = h.sockets[0]; const staleClose = ws.onclose;
  const staleMessage = ws.onmessage; h.cleanup(); staleClose({ code: 1006 });
  staleMessage({ data: JSON.stringify({ type: 'state', state: 'stale' }) });
  assert.equal(h.timers.size, 0); assert.equal(h.states.length, 0); assert.equal(ws.closed, true);
  assert.equal(h.socketRef.current, null);
});
test('unexpected disconnect retries once; invalid session does not retry', () => {
  const h = harness(); h.flush(); h.sockets[0].onclose({ code: 1006 });
  assert.equal(h.timers.size, 1); h.flush(); assert.equal(h.sockets.length, 2);
  h.sockets[1].onclose({ code: 4403 }); assert.equal(h.invalid(), 1); assert.equal(h.timers.size, 0);
  h.cleanup();
});
