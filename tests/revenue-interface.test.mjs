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
  assert.doesNotMatch(html, /taskmarket\.cmd|privateKey|seedPhrase|submitResult\(/i);
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

test('Companion Taskmarket probe is fixed/read-only and distributed source matches', async () => {
  const [api, asset, dist, page] = await Promise.all([
    readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/revenue-interface.js', import.meta.url), 'utf8'),
  ]);
  assert.match(api, /"taskmarket\.status"/);
  assert.match(asset, /function PcControl-TaskmarketStatus/);
  assert.match(asset, /task list --status open --limit 20/);
  assert.match(asset, /"taskmarket\.status" \{ return PcControl-TaskmarketStatus \}/);
  assert.doesNotMatch(asset.slice(asset.indexOf('function PcControl-TaskmarketStatus'), asset.indexOf('function PcControl-SystemInfo')), /task claim|task submit|wallet|private key/i);
  assert.equal(asset, dist, 'the distributed Companion script must match its source');
  assert.match(page, /id="scanPcTaskmarket"/);
  assert.match(page, /action:'taskmarket\.status'/);
});
