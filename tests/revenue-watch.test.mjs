import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runRevenueWatch, readRevenueWatch, parseOpportunities } from '../src/revenue/revenue-watch.js';
import { handleRevenueApi } from '../src/api/revenue-worker-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const reply = list => ({ response: 'Voici : ' + JSON.stringify({ opportunities: list }) });
const opp = (name, url, score = 70) => ({ name, url, type: 'bounty', how_mel_earns: 'résout des tickets', automation: 'semi', requirements: 'compte GitHub', risk: 'faible', score });

test('opportunities need a name and an https URL; fields are bounded', () => {
  const parsed = parseOpportunities(JSON.stringify({ opportunities: [opp('A', 'https://a.dev'), { name: 'no url' }, opp('B', 'javascript:alert(1)'), { ...opp('C', 'https://c.dev'), automation: 'weird', score: 500 }] }));
  assert.deepEqual(parsed.map(o => o.name), ['A', 'C']);
  assert.equal(parsed[1].automation, 'manuel');
  assert.equal(parsed[1].score, 100);
});

test('nightly watch researches rotating themes, stores opportunities and flags only new ones', async () => {
  const db = sqliteD1();
  const queries = [];
  const research = async query => { queries.push(query); return { summary: 'résumé ' + query, sources: [{ title: 't', url: 'https://src.dev' }] }; };
  let call = 0;
  const env = { DB: db, AI: { async run() { call += 1; return reply(call === 1 ? [opp('Algora', 'https://algora.io')] : [opp('Algora', 'https://algora.io'), opp('X402 list', 'https://x402-list.com', 80)]); } } };
  const first = await runRevenueWatch(env, { now: new Date('2026-10-17T02:43:00Z'), research });
  assert.equal(first.new, 1);
  assert.equal(queries.length, 2);
  const second = await runRevenueWatch(env, { now: new Date('2026-10-18T02:43:00Z'), research });
  assert.deepEqual([second.found, second.new], [2, 1]);
  const list = await readRevenueWatch(db);
  assert.equal(list.length, 2);
  assert.equal(list.find(o => o.name === 'Algora').first_seen, '2026-10-17');
});

test('owner-only API returns the watch; the daily cron runs it', async () => {
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test', DB: sqliteD1() };
  assert.notEqual((await handleRevenueApi(new Request('https://mel.test/api/revenue/watch'), env)).status, 200);
  const res = await handleRevenueApi(new Request('https://mel.test/api/revenue/watch', { headers: { authorization: 'Basic ' + Buffer.from('adrien:test').toString('base64') } }), env);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).opportunities, []);
  const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const i = source.indexOf('const tasks = dailySelfAuditCron');
  assert.ok(source.indexOf('runRevenueWatch(env)', i) > i);
});
