import test from 'node:test';
import assert from 'node:assert/strict';
import {
  maybeHandleWaveshareTerminalApi,
  WAVESHARE_TERMINAL_API,
  WAVESHARE_TERMINAL_MODEL,
  WAVESHARE_TERMINAL_PROTOCOL
} from '../src/devices/waveshare-terminal-api.js';

test('Waveshare terminal API uses the canonical namespace and supported board model', () => {
  assert.equal(WAVESHARE_TERMINAL_API, '/api/device/v1');
  assert.equal(WAVESHARE_TERMINAL_MODEL, 'waveshare-esp32-s3-touch-lcd-3.5-c');
  assert.equal(WAVESHARE_TERMINAL_PROTOCOL, '1.0');
});

test('unrelated requests are ignored by the terminal handler', async () => {
  const response = await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/other'),
    {}
  );
  assert.equal(response, null);
});

test('pairing remains owner-auth protected', async () => {
  const response = await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/device/v1/pair', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({device_id:'test-device'})
    }),
    { MELITURGOS_USER: 'owner', MELITURGOS_PASSWORD: 'configured-secret' }
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, 'AUTH_REQUIRED');
});
