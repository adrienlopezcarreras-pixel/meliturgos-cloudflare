import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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


test('USB installer script is pinned to the validated first-install path', async () => {
  const script = await readFile(new URL('../dist/MEL-Waveshare-Flash.ps1', import.meta.url), 'utf8');
  assert.match(script, /mini-first-install\.bin/);
  assert.match(script, /esptool==5\.4\.0/);
  assert.match(script, /write_flash 0x0 \$bin/);
  assert.match(script, /Programs\\Python\\Python312\\python\.exe/);
});

test('owner firmware endpoint serves installer image when manifest exposes one', async () => {
  const manifest = {
    model: 'waveshare-esp32-s3-touch-lcd-3.5-c',
    firmware: {
      version: '0.4.5-stability',
      available: true,
      key: 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mel-terminal.bin',
      sha256: 'ota-sha'
    },
    installer: {
      available: true,
      key: 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mini-first-install.bin',
      sha256: 'installer-sha'
    }
  };
  const bucket = {
    async get(key) {
      if (key.endsWith('/manifest.json')) {
        return { text: async () => JSON.stringify(manifest) };
      }
      if (key.endsWith('/mini-first-install.bin')) {
        const bytes = new Uint8Array([1,2,3,4]);
        return { body: bytes, size: bytes.byteLength, customMetadata: {} };
      }
      throw new Error('unexpected key '+key);
    }
  };
  const auth='Basic '+Buffer.from('owner:secret').toString('base64');
  const r=await maybeHandleWaveshareTerminalApi(
    new Request('https://mel.test/api/device/v1/firmware',{headers:{authorization:auth}}),
    {...env,MEDIA_BUCKET:bucket}
  );
  assert.equal(r.status,200);
  assert.equal(r.headers.get('content-disposition'),'attachment; filename="mini-first-install.bin"');
  assert.equal(r.headers.get('x-mel-sha256'),'installer-sha');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3,4]);
});
