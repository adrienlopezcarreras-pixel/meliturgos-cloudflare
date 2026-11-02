import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { computeRoadmapTruth, classifyRoadmapItem, ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
import { MASTER_ROADMAP, flattenRoadmap } from '../src/roadmap/master-roadmap.js';

async function db() {
  const d = sqliteD1();
  await d.prepare('CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, action TEXT, details_json TEXT, created_at INTEGER)').run();
  await d.prepare('CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)').run();
  return d;
}
const now = Date.parse('2026-10-17T12:00:00Z');
async function exec(d, capability, status, ageMs = 3600_000, error = null, baseTime = now) {
  await d.prepare('INSERT INTO audit_logs(action,details_json,created_at) VALUES(?,?,?)').bind('capability_bus', JSON.stringify({ capability, status, error_code: error }), baseTime - ageMs).run();
}

test('roadmap status comes from real production executions, not from the declared label', async () => {
  const d = await db();
  await exec(d, 'code.read', 'SUCCEEDED');
  await exec(d, 'gmail.messages.search', 'SUCCEEDED');
  await exec(d, 'calendar.events.read', 'FAILED', 3600_000, 'GOOGLE_CALENDAR_REAUTH_REQUIRED');
  await exec(d, 'augmentio.fanout', 'FAILED', 3600_000, 'NO_ZERO_COST_PROVIDER_AVAILABLE');
  await exec(d, 'model.council', 'SUCCEEDED', 10 * 86_400_000); // older than 7 days: not a current proof
  await d.prepare('INSERT INTO computer_commands VALUES(?,?,?,?,?,?,?,?,?,?)').bind('c1', 'pc', 's', JSON.stringify({ steps: [{ action: 'cursor.move' }, { action: 'pointer.click' }] }), 'SUCCEEDED', now - 1000, null, now - 900, '{}', null).run();
  const truth = await computeRoadmapTruth(d, MASTER_ROADMAP, { now });
  assert.equal(truth.available, true);
  assert.equal(truth.total, flattenRoadmap().length);
  assert.equal(truth.items['MEL-CODE-01'].truth, 'VERIFIED_LIVE');
  assert.equal(truth.items['GEN2-33'].truth, 'PARTIAL_LIVE', 'Gmail works, calendar fails, tasks/drive never ran');
  assert.equal(truth.items['MEL-AUG-01'].truth, 'BROKEN');
  assert.equal(truth.items['MEL-AUG-01'].proofs[0].error, 'NO_ZERO_COST_PROVIDER_AVAILABLE');
  assert.equal(truth.items['GEN2-05'].truth, 'UNPROVEN', 'a 10-day-old success is not current proof');
  assert.equal(truth.items['GEN2-02'].truth, 'UNPROVEN', 'registered verifier without production run is not certification');
  assert.equal(truth.items['GEN2-30'].proofs.find(p => p.id === 'pointer.click').ok, 1, 'second step of a multi-step PC command counts');
  assert.ok(truth.verified_live_percent < 100, 'the real percentage is no longer 100 %');
  assert.equal(truth.counts.VERIFIED_LIVE + truth.counts.PARTIAL_LIVE + truth.counts.BROKEN + truth.counts.UNPROVEN + truth.counts.DECLARED, truth.total);
  d.close();
});

test('every proof source points to a real roadmap item', () => {
  const ids = new Set(flattenRoadmap().map(i => i.id));
  for (const id of Object.keys(ROADMAP_PROOF_SOURCES)) assert.ok(ids.has(id), id);
});

test('without a database the roadmap says so instead of inventing a status', async () => {
  assert.deepEqual(await computeRoadmapTruth(null, MASTER_ROADMAP), { available: false, reason: 'ROADMAP_TRUTH_DB_UNAVAILABLE' });
  const empty = classifyRoadmapItem('MEL-CODE-01', { capabilities: new Map(), computer: new Map() });
  assert.equal(empty.truth, 'UNPROVEN');
});

test('roadmap.read returns the real truth next to the declared roadmap', async () => {
  const { createDefaultCapabilityBus } = await import('../src/capabilities/default-bus.js');
  const d = await db();
  // Runtime bus uses the real clock; keep the fixture inside its proof window.
  await exec(d, 'code.read', 'SUCCEEDED', 60_000, null, Date.now());
  const bus = createDefaultCapabilityBus({ env: { DB: d } });
  const payload = await bus.execute('roadmap.read', {}, { owner: 'test', permissions: [] });
  assert.equal(payload.summary.complete, 133, 'historical certifications remain unchanged');
  assert.ok(payload.summary.percent_complete < 100, 'founder, manifesto, weekly audits and chat acceptance goals remain open');
  const founder = payload.phases.find(phase => phase.id === 'P16');
  const manifesto = payload.phases.find(phase => phase.id === 'P17');
  assert.equal(founder.items.length, 8);
  assert.equal(founder.items.some(item => item.status === 'DONE_VERIFIED'), false);
  assert.equal(manifesto.items.length, 10);
  assert.equal(manifesto.items.some(item => item.status === 'DONE_VERIFIED'), false);
  assert.equal(payload.truth.available, true);
  assert.equal(payload.truth.items['MEL-CODE-01'].truth, 'VERIFIED_LIVE');
  d.close();
});

// 30/10: FOUNDER-01 was delivered by MAX with a verified code receipt yet the
// roadmap kept « Déclaré, sans preuve »: only runtime capabilities were read.
test('a MAX-delivered objective with a verified acceptance receipt is proven; an unaccepted one is not', async () => {
  const { ROADMAP_CODE_CONTRACT_REVISION } = await import('../src/roadmap/roadmap-code-contracts.js');
  const d = await db();
  await d.prepare('CREATE TABLE dev_jobs(id TEXT PRIMARY KEY,status TEXT,requested_by TEXT,files_json TEXT,optional_context TEXT,result_json TEXT,updated_at INTEGER)').run();
  const sha = 'f'.repeat(40), branch = 'candidate/mel-clean-autonomy';
  const ci = { verified: true, workflow: 'full-candidate-ci', run_id: 41076058090, head_sha: sha, head_branch: branch, conclusion: 'success' };
  const contract = { code_paths: ['src/api/agent-tools.js', 'src/api/connected-data-intent.js', 'src/capabilities/google-workspace-capabilities.js'], test_paths: ['tests/native-chat-connected-replay.test.mjs'] };
  const result = {
    roadmap_code_acceptance: { schema: 'mel.roadmap-code-acceptance/v1', status: 'VERIFIED', roadmap_id: 'MEL-FOUNDER-01', contract_revision: ROADMAP_CODE_CONTRACT_REVISION,
      candidate_sha: sha, candidate_branch: branch, ci_run_id: ci.run_id, ...contract, verification: 'VERIFY_EXISTING', external_acceptance_verified: false },
    autonomy_completion: { status: 'VERIFIED', candidate_sha: sha, candidate_branch: branch, ci, mel_implementation: { verified: true, providers_attempted: 2 } },
    verify_existing: { status: 'VERIFIED', candidate_sha: sha },
  };
  const insert = (id, roadmapId, res) => d.prepare('INSERT INTO dev_jobs VALUES(?,?,?,?,?,?,?)').bind(id, 'COMPLETED', 'mel-autonomy', '[]',
    JSON.stringify({ roadmap_id: roadmapId, roadmap_contract_revision: ROADMAP_CODE_CONTRACT_REVISION }), JSON.stringify(res), now - 1000).run();
  await insert('founder-01', 'MEL-FOUNDER-01', result);
  // Same receipt, but the verification was never recorded: not accepted.
  await insert('founder-04', 'MEL-FOUNDER-04', { ...result, roadmap_code_acceptance: { ...result.roadmap_code_acceptance, roadmap_id: 'MEL-FOUNDER-04' }, verify_existing: { status: 'WAITING_VERIFICATION', candidate_sha: sha } });
  const phases = [{ items: [{ id: 'MEL-FOUNDER-01' }, { id: 'MEL-FOUNDER-04' }] }];
  const truth = await computeRoadmapTruth(d, phases, { now });
  assert.equal(truth.items['MEL-FOUNDER-01'].truth, 'VERIFIED_LIVE');
  assert.equal(truth.items['MEL-FOUNDER-01'].proofs[0].id, 'full-candidate-ci#41076058090');
  assert.notEqual(truth.items['MEL-FOUNDER-04'].truth, 'VERIFIED_LIVE');
  // An accepted CI receipt remains history after seven days, but is not
  // present-tense LIVE proof of the current deployment.
  await d.prepare('UPDATE dev_jobs SET updated_at = ? WHERE id = ?').bind(now - 8 * 86_400_000, 'founder-01').run();
  const expired = await computeRoadmapTruth(d, phases, { now });
  assert.notEqual(expired.items['MEL-FOUNDER-01'].truth, 'VERIFIED_LIVE');
});

// 01/11: 85 DONE_VERIFIED items had no proof source, so they read
// « Déclaré, sans preuve » for ever and MEL could not rely on them.
test('every proof source names a real roadmap item and real registered capabilities', async () => {
  const { ROADMAP_PROOF_SOURCES } = await import('../src/roadmap/roadmap-truth.js');
  const { flattenRoadmap } = await import('../src/roadmap/master-roadmap.js');
  const { readdir, readFile } = await import('node:fs/promises');
  const ids = new Set(flattenRoadmap().map(item => item.id));
  // Capabilities are registered across src/, not only in src/capabilities.
  const registered = new Set();
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = dir + '/' + entry.name;
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.name.endsWith('.js')) continue;
      for (const match of (await readFile(path, 'utf8')).matchAll(/id: *'([a-z][a-z0-9._-]+)'/g)) registered.add(match[1]);
    }
  };
  await walk('src');
  for (const [itemId, source] of Object.entries(ROADMAP_PROOF_SOURCES)) {
    assert.ok(ids.has(itemId), `${itemId} n'existe pas dans la feuille de route`);
    for (const capability of source.capabilities || []) {
      // An invented capability would be a proof that can never run: worse than no proof.
      assert.ok(registered.has(capability), `${itemId} cite une capacité inexistante : ${capability}`);
    }
  }
});

