import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseVerdict, decide, runCouncilReview, orderCouncilModels, freeCouncilCatalog } from '../src/evolution/council-review.js';

test('council verdicts and majority rule', async () => {
  assert.equal(parseVerdict('x {"verdict":"approve"} y').verdict, 'APPROVE');
  const A = { verdict: 'APPROVE' }, R = { verdict: 'REJECT' }, N = { verdict: null };
  assert.equal(decide([A, A, R, N]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([A, R, R, A]), 'REJECTED');
  assert.equal(decide([A, N, N, N]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
    { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', verdict: 'APPROVE' },
    { model: '@cf/nvidia/nemotron-3-120b-a12b', verdict: null, error: 'REVIEW_TIMEOUT' },
    { model: '@cf/google/gemma-4-26b-a4b-it', verdict: null, error: 'EMPTY' },
  ]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: 'a', verdict: 'APPROVE', summary: 'correct et testé' },
    { model: 'b', verdict: 'APPROVE', summary: 'pas de garde-fou retiré' },
    { model: 'c', verdict: 'APPROVE', summary: 'le changement est branché' },
    { model: 'd', verdict: null, error: 'REVIEW_TIMEOUT' },
  ]), 'APPROVED');
  assert.equal(decide([
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
  ]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: '@cf/openai/gpt-oss-120b', verdict: 'APPROVE' },
    { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', verdict: 'APPROVE' },
  ]), 'APPROVED');
  assert.equal(decide([
    { model: 'a', verdict: 'APPROVE', summary: '' },
    { model: 'b', verdict: 'APPROVE', summary: '   ' },
  ]), 'INSUFFICIENT_REVIEWERS');
  assert.equal(decide([
    { model: 'a', verdict: 'APPROVE', summary: 'le diff est testé' },
    { model: 'b', verdict: 'APPROVE', summary: 'pas de garde-fou retiré' },
  ]), 'APPROVED');
  const env = { AI: { async run(m) { return { response: m.includes('gemma') ? 'oops' : '{"verdict":"REJECT","blocking":["import inexistant"]}' }; } } };
  assert.equal((await runCouncilReview(env, { diff: '+x' })).decision, 'REJECTED');
  const wf = await readFile(new URL('../.github/workflows/mel-candidate-promotion.yml', import.meta.url), 'utf8');
  assert.ok(wf.indexOf('/api/internal/council-review') > 0 && wf.lastIndexOf('"$CAND:refs/heads/main"') > wf.indexOf('/api/internal/council-review'));
  // The only push before the Council is the no-content fast-forward (empty diff).
  const early = wf.indexOf('"$CAND:refs/heads/main"');
  assert.ok(early === wf.lastIndexOf('"$CAND:refs/heads/main"') || wf.lastIndexOf('git diff --quiet "$MAIN" "$CAND"', early) > wf.lastIndexOf('fi', early - 200));
  assert.match(wf, /DECISION" != "APPROVED"/);
});

