import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDevelopment, excludedCodeModels, probeCodeModels, persistWeeklyDevelopmentAudit } from '../src/diagnostics/development-audit.js';
import { standardRegistry } from '../src/models/ModelRegistry.js';
import { createDefaultAugmentioPool } from '../src/augmentio/default-pool.js';

const NOW = Date.parse('2026-10-24T10:00:00Z');
const job = (over) => ({ requested_by: 'mel-autonomy', updated_at: NOW - 3600_000, status: 'QUEUED', ...over });
const council = (selected) => ({ result_json: { bridge_preparation: { mentor: { council: { providers_attempted: [selected], selected_provider: selected, rejected_proposals: [] } } } } });

test('the weekly audit flags code written by a generalist model and a week without delivery', () => {
  const report = auditDevelopment({ now: NOW, jobs: [job(council('workers-ai:@cf/meta/llama-3.3-70b-instruct-fp8-fast'))] });
  const codes = report.findings.map(f => f.code);
  assert.equal(report.ok, false);
  assert.ok(codes.includes('MENTOR_CODED_WITH_NON_CODE_MODEL'));
  assert.ok(codes.includes('NO_DELIVERY_THIS_WEEK'));
});

test('a code model missing from the zero-cost proof is reported, not silently dropped', t => {
  const saved = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  t.after(() => { if (saved !== undefined) process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = saved; });
  assert.ok(excludedCodeModels({}).includes('@cf/qwen/qwen2.5-coder-32b-instruct'));
  const report = auditDevelopment({ now: NOW, jobs: [] });
  assert.ok(report.findings.some(f => f.code === 'CODE_MODEL_EXCLUDED_BY_ZERO_COST_PROOF'));
});

test('a mission retried four times in a week is a loop', () => {
  const jobs = Array.from({ length: 4 }, () => job({ status: 'FAILED', optional_context: { roadmap_id: 'MEL-X' } }));
  assert.ok(auditDevelopment({ now: NOW, jobs }).findings.some(f => f.code === 'MISSION_LOOP' && f.detail.includes('MEL-X ×4')));
});

test('each code model is really tested on a small exercise', async () => {
  const env = { AI: { async run(model) {
    if (model.includes('gpt-oss-120b')) return { response: 'pas de code' };
    return { response: '```js\nfunction sumEven(list){return list.filter(n=>n%2===0).reduce((a,b)=>a+b,0)}\n```' };
  } } };
  const probes = await probeCodeModels(env);
  assert.equal(probes.length, 2);
  assert.equal(probes.find(p => p.model.includes('gpt-oss-120b')).passed, false);
  assert.ok(probes.filter(p => !p.model.includes('gpt-oss-120b')).every(p => p.passed));
  const report = auditDevelopment({ now: NOW, jobs: [], probes });
  assert.ok(report.findings.some(f => f.code === 'CODE_MODEL_PROBE_FAILED' && f.detail.includes('gpt-oss-120b')));
});

test('MAX codes only with code models: small ones first, large ones after three failures', () => {
  const pool = createDefaultAugmentioPool({ AI: { run: async () => null } });
  const specialists = pool.list({ capability: 'CODE_SPECIALIST' }).map(p => p.modelId);
  assert.deepEqual(specialists, ['@cf/qwen/qwen2.5-coder-32b-instruct', '@cf/openai/gpt-oss-120b']);
  assert.ok(!specialists.includes('@cf/moonshotai/kimi-k2.7-code'));
  // The small code model never sits in the general Council; gpt-oss-120b is
  // both a general reviewer and the large free code model (GLM-5.3 Flash is paid).
  assert.ok(!pool.list({ capability: 'GENERAL' }).some(p => p.modelId === '@cf/qwen/qwen2.5-coder-32b-instruct'));
  assert.ok(!specialists.includes('@cf/zai-org/glm-5.3-flash'));
  assert.ok(standardRegistry.list().filter(m => (m.capabilities || []).includes('CODE_LARGE')).length === 1);
});