test('the roadmap items that still have no proof source are only the ones no capability can prove', async () => {
  const { ROADMAP_PROOF_SOURCES } = await import('../src/roadmap/roadmap-truth.js');
  const { flattenRoadmap } = await import('../src/roadmap/master-roadmap.js');
  const unproven = flattenRoadmap().filter(item => !ROADMAP_PROOF_SOURCES[item.id] && item.status === 'DONE_VERIFIED');
  // A ratchet: this count may go down as proofs are added, never silently up.
  assert.ok(unproven.length <= 24, `${unproven.length} items DONE_VERIFIED sans preuve (régression)`);
});

test('a newer execution failure revokes an older VERIFIED_LIVE proof',async()=>{
 const d=await db();
 await exec(d,'code.read','SUCCEEDED',3600_000);
 await exec(d,'code.read','FAILED',60000,'CODE_READ_RUNTIME_FAILURE');
 let truth=await computeRoadmapTruth(d,MASTER_ROADMAP,{now});
 assert.equal(truth.items['MEL-CODE-01'].truth,'BROKEN');
 await exec(d,'code.read','SUCCEEDED',1000);
 truth=await computeRoadmapTruth(d,MASTER_ROADMAP,{now});
 assert.equal(truth.items['MEL-CODE-01'].truth,'VERIFIED_LIVE');
 d.close();
});
