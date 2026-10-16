import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { getAutonomyReadiness } from '../src/evolution/autonomy-readiness.js';

function council(costB = 0, { sameProvider = false, missingProof = false, wrongPolicy = false, missingRole = false, missingSynthesis = false } = {}) {
  const respondingB = sameProvider ? 'workers-ai:a' : 'workers-ai:b';
  const provenance = id => ({
    provider_id:id,provider:'workers-ai',model:id,verified:true,added_cost:0,
    source:'fixture-verified-free-account',
    authorization:{
      approved:true,policy:wrongPolicy?'UNKNOWN':'MEL_ZERO_EURO_V1',
      authority:'fixture-owner',adapter_id:id,provider:'workers-ai',model:id,
    },
  });
  return {
    status: 'COMPLETE',
    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
    budget_policy:'ZERO_ADDED_COST_FAIL_CLOSED',
    responses: [
      { member: 'architecture-role', answer: { role:'ARCHITECTURE_REUSE', provider_id:'workers-ai:a', estimated_cost: 0, content: 'a' } },
      { member: 'security-role', answer: { role:'SECURITY_GOVERNANCE', provider_id:respondingB, estimated_cost: costB, content: 'b' } },
      { member: 'tests-role', answer: { role:'TESTS_EVIDENCE', provider_id:'workers-ai:a', estimated_cost: 0, content: 'tests' } },
      ...(!missingRole?[{ member: 'product-role', answer: { role:'PRODUCT_INTEGRATION', provider_id:respondingB, estimated_cost: 0, content:'product' } }]:[]),
    ],
    providers_succeeded: [...new Set(['workers-ai:a',respondingB])],
    zero_cost_provenance: missingProof ? [] : [...new Set(['workers-ai:a',respondingB])].map(provenance),
    required_roles_succeeded: missingRole
      ? ['ARCHITECTURE_REUSE','SECURITY_GOVERNANCE','TESTS_EVIDENCE']
      : ['ARCHITECTURE_REUSE','SECURITY_GOVERNANCE','TESTS_EVIDENCE','PRODUCT_INTEGRATION'],
    required_roles_missing: missingRole ? ['PRODUCT_INTEGRATION'] : [],
    all_required_roles_satisfied: !missingRole,
    critique_provenance:{all_required_roles_present:!missingRole},
    synthesis: missingSynthesis
      ? {status:'DEGRADED',coordinator:'MEL',text:''}
      : {status:'COMPLETE',coordinator:'MEL',text:'Fixture independent critique synthesis'},
  };
}

function workDagProof() {
  return {
    status: 'VERIFIED',
    verified_at: '2026-09-10T05:00:00Z',
    recovered_interrupted_node: true,
    providers_attempted: 2,
    successful_candidates: 2,
    zero_added_cost_policy: 'ENFORCED_BY_AUGMENTIO_GOVERNOR',
  };
}

async function completeEvidenceRepository({ secondCost = 0, includeImplementation = true, requestedBy = 'mel-autonomy', sameProvider = false, missingProof = false, wrongPolicy = false, missingRole = false, missingSynthesis = false } = {}) {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({
    id: 'ready-job',
    requested_by: requestedBy,
    goal: 'prove autonomy',
    optional_context: { roadmap_id: 'MEL-WORK-01' },
  });
  await repository.update(job.id, {
    status: 'COMPLETED',
    candidate_branch: 'candidate/augmentio-core',
    plan_json: { preflight: { council: council(secondCost, { sameProvider, missingProof, wrongPolicy, missingRole, missingSynthesis }) } },
    result_json: {
      autonomy_proofs: { work_dag_resume: workDagProof() },
      teacher_bridge: {
        status: 'ANSWERED',
        reviewed_at: '2026-09-10T05:01:00Z',
        request: {
          request_id: 'runtime-request-1',
          provenance: { source: 'MEL_RUNTIME_CRON' },
        },
        review: {
          request_id: 'runtime-request-1',
          verdict: 'APPROVE_PLAN',
          development_allowed: true,
        },
      },
      implementation_proposal: includeImplementation ? {
        status: 'READY',
        teacher_request_id: 'runtime-request-1',
        candidate_branch: 'candidate/augmentio-core',
        candidate_sha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        created_at: '2026-09-10T05:01:30Z',
        inspected_files: [{ path: 'src/evolution/autonomy-runtime.js', sha: 'source' }],
        providers_attempted: ['workers-ai:a', 'workers-ai:b'],
        selected: { model: 'a', provider: 'workers-ai', text: 'bounded plan' },
        production_touched: false,
        candidate_write_performed: false,
      } : null,
      autonomy_completion: {
        status: 'VERIFIED',
        request_id: 'runtime-request-1',
        candidate_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        candidate_branch: 'candidate/augmentio-core',
        completed_at: '2026-09-10T05:02:00Z',
        ci: {
          verified: true,
          workflow: 'full-candidate-ci',
          run_id: 4242,
          head_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          head_branch: 'candidate/augmentio-core',
          conclusion: 'success',
        },
      },
    },
  });
  return repository;
}

