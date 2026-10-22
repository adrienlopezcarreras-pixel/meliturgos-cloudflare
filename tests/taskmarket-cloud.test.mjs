import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTaskmarketWallet, submitTaskmarketCloud, unlockWallet, encryptedKeyLayouts, ensureTaskmarketWalletImport, handleTaskmarketWalletImport, taskmarketWalletStatus } from '../src/revenue/taskmarket-cloud.js';
import { privateKeyToAddress, recoverPersonalSignAddress } from '../src/crypto/evm-sign.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const hex = b => Buffer.from(b).toString('hex');
const PK = '4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318';
const ADDRESS = privateKeyToAddress('0x' + PK);
const TASK = '0x' + 'b'.repeat(64);

function memoryVaults() {
  const m = new Map();
  return { putToken: async ({ connector_id, token_set }) => { m.set(connector_id, structuredClone(token_set)); }, getToken: async ({ connector_id }) => structuredClone(m.get(connector_id) ?? null) };
}

async function encrypt(dek, layout, overrideIv = null) {
  const iv = overrideIv || crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', dek, 'AES-GCM', false, ['encrypt']);
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('0x' + PK)));
  const ct = out.slice(0, -16), tag = out.slice(-16);
  if (layout === 'colon') return [hex(iv), hex(tag), hex(ct)].join(':');
  if (layout === 'blob') return Buffer.from([...iv, ...ct, ...tag]).toString('base64');
  return JSON.stringify({ iv: hex(iv), authTag: hex(tag), ciphertext: hex(ct) });
}

test('Base64 ciphertext beginning with 0x is not mistaken for hex', () => {
  // 0x is a valid Base64 prefix and must remain part of the encoded bytes.
  const raw = Buffer.alloc(70, 0x33);
  raw[0] = 0xd3; raw[1] = 0x1c; // Base64 prefix: 0x
  const encoded = raw.toString('base64');
  assert.ok(encoded.startsWith('0x'));
  const candidates = encryptedKeyLayouts(encoded);
  assert.ok(candidates.length > 0);
  assert.deepEqual(Buffer.from(candidates[0][0]), raw.subarray(0, 12));
});

test('0x-prefixed Base64 keystore unlocks with authenticated AES-GCM and address check', async () => {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  iv[0] = 0xd3; iv[1] = 0x1c;
  const encryptedKey = await encrypt(dek, 'blob', iv);
  assert.ok(encryptedKey.startsWith('0x'));
  const result = await unlockWallet({ encryptedKey, walletAddress: ADDRESS }, dek);
  assert.equal(hex(result), PK);
  await assert.rejects(unlockWallet({ encryptedKey, walletAddress: '0x' + '1'.repeat(40) }, dek), /UNLOCK_FAILED/);
});

for (const layout of ['colon', 'blob', 'json']) {
  test('keystore unlocks like the CLI (' + layout + ' layout) and only for the right address', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const keystore = { encryptedKey: await encrypt(dek, layout), walletAddress: ADDRESS, deviceId: 'd1', apiToken: 't' };
    assert.ok(encryptedKeyLayouts(keystore.encryptedKey).length >= 1);
    const key = await unlockWallet(keystore, dek);
    assert.equal(hex(key), PK);
    await assert.rejects(unlockWallet({ ...keystore, walletAddress: '0x' + '1'.repeat(40) }, dek), /UNLOCK_FAILED/);
  });
}

test('a deliverable is signed and handed in from the cloud, PC off', async () => {
  const vaults = memoryVaults();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const keystore = { encryptedKey: await encrypt(dek, 'colon'), walletAddress: ADDRESS, deviceId: 'dev-1', apiToken: 'tok' };
  const saved = await saveTaskmarketWallet({}, { 'keystore.json': JSON.stringify(keystore), 'legal.json': JSON.stringify({ receipt: 'rcpt-123456' }) }, { vaults });
  assert.deepEqual(saved, { saved: true, address: ADDRESS, legal_receipt: true });
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/api/devices/dev-1/key')) { assert.deepEqual(JSON.parse(init.body), { deviceId: 'dev-1', apiToken: 'tok' }); return Response.json({ deviceEncryptionKey: hex(dek) }); }
    if (url.endsWith('/submissions')) return Response.json({ success: true, submissionId: 'sub-1' });
    return Response.json({ submissionWindowOpen: true });
  };
  const r = await submitTaskmarketCloud({}, { taskId: TASK, content: '# Livrable\nTexte.', fetchImpl, vaults });
  assert.deepEqual(r, { status: 'SUBMITTED', submissionId: 'sub-1' });
  const submit = calls.find(c => c.url.endsWith('/submissions'));
  const body = JSON.parse(submit.init.body);
  assert.equal(body.workerAddress, ADDRESS);
  assert.equal(recoverPersonalSignAddress('taskmarket:submit:' + TASK, body.signature), ADDRESS);
  assert.equal(Buffer.from(body.artifacts[0].file, 'base64').toString(), '# Livrable\nTexte.');
  assert.equal(submit.init.headers['X-Taskmarket-Legal-Receipt'], 'rcpt-123456');
  assert.match(submit.init.headers['X-Taskmarket-Idempotency-Key'], /^[0-9a-f-]{36}$/);
});

