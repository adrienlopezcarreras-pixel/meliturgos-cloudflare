import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewVerificationEvidence } from '../src/evolution/council-review.js';
import { objectiveVerificationProfile, isFounderVerificationGoal } from '../src/evolution/objective-verification-profiles.js';
import { collectRoadmapTestEvidence } from '../src/evolution/roadmap-test-evidence.js';
import { manifestFunctionalEvidence } from '../src/evolution/verify-existing-live-checks.js';
import { manifest01FoundationPrerequisites } from '../src/roadmap/manifest-01-acceptance.js';
import { roadmapContractRevision } from '../src/roadmap/roadmap-code-contracts.js';
const sha = 'a'.repeat(40), goal = '[MEL-MANIFEST-01] Compter les priorités';
function fixture() {
  const profile = objectiveVerificationProfile(goal);
  const log = Object.entries(profile.required_tests).map(([path, names]) => names.map((name,i) => 'ok '+(i+1)+' - '+name).join('\n')+'\n✓ '+path).join('\n')+'\n1073 passed, 0 failed\n';
  const job = { id: 'manifest-proof', goal, optional_context: { roadmap_id: profile.id, roadmap_contract_revision: roadmapContractRevision(profile.id) } };
  const proof = { ok: true, candidate_sha: sha, run_id: 123, digest: 'b'.repeat(64), mandatory_tests_verified: true,
    roadmap_test_evidence: collectRoadmapTestEvidence(log, {candidateSha:sha,runId:123,attempt:1,exitCode:0}) };
  const liveChecks = [{ capability: profile.capability, ok: true, items: 5,
    functional_evidence: manifestFunctionalEvidence({MEL_DEPLOYED_GIT_SHA:sha}, {schema:'mel.autonomy-readiness',version:3,manifest_01:manifest01FoundationPrerequisites()}) }];
  return { job, proof, liveChecks, profile, implementation: {candidate_sha:sha,selected:{text:'TESTS: test/invented-path.js'}} };
}
function db(cached = null) { return { prepare() { return { bind() { return this; }, async first() { return cached ? {metadata_json:JSON.stringify(cached)} : null; }, async run() { return {success:true}; } }; } }; }

test('Council receives real exact-file test receipts and semantic report separately from invented plan citations', async () => {
  const f=fixture(), asked=[];
  const out=await reviewVerificationEvidence({DB:db()}, {job:f.job,implementation:f.implementation,ciRunId:123,liveChecks:f.liveChecks,missionTestProof:f.proof,
    review:async (_env,input)=>{asked.push(input);return {decision:'APPROVED',reviews:[]};}});
  assert.equal(out.decision,'APPROVED');
  assert.match(asked[0].diff,/tests\/autonomy-readiness\.test\.mjs/);
  assert.match(asked[0].diff,/business indicators stay report data/);
  assert.match(asked[0].diff,/external_pending_ids/);
  assert.match(asked[0].diff,/PROPOSITION DU MODÈLE \(non exécutée, ni preuve de tests/);
});

test('missing exact objective tests or wrong deployed SHA stop before any Council call', async () => {
  for (const kind of ['tests','sha']) {
    const f=fixture(); let calls=0;
    if(kind==='tests') f.proof.roadmap_test_evidence.files=[];
    else f.liveChecks[0].functional_evidence.deployed_sha='c'.repeat(40);
    const out=await reviewVerificationEvidence({DB:db()}, {job:f.job,implementation:f.implementation,ciRunId:123,liveChecks:f.liveChecks,missionTestProof:f.proof,
      review:async()=>{calls++;return {decision:'APPROVED',reviews:[]};}});
    assert.equal(calls,0);
    assert.ok(['MISSION_TEST_EVIDENCE_REQUIRED','OBJECTIVE_FUNCTIONAL_EVIDENCE_REQUIRED'].includes(out.decision));
  }
});

test('unchanged rejected evidence stays cached; a different independent artifact is a different review input', async () => {
  for (const changed of [false,true]) {
    const f=fixture();let calls=0;
    const prior={head:sha,ci_run_id:123,live_checks:f.liveChecks,mission_test_digest:changed?'c'.repeat(64):f.proof.digest,
      evidence_revision:f.profile.revision,decision:'REJECTED',reviews:[]};
    const out=await reviewVerificationEvidence({DB:db(prior)}, {job:f.job,implementation:f.implementation,ciRunId:123,liveChecks:f.liveChecks,missionTestProof:f.proof,
      review:async()=>{calls++;return {decision:'APPROVED',reviews:[]};}});
    assert.equal(calls,changed?1:0);
    assert.equal(out.decision,changed?'APPROVED':'REJECTED');
  }
  assert.equal(isFounderVerificationGoal('[MEL-MANIFEST-01] états : MEL-FOUNDER-01'),false);
});

test('an autonomous verification veto enters repair instead of becoming an unreachable terminal failure', async () => {
  const { sqliteD1 } = await import('./helpers/sqlite-d1.mjs');
  const DB = sqliteD1();
  try {
    await DB.prepare('CREATE TABLE dev_bridge_state(bridge_id TEXT PRIMARY KEY,last_seen INTEGER,status TEXT,metadata_json TEXT)').run();
    await DB.prepare('CREATE TABLE dev_jobs(id TEXT PRIMARY KEY,status TEXT,result_json TEXT,error TEXT,updated_at INTEGER)').run();
    await DB.prepare('INSERT INTO dev_jobs VALUES(?,?,?,?,?)').bind('auto-veto','TEACHER_APPROVED','{}',null,1).run();
    const result = await reviewVerificationEvidence({ DB }, { job: { id:'auto-veto', requested_by:'mel-autonomy', goal:'Gmail' },
      implementation:{candidate_sha:sha,selected:{text:'DECISION: VERIFY_EXISTING'}}, ciRunId:123,
      liveChecks:[{capability:'gmail.messages.search',ok:true,items:1}],
      review:async()=>({decision:'REJECTED',reviews:[{model:'reviewer',verdict:'REJECT',blocking:['Missing acceptance case']}]}),
    });
    assert.equal(result.decision,'REJECTED');
    const row=await DB.prepare('SELECT status,result_json FROM dev_jobs WHERE id=?').bind('auto-veto').first();
    assert.equal(row.status,'REPAIR_REQUIRED');
    const saved=JSON.parse(row.result_json);
    assert.equal(saved.council_review.verification_repair_required,true);
    assert.equal(saved.council_review.repair_required,false,'the verdict rejected evidence, not a published code packet');
  } finally { DB.close(); }
});

test('a rejected current verification cannot be recycled as another unchanged no-code plan', async () => {
  const { implementationDecisionGoal, requireProvableImplementationDecision } = await import('../src/evolution/autonomy-implementation-planner.js');
  const plan='DECISION: VERIFY_EXISTING\nLIVE_CHECKS: autonomy.status\nFICHIERS: existants\nCHANGEMENTS: aucun\nREUTILISATION: rapport\nTESTS: CI\nRISQUES: faibles\nROLLBACK: aucun\nCRITERES_DE_FIN: preuves';
  assert.equal(requireProvableImplementationDecision(goal,plan),plan);
  const guarded=implementationDecisionGoal({goal,result_json:{verify_existing_rejection:{repair_required:true}}});
  assert.throws(()=>requireProvableImplementationDecision(guarded,plan), {code:'IMPLEMENTATION_UNPROVABLE_VERIFY_EXISTING'});
});
