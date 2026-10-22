import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runRevenueWatch, readRevenueWatch, parseOpportunities } from '../src/revenue/revenue-watch.js';
import { handleRevenueApi } from '../src/api/revenue-worker-api.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const freeProof = () => ({ MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: {
  schema: 'mel.workers-ai.zero-cost-proof/v1', provider: 'workers-ai', account_plan: 'WORKERS_FREE',
  billing_path: 'direct-workers-ai-binding', pricing_policy: 'cloudflare-workers-ai-pricing-2026-10-01',
  free_allocation_neurons_per_day: 10000, free_overage_behavior: 'FAIL_NOT_BILL',
  plan_evidence: { source: 'cloudflare-account-entitlements-api', account_type: 'standard', entitlement_key: 'workers.static_assets.manifest_limit_file_count', entitlement_value: 20000, workers_free_reference_value: 20000 },
  models: ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast'],
  verified_at: new Date(Date.now()-1000).toISOString(), expires_at: new Date(Date.now()+60000).toISOString(),
} });

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
  const research = async query => { queries.push(query); return { summary: 'résumé ' + query, sources: [{ title: 'Algora', url: 'https://algora.io' }, { title: 'X402', url: 'https://x402-list.com' }] }; };
  let call = 0;
  const env = { ...freeProof(), DB: db, AI: { async run() { call += 1; return reply(call === 1 ? [opp('Algora', 'https://algora.io')] : [opp('Algora', 'https://algora.io'), opp('X402 list', 'https://x402-list.com', 80)]); } } };
  const first = await runRevenueWatch(env, { now: new Date('2026-10-17T02:43:00Z'), research, githubDiscovery: async () => ({ opportunities: [], errors: [] }) });
  assert.equal(first.new, 1);
  assert.equal(queries.length, 6);
  assert.equal(new Set(queries).size, 6);
  const second = await runRevenueWatch(env, { now: new Date('2026-10-18T02:43:00Z'), research, githubDiscovery: async () => ({ opportunities: [], errors: [] }) });
  assert.deepEqual([second.found, second.new], [2, 1]);
  const list = await readRevenueWatch(db);
  assert.equal(list.length, 2);
  assert.equal(list.find(o => o.name === 'Algora').first_seen, '2026-10-17');
  assert.ok(list.every(o => o.status === 'DISCOVERY_ONLY' && o.execution_eligible === false && o.paid === false));
  db.close();
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

test('only a real research citation can authorize a lead, never a link invented in the summary', async () => {
  const db = sqliteD1();
  try {
    const env = { ...freeProof(), DB: db, AI: { async run() { return reply([opp('Cited', 'https://cited.example/task'), opp('Invented', 'https://invented.example/task')]); } } };
    const result = await runRevenueWatch(env, {
      research: async () => ({ summary: 'Unverified suggestion https://invented.example/task', sources: [{ url: 'https://cited.example/task' }] }),
      githubDiscovery: async () => ({ opportunities: [], errors: [] }),
    });
    assert.equal(result.found, 1);
    assert.deepEqual((await readRevenueWatch(db)).map(o => o.url), ['https://cited.example/task']);
  } finally { db.close(); }
});

test('model outage does not invent web work or discard independently discovered GitHub leads', async () => {
  const db = sqliteD1();
  try {
    const env = { ...freeProof(), DB: db, AI: { async run() { throw new Error('provider unavailable'); } } };
    const result = await runRevenueWatch(env, {
      research: async () => ({ summary: '', sources: [] }),
      githubDiscovery: async () => ({ opportunities: [{ ...opp('Funded lead', 'https://github.com/acme/project/issues/7'), provider: 'github' }], errors: [] }),
    });
    assert.equal(result.found, 1);
    const [lead] = await readRevenueWatch(db);
    assert.equal(lead.status, 'DISCOVERY_ONLY');
    assert.equal(lead.execution_eligible, false);
    assert.equal(lead.payment_verified, false);
    assert.equal(lead.paid, false);
  } finally { db.close(); }
});

test('unproved AI is never called and independent source discovery remains available', async () => {
  const db = sqliteD1();
  try {
    let invoked = 0;
    const result = await runRevenueWatch({ DB: db, AI: { async run() { invoked++; throw new Error('must not bill'); } } }, {
      research: async () => ({ summary: '', sources: [] }),
      githubDiscovery: async () => ({ opportunities: [opp('Verified listing only', 'https://github.com/acme/project/issues/8')], errors: [] }),
    });
    assert.equal(invoked, 0);
    assert.equal(result.found, 1);
    assert.equal((await readRevenueWatch(db))[0].execution_eligible, false);
  } finally { db.close(); }
});
