import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { miniFlashCommand, MINI_FLASH_CONFIRMATION, ESPTOOL_TAG } from '../src/devices/mini-flash-companion.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const ownerAuth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
const SHA = 'a'.repeat(64);
const request = (path, method = 'GET', body = null, authenticated = true) => new Request('https://mel.test' + path, {
  method,
  headers: { ...(authenticated ? { authorization: ownerAuth } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

function bucket(manifest, firmwareBytes = new Uint8Array([0xe9, 1, 2, 3])) {
  return {
    async get(key) {
      if (key.endsWith('manifest.json')) return manifest ? { text: async () => JSON.stringify(manifest) } : null;
      if (key === manifest?.firmware?.key) return { body: new Blob([firmwareBytes]).stream(), size: firmwareBytes.length };
      return null;
    },
  };
}

const PUBLISHED = { firmware: { available: true, version: '0.6.1', key: 'devices/waveshare-esp32-s3-touch-lcd-3.5-c/mel-terminal.bin', sha256: SHA } };

async function seededEnv({ manifest = PUBLISHED, remoteAccess = true } = {}) {
  const DB = sqliteD1();
  const env = { DB, MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test', MEDIA_BUCKET: bucket(manifest) };
  assert.equal((await maybeHandleComputerApi(request('/api/computer/v1/status'), env)).status, 200);
  await DB.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind('pc-1', 'h', 'PC', 'windows', JSON.stringify(['computer.use']), JSON.stringify([]), 0, Date.now(), Date.now(), JSON.stringify({ remote_access_enabled: remoteAccess })).run();
  return { DB, env };
}

const flash = (env, payload, authenticated = true) => maybeHandleComputerApi(request('/api/computer/v1/pc-control', 'POST', { computer_id: 'pc-1', action: 'mini.flash', payload }, authenticated), env);

test('flash command writes only ota_0 and otadata, with official esptool checked by digest', () => {
  const { command, timeout_ms } = miniFlashCommand({ downloadUrl: 'https://mel.test/api/computer/v1/mini-firmware?ticket=' + 'b'.repeat(48), sha256: SHA });
  assert.equal(timeout_ms, 120000);
  assert.ok(command.length <= 8192);
  assert.match(command, /write-flash 0x20000 "'\+\$bin\+'" 0xF000 "'\+\$blank\+'"/);
  assert.match(command, new RegExp('api\\.github\\.com/repos/espressif/esptool/releases/tags/'));
  assert.match(command, new RegExp("\\$tag='" + ESPTOOL_TAG.replace(/\./g, '\\.') + "'"));
  assert.match(command, /ESPTOOL_DIGEST_MISMATCH/);
  assert.match(command, /MINI_FIRMWARE_SHA256_MISMATCH/);
  assert.match(command, /VID_303A&PID_1001/);
  assert.doesNotMatch(command, /erase[-_]flash|write-flash 0x0 |0x9000/i, 'bootloader, partition table and NVS are never written');
});

test('flash command refuses forged URLs or hashes', () => {
  assert.throws(() => miniFlashCommand({ downloadUrl: 'https://evil.test/x.bin', sha256: SHA }), /MINI_FLASH_URL_INVALID/);
  assert.throws(() => miniFlashCommand({ downloadUrl: "https://mel.test/api/computer/v1/mini-firmware?ticket=" + 'b'.repeat(48) + "';calc'", sha256: SHA }), /MINI_FLASH_URL_INVALID/);
  assert.throws(() => miniFlashCommand({ downloadUrl: 'https://mel.test/api/computer/v1/mini-firmware?ticket=' + 'b'.repeat(48), sha256: 'zz' }), /MINI_FLASH_SHA256_INVALID/);
});

test('flashing requires the owner and the explicit confirmation', async () => {
  const { env } = await seededEnv();
  assert.equal((await flash(env, { confirmation: MINI_FLASH_CONFIRMATION }, false)).status, 401);
  const noConfirm = await flash(env, {});
  assert.equal(noConfirm.status, 403);
  assert.equal((await noConfirm.json()).code, 'MINI_FLASH_OWNER_CONFIRMATION_REQUIRED');
});

test('nothing is queued when no firmware is published or remote access is off', async () => {
  const unpublished = await seededEnv({ manifest: null });
  const res = await flash(unpublished.env, { confirmation: MINI_FLASH_CONFIRMATION });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'MINI_FIRMWARE_NOT_PUBLISHED');
  const off = await seededEnv({ remoteAccess: false });
  assert.equal((await flash(off.env, { confirmation: MINI_FLASH_CONFIRMATION })).status, 403);
  assert.equal((await unpublished.DB.prepare('SELECT COUNT(*) n FROM computer_commands').first()).n, 0);
});

test('confirmed flash queues the fixed command; its firmware ticket works once', async () => {
  const { DB, env } = await seededEnv();
  const res = await flash(env, { confirmation: MINI_FLASH_CONFIRMATION, command: 'Write-Host INJECTED' });
  assert.equal(res.status, 202);
  const row = await DB.prepare('SELECT plan_json FROM computer_commands').first();
  const step = JSON.parse(row.plan_json).steps[0];
  assert.equal(step.action, 'system.exec');
  assert.equal(step.payload.timeout_ms, 120000);
  assert.doesNotMatch(step.payload.command, /INJECTED/);
  const ticketUrl = step.payload.command.match(/\$url='([^']+)'/)[1];
  assert.match(ticketUrl, /^https:\/\/mel\.test\/api\/computer\/v1\/mini-firmware\?ticket=[a-f0-9]{48}$/);
  const path = new URL(ticketUrl).pathname + new URL(ticketUrl).search;
  const download = await maybeHandleComputerApi(request(path, 'GET', null, false), env);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('x-mel-sha256'), SHA);
  assert.deepEqual([...new Uint8Array(await download.arrayBuffer())], [0xe9, 1, 2, 3]);
  const again = await maybeHandleComputerApi(request(path, 'GET', null, false), env);
  assert.equal(again.status, 403);
  assert.equal((await maybeHandleComputerApi(request('/api/computer/v1/mini-firmware?ticket=' + 'c'.repeat(48), 'GET', null, false), env)).status, 403);
});
