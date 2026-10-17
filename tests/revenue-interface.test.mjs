import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/revenue-interface.js';
import { normalizeRevenueTasks } from '../src/api/revenue-worker-api.js';

test('MEL WORK revenue page is an observation-only control center, not a claim/submit UI', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const token of ['MEL WORK', 'id="refreshAll"', 'id="refreshPc"', 'id="taskList"', '/api/revenue/tasks', '/api/computer/v1/status', 'observation uniquement']) assert.ok(html.includes(token), `missing ${token}`);
  assert.match(html, /id="autonomyToggle" disabled/);
  assert.match(html, /taskmarket\.cmd/i, 'the local Taskmarket probe is described in the page');
  assert.doesNotMatch(html, /privateKey|seedPhrase|submitResult\(/i, 'the page must not expose signing secrets or submission actions');
});

test('revenue task normalizer accepts only valid open, unexpired paid tasks', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  const valid = { id: 'task-1', referenceCode: 'TSK-1', status: 'open', description: 'Normalize provided JSON.', reward: '1000000', mode: 'bounty', submissionCount: 3, expiryTime: '2026-10-17T12:00:00.000Z', platformFeeBps: 750 };
  const tasks = normalizeRevenueTasks({ data: { tasks: [valid, { ...valid, id: 'closed', status: 'closed' }, { ...valid, id: 'expired', expiryTime: '2026-10-15T12:00:00.000Z' }, { ...valid, id: 'free', reward: '0' }] } }, now);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'task-1');
  assert.equal(tasks[0].reward, '1000000');
  assert.equal(tasks[0].platformFeeBps, 750);
});

test('task normalizer supports CLI/API list envelope without inventing offer data', () => {
  const valid = { id: 'task-2', status: 'open', description: 'Process a public JSON dataset.', reward: '2500000', expiryTime: '2026-10-18T12:00:00.000Z' };
  const tasks = normalizeRevenueTasks({ tasks: [valid] }, Date.parse('2026-10-16T12:00:00.000Z'));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].reward, '2500000');
  assert.equal(tasks[0].referenceCode, '');
});
test('canonical MEL navigation and router expose MEL WORK without bypassing owner authentication', async () => {
  const [router, professor] = await Promise.all([
    readFile(new URL('../src/router.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8'),
  ]);
  assert.match(router, /url\.pathname === "\/revenus"/);
  assert.match(router, /handleRevenueApi\(request, env\)/);
  assert.match(professor, /href="\/revenus"[\s\S]{0,120}MEL WORK/);
  assert.match(router, /const auth = requireAuth\(request, env\);[\s\S]{0,120}handleRevenueApi\(request, env\)/);
});

test('Taskmarket PC probe is fixed/read-only, owner-authenticated, and accepts only a PC identity', async () => {
  const [api, companionApi, statuses, probe, asset, dist, page] = await Promise.all([
    readFile(new URL('../src/api/revenue-worker-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/devices/computer-command-status.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/devices/taskmarket-readonly-companion.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/revenue-interface.js', import.meta.url), 'utf8'),
  ]);
  assert.match(api, /requireAuth\(request, env\)/);
  assert.match(api, /action: 'taskmarket\.readonly\.probe'/);
  assert.match(companionApi, /"taskmarket\.readonly\.probe"/);
  assert.match(companionApi, /effectivePayload=taskmarketReadonlyPcCommand\(\)/);
  assert.match(companionApi, /import \{ COMPUTER_COMMAND_STATUS \} from \"\.\/computer-command-status\.js\"/);
  assert.match(companionApi, /COMPUTER_COMMAND_STATUS\.SUCCEEDED/);
  assert.match(companionApi, /COMPUTER_COMMAND_STATUS\.FAILED/);
  assert.match(statuses, /SUCCEEDED: \"SUCCEEDED\"/);
  assert.match(page, /import \{ COMPUTER_COMMAND_STATUS \} from \"\.\.\/devices\/computer-command-status\.js\"/);
  assert.match(page, /\$\{COMPUTER_COMMAND_STATUS\.SUCCEEDED\}/);
  assert.doesNotMatch(page, /command\.status==='SUCCESS'/, 'the page must not accept a non-canonical SUCCESS alias');
  assert.match(probe, /task list --status open --limit 20/);
  assert.match(probe, /mode='READ_ONLY'/);
  assert.doesNotMatch(probe, /task (claim|submit)|submitResult|privateKey|seedPhrase/i);
  const localProbeRoute = api.slice(api.indexOf("if (url.pathname === '/api/revenue/taskmarket-pc-status')"), api.indexOf("if (request.method !== 'GET')", api.indexOf("if (url.pathname === '/api/revenue/taskmarket-pc-status')")));
  assert.match(localProbeRoute, /computer_id: computerId/);
  assert.doesNotMatch(localProbeRoute, /body\.command|body\.payload|body\.script/);
  assert.equal(asset, dist, 'the distributed Companion script remains synchronized');
  assert.match(page, /id="scanPcTaskmarket"/);
  assert.match(page, /\/api\/revenue\/taskmarket-pc-status/);
  assert.match(page, /value\.action==='system\.exec'/);
  assert.match(page, /JSON\.parse\(String\(probe\.stdout\|\|''\)\)/);
  assert.match(page, /command\.status==='\$\{COMPUTER_COMMAND_STATUS\.SUCCEEDED\}'/);
  assert.match(page, /PC_TASKMARKET_PROBE_TIMEOUT/);
  assert.match(page, /PC_TASKMARKET_OUTPUT_JSON_INVALID/);
  assert.match(page, /attempt<30/);
  assert.match(page, /cli_available!==true/);
  assert.match(page, /list_available!==true/);
  assert.match(page, /last_seen_at/);
  assert.match(page, /palier 0 — lecture seule/);
});

test('MEL WORK creates a durable candidate-only preparation plan without executing or submitting a Taskmarket mission', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  const html = await response.text();
  assert.match(html, /data-create-work-plan/);
  assert.match(html, /work\.plan\.save/);
  assert.match(html, /work\.plan\.get/);
  assert.match(html, /CANDIDATE_ONLY/);
  assert.match(html, /OBSERVATION/);
  assert.match(html, /aucune mission n’a été réclamée ou soumise/i);
  assert.doesNotMatch(html, /task claim|task submit|submitResult\(/i, 'preparation must not expose external claim or submission operations');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const handler = script.slice(script.indexOf('async function createPersistentPrepPlan'), script.indexOf('async function refreshTasks'));
  assert.match(handler, /executeWorkCapability\('work\.plan\.save'/);
  assert.match(handler, /executeWorkCapability\('work\.plan\.get'/);
  assert.doesNotMatch(handler, /work\.plan\.materialize|work\.run|task\.claim|task\.submit/i, 'saving the plan must not materialize or execute its DAG');
});

test('MEL WORK generated browser JavaScript is syntactically valid', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'MEL WORK inline browser script is present');
  assert.doesNotThrow(() => new Function(script), 'MEL WORK browser script must parse');
});
