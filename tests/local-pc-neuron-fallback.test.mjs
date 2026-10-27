import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { bindLocalPcWorkersAi, chooseLocalModel, localPcCommand, localPcModelReady, ONLINE_CODER_MODEL } from '../src/models/local-pc-model.js';

async function device(db, metadata, now) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_devices (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, name TEXT NOT NULL, platform TEXT NOT NULL,
    capabilities TEXT NOT NULL, allowed_apps TEXT NOT NULL, halted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, metadata TEXT NOT NULL DEFAULT '{}'
  )`).run();
  await db.prepare('INSERT INTO computer_devices (id, token_hash, name, platform, capabilities, allowed_apps, halted, created_at, last_seen_at, metadata) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind('pc-1', 'hash', 'pc', 'windows', '[]', '[]', 0, now, now, JSON.stringify(metadata)).run();
}

test('local compute is refused unless the Companion is fresh and the owner allowed it', async () => {
  const db = sqliteD1();
  const now = Date.now();
  assert.equal((await localPcModelReady({ DB: db }, now)).code, 'COMPANION_OFFLINE_OR_NOT_AUTHORIZED');
  await device(db, { remote_access_enabled: true, engine_heartbeat_at: now, local_compute_enabled: false }, now);
  assert.equal((await localPcModelReady({ DB: db }, now)).code, 'LOCAL_COMPUTE_DISABLED');
  await db.prepare('UPDATE computer_devices SET metadata=? WHERE id=?').bind(JSON.stringify({ remote_access_enabled: true, engine_heartbeat_at: now, local_compute_enabled: true }), 'pc-1').run();
  assert.equal((await localPcModelReady({ DB: db }, now)).ok, true);
});

test('the local binding answers text and never calls Workers AI', async () => {
  const env = { DB: {}, AI: { run: async () => { throw new Error('CLOUD_MUST_NOT_RUN'); } } };
  bindLocalPcWorkersAi(env, async () => ({ ok: true, text: 'suite locale', model: 'pc:qwen3:8b' }));
  const answer = await env.AI.run('@cf/openai/gpt-oss-120b', { messages: [{ role: 'user', content: 'continue' }] });
  assert.equal(answer.response, 'suite locale');
  assert.equal(answer.local, true);
  assert.equal(env.MEL_INFERENCE, 'local-pc');
  await assert.rejects(env.AI.run('image', {}), error => error.code === 'LOCAL_MODEL_TEXT_ONLY');
});

test('a coding question the PC cannot answer is asked to the online coder', async () => {
  const seen = [];
  const env = { DB: {}, AI: { run: async model => { seen.push(model); return { response: 'function patch(){return 1}' }; } } };
  bindLocalPcWorkersAi(env, async (call) => {
    assert.equal(call.model, 'qwen2.5-coder:7b');
    return { ok: false, code: 'LOCAL_MODEL_EMPTY' };
  });
  const answer = await env.AI.run('@cf/meta/llama', { messages: [{ role: 'user', content: 'écris la fonction patch' }] });
  assert.equal(answer.local, false);
  assert.equal(answer.local_fallback, 'LOCAL_MODEL_EMPTY');
  assert.deepEqual(seen, [ONLINE_CODER_MODEL]);
});

test('a coding command reads the coder file, not the chat model', () => {
  assert.equal(chooseLocalModel([{ role: 'user', content: 'bonjour' }]), 'qwen3:8b');
  const command = localPcCommand({ model: 'qwen2.5-coder:7b', messages: [{ role: 'user', content: 'function add' }] }).command;
  assert.match(command, /local-coder\.txt/);
  assert.doesNotMatch(command, /local-model\.txt/);
});

test('an exhausted neuron share continues on the PC instead of stopping MAX', async () => {
  const source = await readFile('src/evolution/autonomy-runtime.js', 'utf8');
  assert.match(source, /bindLocalPcWorkersAi\(env, options\.runLocalPcModel\)/);
  assert.match(source, /status: 'AI_BUDGET_EXHAUSTED'/);
});

test('Companion readiness diagnoses stale heartbeat and disabled remote authorization', async () => {
  const { diagnoseAgentDevice } = await import('../src/devices/computer-agent.js');
  const db = sqliteD1();
  const now = Date.now();
  await device(db, { remote_access_enabled: false, engine_heartbeat_at: now, local_compute_enabled: true }, now);
  assert.equal((await diagnoseAgentDevice(db, now)).code, 'COMPANION_REMOTE_ACCESS_DISABLED');
  await db.prepare('UPDATE computer_devices SET metadata=? WHERE id=?')
    .bind(JSON.stringify({ remote_access_enabled: true, engine_heartbeat_at: now - 25000, local_compute_enabled: true }), 'pc-1').run();
  assert.equal((await diagnoseAgentDevice(db, now)).code, 'COMPANION_HEARTBEAT_STALE');
  const ready = await localPcModelReady({ DB: db }, now);
  assert.equal(ready.reason, 'COMPANION_HEARTBEAT_STALE');
  await db.prepare('UPDATE computer_devices SET metadata=? WHERE id=?')
    .bind(JSON.stringify({ remote_access_enabled: true, engine_heartbeat_at: now, local_compute_enabled: true }), 'pc-1').run();
  assert.equal((await diagnoseAgentDevice(db, now)).code, 'READY');
});
