import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleWaveshareTerminalApi } from '../src/devices/waveshare-terminal-api.js';

const env={MELITURGOS_USER:'owner',MELITURGOS_PASSWORD:'secret'};

test('pair-code creation is owner protected before DB access',async()=>{
  const r=await maybeHandleWaveshareTerminalApi(new Request('https://mel.test/api/device/v1/pair-code',{method:'POST'}),env);
  assert.equal(r.status,401);
  assert.equal((await r.json()).code,'AUTH_REQUIRED');
});

test('terminal status is owner protected before DB access',async()=>{
  const r=await maybeHandleWaveshareTerminalApi(new Request('https://mel.test/api/device/v1/status'),env);
  assert.equal(r.status,401);
  assert.equal((await r.json()).code,'AUTH_REQUIRED');
});

test('firmware download metadata is owner protected',async()=>{
  const r=await maybeHandleWaveshareTerminalApi(new Request('https://mel.test/api/device/v1/firmware-info'),env);
  assert.equal(r.status,401);
});
