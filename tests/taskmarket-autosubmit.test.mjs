import test from 'node:test';
import assert from 'node:assert/strict';
import { taskmarketSubmitCommand, queueTaskmarketSubmission, refreshTaskmarketSubmissions, listTaskmarketSubmissions } from '../src/revenue/taskmarket-autosubmit.js';
import { maybeHandleComputerApi } from '../src/devices/computer-companion-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const TASK = '0x' + 'ab'.repeat(32);
const ART = 'work-' + 'c'.repeat(64);

async function setup({ remote = true } = {}) {
  const db = sqliteD1();
  await db.prepare("CREATE TABLE computer_devices(id TEXT PRIMARY KEY,token_hash TEXT,name TEXT,platform TEXT,capabilities TEXT,allowed_apps TEXT,halted INTEGER DEFAULT 0,created_at INTEGER,last_seen_at INTEGER,metadata TEXT)").run();
  await db.prepare("CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)").run();
  await db.prepare("INSERT INTO computer_devices VALUES('pc','h','PC','windows','[]','[]',0,0,?,?)").bind(Date.now(), JSON.stringify({ remote_access_enabled: remote, engine_heartbeat_at: Date.now() })).run();
  await db.prepare('CREATE TABLE mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT, content TEXT, status TEXT, created_at TEXT)').run();
  await db.prepare("INSERT INTO mel_work_artifacts VALUES (?, ?, 'Livrable complet', 'DRAFT_UNVERIFIED', '')").bind(ART, TASK).run();
  return { DB: db, MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test' };
}

test('submit command: fixed template, checks draft hash and submission window, never moves funds', () => {
  const { command } = taskmarketSubmitCommand({ taskId: TASK, downloadUrl: 'https://mel.test/api/computer/v1/device-file?ticket=' + 'a'.repeat(48), sha256: 'b'.repeat(64) });
  assert.ok(command.length < 8192);
  assert.match(command, /'task','submit',\$id,'--file',\$f,'--role','final'/);
  assert.match(command, /DRAFT_SHA256_MISMATCH/);
  assert.match(command, /submissionWindowOpen/);
  assert.doesNotMatch(command, /withdraw|transfer|deposit|claim|`/i);
  assert.throws(() => taskmarketSubmitCommand({ taskId: "0x1';calc", downloadUrl: 'https://x/api/computer/v1/device-file?ticket=' + 'a'.repeat(48), sha256: 'b'.repeat(64) }), /TASK_ID_INVALID/);
});

test('only bounty drafts without human steps are queued, once per task, within the daily limit', async () => {
  const env = await setup();
  assert.equal((await queueTaskmarketSubmission(env, { artifactId: ART, taskId: TASK, mode: 'claim', status: 'DRAFT_UNVERIFIED' })).status, 'NOT_A_BOUNTY');
  assert.equal((await queueTaskmarketSubmission(env, { artifactId: ART, taskId: TASK, mode: 'bounty', status: 'DRAFT_FOR_OWNER' })).status, 'NEEDS_OWNER');
  assert.equal((await queueTaskmarketSubmission({ ...env, MEL_WORK_AUTOSUBMIT: 'off' }, { artifactId: ART, taskId: TASK, mode: 'bounty', status: 'DRAFT_UNVERIFIED' })).status, 'AUTOSUBMIT_DISABLED');
  const first = await queueTaskmarketSubmission(env, { artifactId: ART, taskId: TASK, mode: 'bounty', status: 'DRAFT_UNVERIFIED' });
  assert.equal(first.status, 'QUEUED');
  assert.equal((await queueTaskmarketSubmission(env, { artifactId: ART, taskId: TASK, mode: 'bounty', status: 'DRAFT_UNVERIFIED' })).status, 'ALREADY_SUBMITTED');
  const other = '0x' + 'cd'.repeat(32);
  assert.equal((await queueTaskmarketSubmission({ ...env, MEL_WORK_DAILY_SUBMISSIONS: '1' }, { artifactId: ART, taskId: other, mode: 'bounty', status: 'DRAFT_UNVERIFIED' })).status, 'DAILY_LIMIT_REACHED');
});

test('the queued command fetches exactly the stored draft once, and the result is read back', async () => {
  const env = await setup();
  const { commandId } = await queueTaskmarketSubmission(env, { artifactId: ART, taskId: TASK, mode: 'bounty', status: 'DRAFT_UNVERIFIED' });
  const step = JSON.parse((await env.DB.prepare('SELECT plan_json FROM computer_commands WHERE id=?').bind(commandId).first()).plan_json).steps[0];
  const url = new URL(step.payload.command.match(/\$url='([^']+)'/)[1]);
  const res = await maybeHandleComputerApi(new Request('https://mel.test' + url.pathname + url.search), env);
  assert.equal(await res.text(), 'Livrable complet');
  assert.equal((await maybeHandleComputerApi(new Request('https://mel.test' + url.pathname + url.search), env)).status, 403);
  await env.DB.prepare("UPDATE computer_commands SET status='SUCCEEDED', result_json=? WHERE id=?").bind(JSON.stringify({ outputs: [{ stdout: JSON.stringify({ submitted: true }) }] }), commandId).run();
  assert.equal((await refreshTaskmarketSubmissions(env)).updated, 1);
  assert.equal((await listTaskmarketSubmissions(env.DB))[0].status, 'SUBMITTED');
});

test('Companion offline or access not allowed: nothing is queued', async () => {
  const env = await setup({ remote: false });
  assert.equal((await queueTaskmarketSubmission(env, { artifactId: ART, taskId: TASK, mode: 'bounty', status: 'DRAFT_UNVERIFIED' })).status, 'COMPANION_OFFLINE');
});
