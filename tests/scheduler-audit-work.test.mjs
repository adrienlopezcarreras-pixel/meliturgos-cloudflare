import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isDedicatedWorkMinute, runScheduledMelWork } from '../src/revenue/work-schedule.js';

test('the daily trigger runs the backup and still reaches the daily, weekly and monthly self-audit', async () => {
  const entry = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
  const daily = entry.slice(entry.indexOf("if (cron === '43 2 * * *')"), entry.indexOf("await app.scheduled(controller, env, ctx);\n    if (cron !== '17 * * * *')"));
  assert.match(daily, /runScheduledSystemBackup/);
  assert.doesNotMatch(daily, /return;/);
});

test('a WORK cycle runs in its own minute invocation, never in the crowded hourly batch', async () => {
  assert.equal(isDedicatedWorkMinute(new Date('2026-10-24T06:29:00Z')), true);
  assert.equal(isDedicatedWorkMinute(new Date('2026-10-24T06:17:00Z')), false);
  assert.equal(isDedicatedWorkMinute(new Date('2026-10-24T07:29:00Z')), false);
  let ran = 0;
  const db = { prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => ({ n: 0 }), all: async () => ({ results: [] }) }), run: async () => ({}), all: async () => ({ results: [] }) }) };
  const env = { DB: db, AI: { run: async () => null } };
  const out = await runScheduledMelWork(env, { now: new Date('2026-10-24T06:17:00Z'), startCycle: false, run: async () => { ran += 1; return new Response(''); } });
  assert.equal(out.status, 'HOUSEKEEPING_ONLY');
  assert.equal(ran, 0);
  const index = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(index, /runScheduledMelWork\(env, \{ startCycle: false \}\)/);
  assert.match(index, /isDedicatedWorkMinute\(new Date\(Number\(controller\?\.scheduledTime\) \|\| Date\.now\(\)\)\)/);
});
