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


function ownerAuth() {
  return 'Basic ' + Buffer.from('owner:secret').toString('base64');
}

function bucketForManifest(manifest, files = {}) {
  return {
    async get(key) {
      if (key === 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/manifest.json') {
        return { text: async () => JSON.stringify(manifest) };
      }
      const bytes = files[key];
      if (!bytes) return null;
      const body = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(String(bytes));
      return {
        body,
        size: body.byteLength,
        customMetadata: {},
      };
    }
  };
}

test('USB firmware endpoint never falls back to the OTA app image', async () => {
  const MEDIA_BUCKET = bucketForManifest({
    firmware: {
      version: '0.5.0',
      available: true,
      key: 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mel-terminal.bin',
      sha256: 'ota-sha'
    },
    installer: { available: false, key: null, sha256: null }
  });
  const r = await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/device/v1/firmware', {
      headers: { authorization: ownerAuth() }
    }),
    { ...env, MEDIA_BUCKET }
  );
  assert.equal(r.status, 404);
  assert.equal((await r.json()).code, 'INSTALLER_NOT_PUBLISHED');
});

test('USB firmware endpoint serves the dedicated merged installer image', async () => {
  const key = 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mini-first-install.bin';
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const MEDIA_BUCKET = bucketForManifest({
    firmware: {
      version: '0.5.0',
      available: true,
      key: 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mel-terminal.bin',
      sha256: 'ota-sha'
    },
    installer: {
      available: true,
      key,
      sha256: 'installer-sha'
    }
  }, { [key]: bytes });

  const r = await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/device/v1/firmware', {
      headers: { authorization: ownerAuth() }
    }),
    { ...env, MEDIA_BUCKET }
  );

  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="mini-first-install.bin"');
  assert.equal(r.headers.get('x-mel-sha256'), 'installer-sha');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), bytes);
});