test('legal acceptance and paid submissions are surfaced, never paid', async () => {
  const vaults = memoryVaults();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  await saveTaskmarketWallet({}, { 'keystore.json': JSON.stringify({ encryptedKey: await encrypt(dek, 'blob'), walletAddress: ADDRESS, deviceId: 'd', apiToken: 't' }) }, { vaults });
  const make = status => async url => url.endsWith('/key') ? Response.json({ deviceEncryptionKey: Buffer.from(dek).toString('base64') })
    : url.endsWith('/submissions') ? Response.json({ code: status === 403 ? 'LEGAL_ACCEPTANCE_REQUIRED' : 'PAYMENT_REQUIRED' }, { status }) : Response.json({});
  assert.equal((await submitTaskmarketCloud({}, { taskId: TASK, content: 'x', fetchImpl: make(403), vaults })).status, 'LEGAL_ACCEPTANCE_REQUIRED');
  assert.equal((await submitTaskmarketCloud({}, { taskId: TASK, content: 'x', fetchImpl: make(402), vaults })).status, 'PAYMENT_REQUIRED_REFUSED');
  assert.equal((await submitTaskmarketCloud({}, { taskId: TASK, content: 'x', fetchImpl: make(402), vaults: memoryVaults() })).status, 'NO_CLOUD_WALLET');
});

test('the PC keystore is copied once through a single-use ticket', async () => {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE computer_commands (id TEXT, device_id TEXT, session_id TEXT, plan_json TEXT, status TEXT, created_at INTEGER)').run();
  const vaults = memoryVaults();
  const env = { DB: db, MELITURGOS_USER: 'adrien' };
  const status = env => taskmarketWalletStatus(env, { vaults });
  // No wallet yet and PC online → one import command, then no duplicate.
  const r1 = await ensureTaskmarketWalletImport({ ...env, __v: vaults }, { now: 1000, selectDevice: async () => ({ id: 'pc' }) });
  assert.equal(r1.status, 'IMPORT_QUEUED');
  const plan = JSON.parse((await db.prepare('SELECT plan_json FROM computer_commands').first()).plan_json);
  const cmd = plan.steps[0].payload.command;
  assert.match(cmd, /keystore\.json/);
  assert.doesNotMatch(cmd, /Write-Output \$files|\$files\|ConvertTo-Json\s*$/m);
  const ticket = /ticket=([a-f0-9]{48})/.exec(cmd)[1];
  assert.equal((await ensureTaskmarketWalletImport(env, { now: 2000, selectDevice: async () => ({ id: 'pc' }) })).status, 'IMPORT_PENDING');
  const post = t => handleTaskmarketWalletImport(new Request('https://mel.test/api/computer/v1/taskmarket-wallet-import?ticket=' + t, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: { 'keystore.json': JSON.stringify({ encryptedKey: 'aa:bb:cc', walletAddress: ADDRESS, deviceId: 'd', apiToken: 't' }) } }) }), env, { now: 3000, vaults });
  assert.equal((await post(ticket)).status, 200);
  assert.equal((await post(ticket)).status, 403); // single use
  assert.equal((await post('f'.repeat(48))).status, 403);
  assert.deepEqual(await status(env), { cloud: true, address: ADDRESS, legal_accepted: false });
});

test('draft Taskmarket terms cannot be accepted: no acceptance is attempted', async () => {
  const { acceptTaskmarketLegal } = await import('../src/revenue/taskmarket-cloud.js');
  const vaults = memoryVaults();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  await saveTaskmarketWallet({}, { 'keystore.json': JSON.stringify({ encryptedKey: await encrypt(dek, 'colon'), walletAddress: ADDRESS, deviceId: 'd', apiToken: 't' }) }, { vaults });
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return url.endsWith('/key') ? Response.json({ deviceEncryptionKey: hex(dek) }) : Response.json({ acceptanceAvailable: false }); };
  assert.deepEqual(await acceptTaskmarketLegal({}, { fetchImpl, vaults }), { status: 'NOT_AVAILABLE_YET' });
  assert.ok(!calls.some(u => u.includes('/challenge')));
});
