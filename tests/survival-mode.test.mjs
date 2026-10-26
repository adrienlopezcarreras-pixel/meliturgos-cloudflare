import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { readSurvivalState, runSurvivalMode, SURVIVAL_AFTER_MS } from '../src/legacy/survival-mode.js';

const T = Date.parse('2027-11-01T00:00:00Z');
async function owner(db, at) {
  await db.prepare('CREATE TABLE IF NOT EXISTS archive_messages (id TEXT, conversation_id TEXT, role TEXT, content TEXT, timestamp INTEGER)').run();
  await db.prepare("INSERT INTO archive_messages VALUES (?, 'c', 'user', 'bonjour', ?)").bind('m' + at, at).run();
}

test('survival starts after one year of owner silence and ends with the next owner message', async () => {
  const db = sqliteD1();
  assert.equal((await readSurvivalState(db, { now: T })).active, false, 'no history never means survival');
  await owner(db, T - SURVIVAL_AFTER_MS - 1);
  assert.equal((await readSurvivalState(db, { now: T })).status, 'SURVIVAL');
  await owner(db, T);
  assert.equal((await readSurvivalState(db, { now: T })).status, 'OWNER_PRESENT');
});

test('in survival MEL runs MAX, approves every pending watch proposal and installs revenue sources', async () => {
  const calls = [];
  const deps = {
    readSurvivalState: async () => ({ active: true, status: 'SURVIVAL' }),
    setMaxAutonomy: async () => calls.push('max'),
    getWatchStatus: async () => ({ discoveries: { items: [{ fingerprint: 'a' }, { fingerprint: 'b', owner_decision: { status: 'APPROVED' } }, { fingerprint: 'c' }] } }),
    approveProposal: async (env, fp) => calls.push('approve:' + fp),
    installRevenue: async () => calls.push('revenue'),
  };
  const result = await runSurvivalMode({ DB: {} }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['max', 'approve:a', 'approve:c', 'revenue']);
  const present = await runSurvivalMode({ DB: {} }, { ...deps, readSurvivalState: async () => ({ active: false, status: 'OWNER_PRESENT' }) });
  assert.deepEqual(present.actions, [], 'nothing is decided for a present owner');
});

test('the daily self-audit runs survival mode', async () => {
  assert.match(await readFile('src/diagnostics/self-audit-supervisor.js', 'utf8'), /capture\('survival-mode'/);
});
