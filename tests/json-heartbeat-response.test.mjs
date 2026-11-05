import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonHeartbeatResponse } from '../src/core/json-heartbeat-response.js';

test('a pending JSON proof emits immediately and remains live before the final result', async () => {
  let resolve;
  const response = jsonHeartbeatResponse(new Promise(done => { resolve = done; }), { intervalMs: 5 });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = decoder.decode((await reader.read()).value);
  assert.equal(raw, '\n', 'headers and first body bytes do not wait for a long provider call');
  raw += decoder.decode((await reader.read()).value);
  assert.equal(raw, '\n\n', 'an idle proxy sees heartbeat bytes while proof is still pending');
  resolve({ ok: true, result: { proof: 'complete' } });
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    raw += decoder.decode(chunk.value);
  }
  assert.deepEqual(JSON.parse(raw), { ok: true, result: { proof: 'complete' } });
  assert.equal(response.headers.get('content-encoding'), 'identity');
});

test('transport success cannot turn a rejected proof into success or expose an exception', async () => {
  const failed = jsonHeartbeatResponse(Promise.reject(new Error('private-provider-secret')));
  assert.deepEqual(await failed.json(), { ok: false, error: 'JSON_STREAM_FAILED' });
  const unavailable = jsonHeartbeatResponse(Promise.resolve({ ok: false, error: 'CAPABILITY_WATCH_RUN_FAILED' }));
  assert.equal((await unavailable.json()).ok, false);
});

test('disconnecting the client clears heartbeat work and tolerates a later rejection', async () => {
  let reject;
  const response = jsonHeartbeatResponse(new Promise((_, fail) => { reject = fail; }), { intervalMs: 5 });
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  reject(new Error('disconnected'));
  await Promise.resolve();
  assert.equal((await reader.read()).done, true);
});