test('verified terminal statuses are counted as deliveries while queued work is not', () => {
  for (const status of ['COMPLETED', 'DONE', 'DONE_VERIFIED', 'VERIFIED', 'ACCEPTED']) {
    const report = auditDevelopment({ now: NOW, jobs: [job({ status })] });
    assert.equal(report.summary.completed, 1, status);
    assert.ok(!report.findings.some(f => f.code === 'NO_DELIVERY_THIS_WEEK'), status);
  }
  const queued = auditDevelopment({ now: NOW, jobs: [job({ status: 'QUEUED' })] });
  assert.equal(queued.summary.completed, 0);
  assert.ok(queued.findings.some(f => f.code === 'NO_DELIVERY_THIS_WEEK'));
});

test('a successful code-model probe cancels its pending timeout', async t => {
  const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout, handles = [];
  globalThis.setTimeout = (callback, delay) => {
    const handle = { callback, delay, cleared: false };
    handles.push(handle);
    return handle;
  };
  globalThis.clearTimeout = handle => { handle.cleared = true; };
  t.after(() => { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; });
  const registry = { list: () => [{ id: 'test-coder', capabilities: ['CODE_SPECIALIST'] }] };
  const result = await probeCodeModels({
    AI: { run: async () => ({ response: 'function sumEven(list) { return list.filter(n => n % 2 === 0).reduce((a, n) => a + n, 0); }' }) }
  }, { registry, timeoutMs: 250 });
  assert.equal(result[0].passed, true);
  assert.equal(handles.length, 1);
  assert.equal(handles[0].cleared, true);
});

test('a timed-out code-model probe fails and clears its timer', async t => {
  const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout, handles = [];
  globalThis.setTimeout = (callback, delay) => {
    const handle = { callback, delay, cleared: false };
    handles.push(handle);
    queueMicrotask(callback);
    return handle;
  };
  globalThis.clearTimeout = handle => { handle.cleared = true; };
  t.after(() => { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; });
  const registry = { list: () => [{ id: 'unresponsive-coder', capabilities: ['CODE_SPECIALIST'] }] };
  const result = await probeCodeModels({
    AI: { run: () => new Promise(() => {}) }
  }, { registry, timeoutMs: 250 });
  assert.equal(result.length, 1);
  assert.equal(result[0].passed, false);
  assert.equal(result[0].error, 'PROBE_TIMEOUT');
  assert.equal(handles.length, 1);
  assert.equal(handles[0].cleared, true);
});

test('MEL-AUDIT-02 records a durable weekly report and deduplicated findings without dispatching a repair', async t => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const db = sqliteD1();
  t.after(() => db.close());
  const rows = [
    job({ id: 'delivered', status: 'COMPLETED', optional_context: { roadmap_id: 'MEL-A' } }),
    job({ id: 'blocked', status: 'WAITING_DEPENDENCY', optional_context: { roadmap_id: 'MEL-B' } }),
    ...Array.from({ length: 4 }, (_, i) => job({ id: 'retry-' + i, status: 'FAILED', optional_context: { roadmap_id: 'MEL-C' } })),
  ];
  const report = auditDevelopment({ now: NOW, jobs: [...rows, rows[0]] });
  assert.equal(report.summary.jobs, 6, 'a duplicated snapshot must not count as another attempt');
  assert.equal(report.summary.completed, 1);
  assert.equal(report.summary.blocked, 1);
  assert.equal(report.summary.repeated_objectives, 1);
  assert.ok(report.findings.some(f => f.code === 'MISSION_LOOP'));
  assert.equal(report.findings.some(f => f.code === 'NO_DELIVERY_THIS_WEEK'), false);
  const repeat = { ...report, findings: [...report.findings, report.findings[0]] };
  const first = await persistWeeklyDevelopmentAudit(db, repeat, { now: NOW });
  const second = await persistWeeklyDevelopmentAudit(db, repeat, { now: NOW + 3000 });
  assert.equal(first.persisted, true);
  assert.equal(first.week_start, second.week_start);
  const saved = await db.prepare('SELECT report_json FROM mel_development_audit_reports').all();
  assert.equal(saved.results.length, 1);
  assert.equal(JSON.parse(saved.results[0].report_json).summary.blocked, 1);
  const findings = await db.prepare('SELECT code,detail FROM mel_development_audit_findings').all();
  assert.equal(findings.results.length, new Set(report.findings.map(f => JSON.stringify([f.code, f.detail]))).size);
  const jobs = await db.prepare('SELECT COUNT(*) AS total FROM dev_jobs').first().catch(() => ({ total: 0 }));
  assert.equal(Number(jobs?.total || 0), 0, 'recording audit evidence must not enqueue jobs');
});