test('a recent failure is asked again only after the models that still answer', () => {
  const ids = ['@cf/openai/gpt-oss-120b', '@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/zai-org/glm-4.7-flash'];
  const now = 1_000_000;
  const cooling = orderCouncilModels(ids, { '@cf/openai/gpt-oss-120b': { ok: false, at: now - 60_000 } }, now);
  assert.equal(cooling[0], '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.equal(cooling.at(-1), '@cf/openai/gpt-oss-120b');
  const refreshed = orderCouncilModels(ids, { '@cf/openai/gpt-oss-120b': { ok: false, at: now - 21 * 60 * 1000 } }, now);
  assert.equal(refreshed[0], '@cf/openai/gpt-oss-120b');
  assert.ok(freeCouncilCatalog({}).includes('@cf/zai-org/glm-4.7-flash'));
});

test('silent free models are replaced until three real answers exist', async () => {
  const called = [];
  const env = { AI: { async run(model) {
    called.push(model);
    if (String(model).includes('gpt-oss') || String(model).includes('nemotron')) throw new Error('DOWN');
    return { response: '{"verdict":"APPROVE","summary":"changement testé et branché"}' };
  } } };
  const result = await runCouncilReview(env, { diff: '+x' });
  assert.equal(result.decision, 'APPROVED');
  assert.ok(called.includes('@cf/zai-org/glm-4.7-flash'));
  assert.equal(result.reviews.filter(review => review.verdict === 'APPROVE').length, 3);
  assert.ok(result.reviews.some(review => review.error === 'DOWN'));
});

test('online models first; after 10 short reviews the PC alone, then the owner', async () => {
  const { PC_AFTER_ATTEMPTS, approveCouncilReviewByOwner } = await import('../src/evolution/council-review.js');
  const down = { MEL_COMPANION_FALLBACK_ALLOWED: 'true', AI: { async run() { throw new Error('MODEL_UNAVAILABLE'); } } };
  const asked = [];
  const pc = async () => ({ async invoke({ input }) { asked.push(input); return { text: '{"verdict":"APPROVE","summary":"relu sur le PC, correct et testé"}' }; } });
  assert.equal((await runCouncilReview(down, { diff: '+x', attempts: 0, companion: pc })).decision, 'INSUFFICIENT_REVIEWERS');
  assert.equal(asked.length, 0, 'the PC is not asked before 10 attempts');
  const last = await runCouncilReview(down, { diff: '+x'.repeat(30_000), attempts: PC_AFTER_ATTEMPTS - 1, companion: pc });
  assert.equal(last.decision, 'OWNER_APPROVAL_REQUIRED');
  assert.ok(asked[0].length <= 12_000, 'the Companion refuses messages above 12 000 chars');
  assert.equal((await runCouncilReview(down, { diff: '+x', attempts: 20, companion: async () => null })).decision, 'COUNCIL_UNAVAILABLE');
  const reject = async () => ({ async invoke() { return { text: '{"verdict":"REJECT","blocking":["non testé"]}' }; } });
  assert.equal((await runCouncilReview(down, { diff: '+x', attempts: 20, companion: reject })).decision, 'REJECTED');

  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  try {
    await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
    const key = 'council-review:' + 'a'.repeat(40);
    await DB.prepare('INSERT INTO dev_bridge_state VALUES(?,?,?,?)').bind(key, 1, 'OWNER_APPROVAL_REQUIRED', JSON.stringify({ decision: 'OWNER_APPROVAL_REQUIRED', head: 'a'.repeat(40), jobs: ['j'] })).run();
    assert.equal((await approveCouncilReviewByOwner({ DB }, key)).ok, true);
    const row = await DB.prepare('SELECT status FROM dev_bridge_state WHERE bridge_id=?').bind(key).first();
    assert.equal(row.status, 'APPROVED');
    assert.equal((await approveCouncilReviewByOwner({ DB }, key)).code, 'COUNCIL_OWNER_APPROVAL_NOT_PENDING', 'only a pending PC approval can be validated');
  } finally { DB.close(); }
});

test('VERIFY_EXISTING reviewers get evidence instructions, not code-diff instructions', async () => {
  const { reviewVerificationEvidence, VERIFY_SYSTEM } = await import('../src/evolution/council-review.js');
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  try {
    await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
    const seen = [];
    const review = async (_env, input) => { seen.push(input.system); return { decision: 'APPROVED', reviews: [] }; };
    await reviewVerificationEvidence({ DB }, { job: { id: 'j', goal: 'g' }, implementation: { candidate_sha: 'a'.repeat(40), selected: { text: 'DECISION: VERIFY_EXISTING' } }, ciRunId: 1, liveChecks: [], review });
    assert.equal(seen[0], VERIFY_SYSTEM);
    assert.match(VERIFY_SYSTEM, /Ne rejette jamais pour absence de modification de code/);
    assert.match(VERIFY_SYSTEM, /EXCEPTION STRICTE MEL-FOUNDER-01/);
    assert.match(VERIFY_SYSTEM, /AUTH_REQUIRED n’est donc PAS une lecture réussie/);
    assert.match(VERIFY_SYSTEM, /erreurs réseau, permission ou fournisseur génériques restent insuffisantes/);
    const asked = [];
    const env = { AI: { async run(_m, { messages }) { asked.push(messages[0].content); return { response: '{"verdict":"APPROVE","summary":"preuves suffisantes"}' }; } } };
    const { runCouncilReview } = await import('../src/evolution/council-review.js');
    await runCouncilReview(env, { diff: 'preuves', system: VERIFY_SYSTEM, companion: null });
    assert.ok(asked.length && asked.every(text => text === VERIFY_SYSTEM));
  } finally { DB.close(); }
});

test('a Council rejection repairs only the packages whose files are in the reviewed diff', async () => {
  const { councilRejectionCulprits } = await import('../src/evolution/council-review.js');
  const diff = 'diff --git a/src/evolution/autonomy-supervisor.js b/src/evolution/autonomy-supervisor.js\n+x\n';
  const culprits = councilRejectionCulprits(diff, {
    'manifest-06': [{ path: 'src/evolution/autonomy-supervisor.js' }],
    'manifest-01-older-same-file': [{ path: 'src/evolution/autonomy-supervisor.js' }],
    'manifest-04-reverted': [{ path: 'src/core/orchestrator/gen2-runtime.js' }],
    'no-files': [],
  });
  assert.deepEqual([...culprits], ['manifest-06']);
});


test('VERIFY_EXISTING rejection persists exact CI and live checks without changing FAILED verdict', async () => {
  const { reviewVerificationEvidence } = await import('../src/evolution/council-review.js');
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  try {
    await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
    await DB.prepare('CREATE TABLE dev_jobs(id TEXT PRIMARY KEY, status TEXT, result_json TEXT, error TEXT, updated_at INTEGER)').run();
    await DB.prepare('INSERT INTO dev_jobs(id,status,result_json,updated_at) VALUES(?,?,?,?)')
      .bind('founder-evidence', 'TEACHER_APPROVED', JSON.stringify({ verify_existing: { code: 'FULL_CANDIDATE_CI_REQUIRED', live_checks: [], ci_run_id: null } }), 1).run();
    const checks = [{ capability: 'gmail.messages.search', ok: true, outcome: 'READ_SUCCEEDED', items: 1 }];
    const result = await reviewVerificationEvidence({ DB }, {
      job: { id: 'founder-evidence', goal: 'Gmail' },
      implementation: { candidate_sha: 'a'.repeat(40), selected: { text: 'DECISION: VERIFY_EXISTING' } },
      ciRunId: 12345, liveChecks: checks,
      review: async () => ({ decision: 'REJECTED', reviews: [{ model: 'reviewer', verdict: 'REJECT', blocking: ['auth errors not proven'] }] }),
    });
    assert.equal(result.decision, 'REJECTED');
    const row = await DB.prepare('SELECT status,result_json FROM dev_jobs WHERE id=?').bind('founder-evidence').first();
    assert.equal(row.status, 'FAILED');
    const journal = JSON.parse(row.result_json);
    assert.equal(journal.verify_existing.ci_run_id, 12345);
    assert.deepEqual(journal.verify_existing.live_checks, checks);
    assert.equal(journal.verify_existing.code, 'COUNCIL_REJECTED_VERIFY_EXISTING');
    assert.equal(journal.council_review.decision, 'REJECTED');
  } finally { DB.close(); }
});


test('VERIFY_EXISTING never reuses Council approval across another CI run or live proof', async () => {
  const { reviewVerificationEvidence } = await import('../src/evolution/council-review.js');
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  try {
    await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY, last_seen INTEGER, status TEXT, metadata_json TEXT)').run();
    let calls = 0;
    const review = async () => { calls++; return { decision:'APPROVED', reviews:[] }; };
    const base = { job:{id:'fresh-evidence',goal:'Gmail'}, implementation:{candidate_sha:'a'.repeat(40),selected:{text:'DECISION: VERIFY_EXISTING'}} };
    const a = [{capability:'gmail.messages.search',ok:true,outcome:'READ_SUCCEEDED'}];
    const b = [{capability:'gmail.messages.search',ok:false,outcome:'AUTH_REQUIRED',code:'GMAIL_AUTH_REQUIRED'}];
    await reviewVerificationEvidence({DB},{...base,ciRunId:111,liveChecks:a,review});
    const cache = await reviewVerificationEvidence({DB},{...base,ciRunId:111,liveChecks:a,review});
    assert.equal(cache.cached,true);
    assert.equal(calls,1);
    await reviewVerificationEvidence({DB},{...base,ciRunId:222,liveChecks:a,review});
    await reviewVerificationEvidence({DB},{...base,ciRunId:222,liveChecks:b,review});
    assert.equal(calls,3,'new run or changed checks always trigger a fresh review');
  } finally { DB.close(); }
});


test('FOUNDER Council is not invoked without verified runner evidence', async () => {
  const { reviewVerificationEvidence } = await import('../src/evolution/council-review.js');
  let called = 0;
  const result = await reviewVerificationEvidence({ DB: { prepare() { throw Error('DB_MUST_NOT_BE_CALLED'); } } }, {
    job: { id:'founder-missing', goal:'[MEL-FOUNDER-01] Connected chat proof' },
    implementation: { candidate_sha:'a'.repeat(40) }, ciRunId: 123, liveChecks:[],
    review: async () => { called++; return { decision:'APPROVED', reviews:[] }; },
  });
  assert.equal(result.decision, 'MISSION_TEST_EVIDENCE_REQUIRED');
  assert.equal(called,0);
});