test('readiness is fail-closed when runtime evidence is absent', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const state = await getAutonomyReadiness({ repository });
  assert.equal(state.self_development_ready, false);
  assert.equal(state.status, 'BUILDING_AUTONOMY');
  assert.equal(state.version, 3);
  assert.deepEqual(state.gates, {
    live_council_zero_cost: false,
    runtime_work_dag_resume: false,
    runtime_teacher_round_trip: false,
    mel_multi_ai_implementation_plan: false,
    ci_verified_candidate_completion: false,
    coherent_single_job_loop: false,
  });
  assert.ok(state.blockers.includes('LIVE_COUNCIL_ZERO_COST_NOT_PROVEN'));
  assert.ok(state.blockers.includes('COHERENT_SINGLE_JOB_AUTONOMOUS_LOOP_NOT_PROVEN'));
});

test('readiness becomes true only from one internally selected Council, Work DAG, Teacher, MEL planning and CI loop', async () => {
  const repository = await completeEvidenceRepository();
  const state = await getAutonomyReadiness({ repository });
  assert.equal(state.self_development_ready, true);
  assert.equal(state.status, 'SELF_DEVELOPMENT_READY');
  assert.equal(state.blockers.length, 0);
  assert.equal(state.gates.live_council_zero_cost, true);
  assert.equal(state.gates.runtime_work_dag_resume, true);
  assert.equal(state.gates.runtime_teacher_round_trip, true);
  assert.equal(state.gates.mel_multi_ai_implementation_plan, true);
  assert.equal(state.gates.ci_verified_candidate_completion, true);
  assert.equal(state.gates.coherent_single_job_loop, true);
  assert.equal(state.evidence.runtime_teacher_round_trip.request_id, 'runtime-request-1');
  assert.equal(state.evidence.mel_multi_ai_implementation_plan.request_id, 'runtime-request-1');
  assert.equal(state.evidence.ci_verified_candidate_completion.ci_run_id, 4242);
  assert.equal(state.evidence.coherent_single_job_loop.job_id, 'ready-job');
  assert.equal(state.evidence.coherent_single_job_loop.requested_by, 'mel-autonomy');
  assert.equal(state.evidence.coherent_single_job_loop.implementation_base_sha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(state.evidence.coherent_single_job_loop.candidate_sha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(state.evidence.coherent_single_job_loop.full_loop_correlated, true);
});

test('owner-chat loop can prove capabilities but cannot prove independent self-development', async () => {
  const repository = await completeEvidenceRepository({ requestedBy: 'owner-chat' });
  const state = await getAutonomyReadiness({ repository });
  assert.equal(state.gates.live_council_zero_cost, true);
  assert.equal(state.gates.runtime_work_dag_resume, true);
  assert.equal(state.gates.runtime_teacher_round_trip, true);
  assert.equal(state.gates.mel_multi_ai_implementation_plan, true);
  assert.equal(state.gates.ci_verified_candidate_completion, true);
  assert.equal(state.gates.coherent_single_job_loop, false);
  assert.equal(state.self_development_ready, false);
  assert.ok(state.blockers.includes('COHERENT_SINGLE_JOB_AUTONOMOUS_LOOP_NOT_PROVEN'));
});

test('proofs spread across different jobs cannot falsely declare self-development ready', async () => {
  const repository = await completeEvidenceRepository();
  const readyJob = await repository.get('ready-job');
  await repository.update('ready-job', {
    result_json: { ...readyJob.result_json, autonomy_proofs: {} },
  });
  const split = await repository.create({
    id: 'split-work-proof',
    requested_by: 'mel-autonomy',
    goal: 'only prove work resume',
    optional_context: { roadmap_id: 'MEL-WORK-02' },
  });
  await repository.update(split.id, {
    status: 'COMPLETED',
    result_json: { autonomy_proofs: { work_dag_resume: workDagProof() } },
  });

  const state = await getAutonomyReadiness({ repository });
  assert.equal(state.gates.live_council_zero_cost, true);
  assert.equal(state.gates.runtime_work_dag_resume, true);
  assert.equal(state.gates.runtime_teacher_round_trip, true);
  assert.equal(state.gates.mel_multi_ai_implementation_plan, true);
  assert.equal(state.gates.ci_verified_candidate_completion, true);
  assert.equal(state.gates.coherent_single_job_loop, false);
  assert.equal(state.self_development_ready, false);
  assert.ok(state.blockers.includes('COHERENT_SINGLE_JOB_AUTONOMOUS_LOOP_NOT_PROVEN'));
});

test('CI completion alone cannot substitute for MEL doing the approved implementation planning work', async () => {
  const repository = await completeEvidenceRepository({ includeImplementation: false });
  const state = await getAutonomyReadiness({ repository });
  assert.equal(state.self_development_ready, false);
  assert.equal(state.gates.mel_multi_ai_implementation_plan, false);
  assert.equal(state.gates.ci_verified_candidate_completion, false, 'completion is correlated to the implementation proposal too');
  assert.equal(state.gates.coherent_single_job_loop, false);
  assert.ok(state.blockers.includes('MEL_APPROVED_IMPLEMENTATION_PLAN_NOT_PROVEN'));
});

test('unknown Council cost is never accepted as zero-cost readiness evidence', async () => {
  const repository = await completeEvidenceRepository({ secondCost: null });
  const state = await getAutonomyReadiness({ repository });
  assert.equal(state.self_development_ready, false);
  assert.equal(state.gates.live_council_zero_cost, false);
  assert.equal(state.gates.coherent_single_job_loop, false);
  assert.ok(state.blockers.includes('LIVE_COUNCIL_ZERO_COST_NOT_PROVEN'));
});

test('two independent Council roles routed to one provider are not two independent live AIs', async()=>{
  const repository=await completeEvidenceRepository({sameProvider:true});
  const state=await getAutonomyReadiness({repository});
  assert.equal(state.gates.live_council_zero_cost,false);
  assert.equal(state.self_development_ready,false);
  assert.ok(state.blockers.includes('LIVE_COUNCIL_ZERO_COST_NOT_PROVEN'));
});

test('cost zero without actual verified provider authorization is not live Council evidence',async()=>{
  for(const options of [{missingProof:true},{wrongPolicy:true}]){
    const repository=await completeEvidenceRepository(options);
    const state=await getAutonomyReadiness({repository});
    assert.equal(state.gates.live_council_zero_cost,false);
    assert.equal(state.gates.coherent_single_job_loop,false);
    assert.equal(state.self_development_ready,false);
  }
});

test('Council with two distinct authorized models but missing required role cannot prove autonomy readiness',async()=>{
  const repository=await completeEvidenceRepository({missingRole:true});
  const state=await getAutonomyReadiness({repository});
  assert.equal(state.gates.live_council_zero_cost,false);
  assert.equal(state.self_development_ready,false);
});

test('Council without completed MEL synthesis cannot prove autonomy readiness',async()=>{
  const repository=await completeEvidenceRepository({missingSynthesis:true});
  const state=await getAutonomyReadiness({repository});
  assert.equal(state.gates.live_council_zero_cost,false);
  assert.equal(state.gates.coherent_single_job_loop,false);
});

test('self-development readiness rejects CI SHA, branch and run identity mismatches', async () => {
  const tamper = [
    completion => { completion.ci.head_sha = 'c'.repeat(40); },
    completion => { completion.ci.head_branch = 'candidate/different'; },
    completion => { completion.candidate_sha = 'c'.repeat(40); },
    completion => { completion.candidate_branch = 'candidate/different'; },
    completion => { completion.ci.run_id = 0; },
    completion => { delete completion.ci.head_sha; },
    completion => { delete completion.ci.head_branch; },
  ];
  for (const mutate of tamper) {
    const repository = await completeEvidenceRepository();
    const job = await repository.get('ready-job');
    const result = structuredClone(job.result_json);
    mutate(result.autonomy_completion);
    await repository.update('ready-job', { result_json: result });
    const readiness = await getAutonomyReadiness({ repository });
    assert.equal(readiness.gates.ci_verified_candidate_completion, false);
    assert.equal(readiness.gates.coherent_single_job_loop, false);
    assert.equal(readiness.self_development_ready, false);
    assert.ok(readiness.blockers.includes('CI_VERIFIED_AUTONOMOUS_COMPLETION_NOT_PROVEN'));
  }
});
