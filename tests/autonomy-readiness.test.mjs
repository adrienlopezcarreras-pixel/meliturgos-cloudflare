import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { getAutonomyReadiness } from '../src/evolution/autonomy-readiness.js';

function council(costB = 0) {
  return {
    status: 'COMPLETE',
    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
    responses: [
      { member: 'workers-ai:a', answer: { estimated_cost: 0, content: 'a' } },
      { member: 'workers-ai:b', answer: { estimated_cost: costB, content: 'b' } },
    ],
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

async function completeEvidenceRepository({ secondCost = 0, includeImplementation = true } = {}) {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({
    id: 'ready-job',
    requested_by: 'mel-autonomy',
    goal: 'prove autonomy',
    optional_context: { roadmap_id: 'MEL-WORK-01' },
  });
  await repository.update(job.id, {
    status: 'COMPLETED',
    candidate_branch: 'candidate/augmentio-core',
    plan_json: { preflight: { council: council(secondCost) } },
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

test('readiness becomes true only from one correlated Council, Work DAG, Teacher, MEL planning and CI loop', async () => {
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
  assert.equal(state.evidence.coherent_single_job_loop.implementation_base_sha, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  assert.equal(state.evidence.coherent_single_job_loop.candidate_sha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(state.evidence.coherent_single_job_loop.full_loop_correlated, true);
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
