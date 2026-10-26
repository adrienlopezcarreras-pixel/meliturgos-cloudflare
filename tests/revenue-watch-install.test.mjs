import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { installAllRevenueSources, installRevenueSource, isUnsafeRevenueSource, runRevenueWatch } from '../src/revenue/revenue-watch.js';

async function seed(db, rows) {
  await db.prepare("CREATE TABLE IF NOT EXISTS revenue_watch (url TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'NEW')").run();
  for (const [url, title, status] of rows) await db.prepare('INSERT INTO revenue_watch VALUES (?,?,?,?,?)').bind(url, '2026-10-25', '2026-10-25', JSON.stringify({ url, title }), status).run();
}

test('speculative token or gift-card offers are never installed', () => {
  assert.equal(isUnsafeRevenueSource({ title: '[STEAM VAULT] Exchange 100,000 DOOM ($wDOOM) for a $10 Steam Digital Gift Card!' }), true);
  assert.equal(isUnsafeRevenueSource({ title: 'Service de nettoyage et normalisation de fichiers CSV/JSON' }), false);
  assert.equal(isUnsafeRevenueSource({ title: '[BOUNTY $75] TEMPLATE: CLAUDE.md for a Next.js + SQLite SaaS project' }), false);
  assert.equal(isUnsafeRevenueSource({ title: '[$35 BOUNTY] Add single-flight token refresh handling' }), false);
});

test('installing a source hands MAX one connector mission, once', async () => {
  const db = sqliteD1();
  await seed(db, [['https://a.example/csv', 'Nettoyage CSV', 'DISCOVERY_ONLY'], ['https://b.example/doom', 'Exchange 100,000 DOOM for a gift card', 'DISCOVERY_ONLY']]);
  const calls = [];
  const enqueue = async options => { calls.push(options); return { job_id: 'job-' + calls.length }; };
  const env = { DB: db };
  const first = await installRevenueSource(env, 'https://a.example/csv', { enqueue });
  assert.equal(first.status, 'INSTALL_QUEUED');
  assert.equal(calls[0].requestedBy, 'mel-autonomy');
  assert.equal(calls[0].source, 'revenue-watch');
  assert.match(calls[0].goal, /owner-requests/);
  assert.equal((await installRevenueSource(env, 'https://a.example/csv', { enqueue })).status, 'INSTALL_QUEUED');
  assert.equal(calls.length, 1, 'no duplicate mission');
  const all = await installAllRevenueSources(env, { enqueue });
  assert.equal(all.rejected, 1);
  assert.equal(calls.length, 1);
});

test('the nightly watch installs what it finds, bounded per run', async () => {
  const db = sqliteD1();
  const calls = [];
  const opportunities = Array.from({ length: 5 }, (_, i) => ({ url: 'https://github.com/o/r/issues/' + i, title: 'Bounty ' + i, automation: 'auto' }));
  const result = await runRevenueWatch({ DB: db }, { research: async () => ({ sources: [] }), githubDiscovery: async () => ({ opportunities }), install: async o => { calls.push(o); return { job_id: 'j' }; } });
  assert.equal(result.installs.length, 3);
  assert.equal(calls.length, 3);
});

test('WORK shows one "Tout installer" button and the install state', async () => {
  const page = await readFile('src/pages/revenue-interface.js', 'utf8');
  assert.match(page, /id="installAllRevenue"/);
  assert.match(page, /Installation par MAX/);
  assert.match(await readFile('src/api/revenue-worker-api.js', 'utf8'), /\/api\/revenue\/watch\/install/);
});
