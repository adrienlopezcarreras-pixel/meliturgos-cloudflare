import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRoadmap, validateRoadmap } from '../src/roadmap/master-roadmap.js';
import { ROADMAP_RETIRED_IDS, ROADMAP_CODE_CONTRACTS, roadmapContractRevision, assertRoadmapCodeChanges } from '../src/roadmap/roadmap-code-contracts.js';
import { refreshRoadmapCodeMissions } from '../src/evolution/roadmap-code-missions.js';
import { AutonomySupervisor, selectActionableAutonomyJobs } from '../src/evolution/autonomy-supervisor.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const rows = flattenRoadmap();
test('retired objectives have one live replacement and cannot re-enter an otherwise finished queue', () => {
  assert.deepEqual(validateRoadmap(), { ok: true, issues: [] });
  for (const [id, replacement] of Object.entries(ROADMAP_RETIRED_IDS)) {
    assert.equal(rows.some(row => row.id === id), false);
    assert.ok(rows.some(row => row.id === replacement));
    assert.ok(ROADMAP_CODE_CONTRACTS[replacement]);
    const job = { id: 'old-'+id, requested_by: 'mel-autonomy', status: 'TEACHER_APPROVED', optional_context: { roadmap_id: id } };
    assert.deepEqual(selectActionableAutonomyJobs([job], { roadmap: rows.map(row => ({ ...row, status: 'DONE_VERIFIED' })) }), []);
    assert.throws(() => assertRoadmapCodeChanges(job, []), { code: 'ROADMAP_ITEM_RETIRED' });
  }
});

test('consolidation keeps crash, registration, versioning and truthful progress criteria under revised contracts', () => {
  const resume = ROADMAP_CODE_CONTRACTS['MEL-FOUNDER-02'];
  assert.ok(resume.test_paths.includes('tests/autonomy-runtime.test.mjs'));
  assert.ok(resume.test_paths.includes('tests/autonomy-runtime-lease.test.mjs'));
  assert.match(resume.acceptance.join(' '), /interruption entre deux écritures/);
  const capability = ROADMAP_CODE_CONTRACTS['MEL-FOUNDER-03'];
  assert.ok(capability.test_paths.includes('tests/expanded-capability-bus.test.mjs'));
  assert.match(capability.acceptance.join(' '), /conflit de nom/);
  assert.match(capability.acceptance.join(' '), /ancienne compétence reste active/);
  const manifest = rows.find(row => row.id === 'MEL-MANIFEST-01');
  assert.match(manifest.acceptance.join(' '), /appareil non testé interdit 100/);
  assert.deepEqual(manifest.depends_on, ['MEL-FOUNDER-02']);
  for (const id of ['MEL-FOUNDER-02', 'MEL-FOUNDER-03', 'MEL-MANIFEST-01']) {
    assert.equal(roadmapContractRevision(id), '2026-11-06-consolidated-v1');
    assert.throws(() => assertRoadmapCodeChanges({ requested_by: 'mel-autonomy', optional_context: {
      roadmap_id: id, roadmap_contract_revision: '2026-10-31-code-v2',
    } }, []), { code: 'ROADMAP_CODE_CONTRACT_STALE' });
  }
  assert.equal(roadmapContractRevision('MEL-FOUNDER-01'), '2026-10-29-code-v1', 'unrelated verified receipts are not reset');
});

for (const storage of ['memory', 'sqlite']) test(`retirement preserves evidence and running or completed jobs (${storage})`, async t => {
  const db = storage === 'sqlite' ? sqliteD1() : null;
  if (db) t.after(() => db.close());
  const repository = new D1DevJobRepository(db, { memoryStore: new Map() });
  const evidence = { council: { status: 'REJECTED', sha: 'a'.repeat(40) } };
  const fixtures = [['queued','TEACHER_APPROVED',null], ['running','CLAIMED','RUNNING'], ['done','COMPLETED',null], ['review','TEACHER_APPROVED','READY_FOR_REVIEW']];
  for (const [id] of fixtures) {
    await repository.create({ id, requested_by: 'mel-autonomy', status: 'WAITING_DEPENDENCY', goal: 'Old goal '+id, optional_context: { roadmap_id: {queued:'MEL-MANIFEST-03', running:'MEL-MANIFEST-02', done:'MEL-MANIFEST-09', review:'MEL-MANIFEST-10'}[id] } });
  }
  // Historical rows can predate the admission fence; stage them without bypassing creation guards.
  for (const [id, status, bridge] of fixtures) {
    await repository.update(id, { status, files_json: [{path:'archived.js', content:'proof'}], result_json: { ...evidence, ...(bridge ? { dev_bridge: {status:bridge} } : {}) } });
  }
  assert.deepEqual(await refreshRoadmapCodeMissions(repository, await repository.list(), rows), ['queued']);
  const cancelled = await repository.get('queued');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.result_json.roadmap_retirement.replacement_id, 'MEL-FOUNDER-03');
  assert.equal(cancelled.result_json.roadmap_retirement.proof_transferred, false);
  assert.deepEqual(cancelled.result_json.council, evidence.council);
  assert.deepEqual(cancelled.files_json, [{path:'archived.js', content:'proof'}]);
  for (const id of ['running','review','done']) assert.equal((await repository.get(id)).result_json.roadmap_retirement, undefined);
  const supervisor = new AutonomySupervisor({ repository, roadmap: rows });
  const state = await supervisor.state();
  assert.ok(state.active.some(job => job.id === 'running'), 'the executing job retains its slot');
  const next = await supervisor.ensureNextJob();
  assert.equal(next.job, null, 'no retired job is returned for generic re-execution');
  assert.equal(next.external_progress.status, 'ROADMAP_RETIRED_EXECUTION_PENDING');
  assert.equal((await repository.list()).length, 4, 'no replacement mission or duplicate is created');
  assert.deepEqual(await refreshRoadmapCodeMissions(repository, await repository.list(), rows), []);
});