// MEL-AUDIT-06: catalog diff → idempotent benchmark proposals.
test('a new free Workers AI model yields one idempotent benchmark proposal; paid, deprecated, registered or measured models are excluded', async () => {
  const { benchmarkProposals } = await import('../scripts/workers-ai-catalog-diff.mjs');
  const { standardRegistry } = await import('../src/models/ModelRegistry.js');
  const registered = standardRegistry.list().map(model => model.id);
  const text = { name: 'Text Generation' };
  const catalog = { result: [
    { name: '@cf/new/free-coder', task: text, properties: [] },
    { name: '@cf/new/free-coder', task: text, properties: [] },
    { name: '@cf/new/paid-model', task: text, properties: [{ property_id: 'price', value: [{ unit: 'per M input tokens', price: 0.5 }] }] },
    { name: '@cf/old/gone', task: text, properties: [{ property_id: 'planned_deprecation_date', value: '2026-01-01' }] },
    { name: '@cf/new/already-measured', task: text, properties: [] },
    { name: registered[0], task: text, properties: [] },
    { name: '@cf/new/embedder', task: { name: 'Text Embeddings' }, properties: [] },
  ] };
  const options = { registered, measured: ['@cf/new/already-measured'] };
  const first = benchmarkProposals(catalog, options);
  assert.deepEqual(first, [{ id: 'benchmark:@cf/new/free-coder', kind: 'BENCHMARK_PROPOSAL', model: '@cf/new/free-coder', status: 'PROPOSED' }]);
  assert.deepEqual(benchmarkProposals(catalog, options), first, 'same catalog, same proposals');
});

test('MEL-AUDIT-02 refresh removes stale findings without creating a new mission', async t => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const db = sqliteD1();
  t.after(() => db.close());
  const first = { findings: [{ code: 'MISSION_LOOP', detail: 'MEL-AUDIT-02 x6' }, { code: 'JOBS_STALLED', detail: 'historical' }], summary: { state: 'unresolved' } };
  const second = { findings: [{ code: 'REPAIR_VERIFIED', detail: 'MEL-AUDIT-02' }, { code: 'REPAIR_VERIFIED', detail: 'MEL-AUDIT-02' }], summary: { state: 'resolved' } };
  const a = await persistWeeklyDevelopmentAudit(db, first, { now: NOW });
  const b = await persistWeeklyDevelopmentAudit(db, second, { now: NOW + 1000 });
  assert.equal(a.week_start, b.week_start);
  assert.equal(b.findings_recorded, 1);
  const findings = await db.prepare('SELECT code,detail FROM mel_development_audit_findings ORDER BY code').all();
  assert.deepEqual(findings.results.map(row => ({ ...row })), [{ code: 'REPAIR_VERIFIED', detail: 'MEL-AUDIT-02' }]);
  const report = await db.prepare('SELECT report_json FROM mel_development_audit_reports').first();
  assert.equal(JSON.parse(report.report_json).summary.state, 'resolved');
  await persistWeeklyDevelopmentAudit(db, { ...second, findings: [] }, { now: NOW + 2000 });
  assert.equal((await db.prepare('SELECT code FROM mel_development_audit_findings').all()).results.length, 0);
  const stored = await db.prepare('SELECT COUNT(*) AS count FROM mel_development_audit_reports').first();
  assert.equal(stored.count, 1);
});
