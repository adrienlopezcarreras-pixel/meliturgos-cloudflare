import test from 'node:test';
import assert from 'node:assert/strict';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { androidUpdateCommand, validateAndroidUpdateInput, ANDROID_UPDATE_CONFIRMATION } from '../src/devices/android-update-companion.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const ownerAuth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
const SHA = 'c'.repeat(64);
const URL_OK = 'https://mel.test/api/computer/v1/device-file?ticket=' + 'd'.repeat(48);
const request = (path, method = 'GET', body = null, authenticated = true) => new Request('https://mel.test' + path, {
  method,
  headers: { ...(authenticated ? { authorization: ownerAuth } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const MANIFEST = { available: true, key: 'devices/android/MEL-Android-89.apk', sha256: SHA, version_name: '0.7.11', version_code: 89 };
const bucket = manifest => ({
  async get(key) {
    if (key === 'devices/android/manifest.json') return manifest ? { text: async () => JSON.stringify(manifest) } : null;
    if (key === manifest?.key) return { body: new Blob([new Uint8Array([0x50, 0x4b, 3, 4])]).stream(), size: 4 };
    return null;
  },
});

async function seededEnv({ manifest = MANIFEST } = {}) {
  const DB = sqliteD1();
  const env = { DB, MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test', MEDIA_BUCKET: bucket(manifest) };
  assert.equal((await maybeHandleComputerApi(request('/api/computer/v1/status'), env)).status, 200);
  await DB.prepare('INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind('pc-1', 'h', 'PC', 'windows', JSON.stringify(['computer.use']), JSON.stringify([]), 0, Date.now(), Date.now(), JSON.stringify({ remote_access_enabled: true })).run();
  return { DB, env };
}
const update = (env, payload, authenticated = true) => maybeHandleComputerApi(request('/api/computer/v1/pc-control', 'POST', { computer_id: 'pc-1', action: 'android.update', payload }, authenticated), env);

test('owner pairing/connection values are strictly validated before reaching PowerShell', () => {
  assert.deepEqual(validateAndroidUpdateInput({ pair_host: '192.168.1.20:37099', pair_code: '123456', connect_host: '192.168.1.20:41235' }), { pair: '192.168.1.20:37099', code: '123456', connect: '192.168.1.20:41235' });
  assert.deepEqual(validateAndroidUpdateInput({}), { pair: '', code: '', connect: '' });
  for (const bad of [{ pair_host: '8.8.8.8:5555', pair_code: '123456' }, { pair_host: "192.168.1.2:5555';calc;'", pair_code: '123456' }, { pair_host: '192.168.1.2:5555', pair_code: '12ab56' }, { pair_code: '123456' }, { connect_host: 'evil.com:5555' }]) {
    assert.throws(() => validateAndroidUpdateInput(bad), /ANDROID_/);
  }
});

test('update command uses official Google adb with checksum, installs with -r and reads the version back', () => {
  const { command, timeout_ms } = androidUpdateCommand({ downloadUrl: URL_OK, sha256: SHA, pair: '192.168.1.20:37099', code: '123456' });
  assert.equal(timeout_ms, 120000);
  assert.ok(command.length <= 8192);
  assert.match(command, /dl\.google\.com\/android\/repository\/repository2-3\.xml/);
  assert.match(command, /ADB_CHECKSUM_MISMATCH/);
  assert.match(command, /'install','-r',\$apk/);
  assert.match(command, /ANDROID_APK_SHA256_MISMATCH/);
  assert.match(command, /\$pair='192\.168\.1\.20:37099';\$code='123456'/);
  assert.doesNotMatch(command, /uninstall|pm clear|`/, 'never uninstalls, wipes data, or embeds a backtick');
  assert.throws(() => androidUpdateCommand({ downloadUrl: 'https://evil/x.apk', sha256: SHA }), /ANDROID_UPDATE_URL_INVALID/);
});

test('owner + explicit confirmation required; invalid pairing input refused before queueing', async () => {
  const { DB, env } = await seededEnv();
  assert.equal((await update(env, { confirmation: ANDROID_UPDATE_CONFIRMATION }, false)).status, 401);
  assert.equal((await update(env, {})).status, 403);
  const bad = await update(env, { confirmation: ANDROID_UPDATE_CONFIRMATION, pair_host: '1.2.3.4:5555', pair_code: '123456' });
  assert.equal(bad.status, 400);
  assert.equal((await DB.prepare('SELECT COUNT(*) n FROM computer_commands').first()).n, 0);
});

test('nothing queued when no APK is published', async () => {
  const { env } = await seededEnv({ manifest: null });
  const res = await update(env, { confirmation: ANDROID_UPDATE_CONFIRMATION });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'ANDROID_APK_NOT_PUBLISHED');
});

test('confirmed update queues the fixed command and its APK ticket serves the published file once', async () => {
  const { DB, env } = await seededEnv();
  const res = await update(env, { confirmation: ANDROID_UPDATE_CONFIRMATION, connect_host: '192.168.1.20:41235', command: 'INJECTED' });
  assert.equal(res.status, 202);
  const step = JSON.parse((await DB.prepare('SELECT plan_json FROM computer_commands').first()).plan_json).steps[0];
  assert.equal(step.action, 'system.exec');
  assert.doesNotMatch(step.payload.command, /INJECTED/);
  assert.match(step.payload.command, /\$target='192\.168\.1\.20:41235'/);
  const ticketUrl = new URL(step.payload.command.match(/\$url='([^']+)'/)[1]);
  const download = await maybeHandleComputerApi(request(ticketUrl.pathname + ticketUrl.search, 'GET', null, false), env);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('x-mel-sha256'), SHA);
  assert.equal((await maybeHandleComputerApi(request(ticketUrl.pathname + ticketUrl.search, 'GET', null, false), env)).status, 403);
});
