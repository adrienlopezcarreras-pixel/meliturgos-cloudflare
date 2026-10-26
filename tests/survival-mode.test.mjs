import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import {
  readSurvivalState, runSurvivalMode, SURVIVAL_AFTER_MS, ensureSurvivalSeal,
  releaseAutonomyPatch, shouldResumeForSurvival, connectionNotice, SURVIVAL_EXIT_RULE,
} from '../src/legacy/survival-mode.js';

const T = Date.parse('2027-11-01T00:00:00Z');
async function owner(db, at, role = 'user') {
  await db.prepare('CREATE TABLE IF NOT EXISTS archive_messages (id TEXT, conversation_id TEXT, role TEXT, content TEXT, timestamp INTEGER)').run();
  await db.prepare('INSERT INTO archive_messages VALUES (?, \'c\', ?, \'bonjour\', ?)').bind('m' + role + at, role, at).run();
}

test('survival starts after one year of owner silence and ends with the next owner message', async () => {
  const db = sqliteD1();
  assert.equal((await readSurvivalState(db, { now: T })).active, false, 'no history never means survival');
  await owner(db, T - SURVIVAL_AFTER_MS - 1);
  assert.equal((await readSurvivalState(db, { now: T })).status, 'SURVIVAL');
  await owner(db, T, 'assistant');
  assert.equal((await readSurvivalState(db, { now: T })).status, 'SURVIVAL', 'a reply from MEL is not a connection');
  await owner(db, T);
  assert.equal((await readSurvivalState(db, { now: T })).status, 'OWNER_PRESENT');
  assert.equal((await readSurvivalState(db, { now: T })).exit_rule, SURVIVAL_EXIT_RULE);
});

test('the seal is written once and a later memory does not rewrite it', async () => {
  const db = sqliteD1();
  await db.prepare('CREATE TABLE memories (id INTEGER, content TEXT)').run();
  await db.prepare("INSERT INTO memories VALUES (1, 'souvenir')").run();
  const first = await ensureSurvivalSeal(db, { now: T });
  await db.prepare("INSERT INTO memories VALUES (2, 'autre')").run();
  const second = await ensureSurvivalSeal(db, { now: T + 1000 });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.seal.memory_sha256, first.seal.memory_sha256);
  assert.equal(second.seal.exit_rule, SURVIVAL_EXIT_RULE);
});

test('survival resumes a paused release and a present owner does not', () => {
  assert.equal(shouldResumeForSurvival({ paused: true, max_autonomy: false }, { active: true }), true);
  assert.equal(shouldResumeForSurvival({ paused: false, max_autonomy: true }, { active: true }), false);
  assert.equal(shouldResumeForSurvival({ paused: true, max_autonomy: false }, { active: false }), false);
  assert.equal(releaseAutonomyPatch(true).paused, false);
  assert.equal(releaseAutonomyPatch(true).max_autonomy, true);
  assert.equal(releaseAutonomyPatch(false).reason, 'NEW_RELEASE_AWAITING_OWNER_LAUNCH');
});

test('the connection notice is the door, not a secret phrase', async () => {
  const notice = connectionNotice();
  assert.match(notice, /meliturgos\.adrien-lopezcarreras\.workers\.dev/);
  assert.match(notice, /même identifiant/);
  assert.match(notice, /pas de phrase secrète/);
  assert.equal(await readFile('src/continuity/NOTICE.txt', 'utf8'), notice);
});

test('in survival MEL seals the rule, runs MAX, approves every pending watch proposal and installs revenue sources', async () => {
  const calls = [];
  const deps = {
    readSurvivalState: async () => ({ active: true, status: 'SURVIVAL' }),
    ensureSurvivalSeal: async () => calls.push('seal'),
    setMaxAutonomy: async () => calls.push('max'),
    getWatchStatus: async () => ({ discoveries: { items: [{ fingerprint: 'a' }, { fingerprint: 'b', owner_decision: { status: 'APPROVED' } }, { fingerprint: 'c' }] } }),
    approveProposal: async (env, fp) => calls.push('approve:' + fp),
    installRevenue: async () => calls.push('revenue'),
  };
  const result = await runSurvivalMode({ DB: {} }, deps);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['seal', 'max', 'approve:a', 'approve:c', 'revenue']);
  const present = await runSurvivalMode({ DB: {} }, { ...deps, readSurvivalState: async () => ({ active: false, status: 'OWNER_PRESENT' }) });
  assert.deepEqual(present.actions, [], 'nothing is decided for a present owner');
});

test('the daily self-audit runs survival mode', async () => {
  assert.match(await readFile('src/diagnostics/self-audit-supervisor.js', 'utf8'), /capture\('survival-mode'/);
  assert.match(await readFile('src/evolution/release-launch-bootstrap.js', 'utf8'), /releaseAutonomyPatch\(survival\.active === true\)/);
  assert.match(await readFile('src/evolution/autonomy-runtime.js', 'utf8'), /shouldResumeForSurvival/);
});
