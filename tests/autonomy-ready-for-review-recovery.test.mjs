import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

const CANDIDATE_HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function fixture() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const aiCalls = [];
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response('', { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response('', { status: 200 });
    if (target.includes('/commits/candidate%2Faugmentio-core')) return Response.json({ sha: CANDIDATE_HEAD_SHA });
    if (target.startsWith('https://api.github.com/')) return new Response('rate limited fixture', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) {
      return new Response('export const recovered = true;\n// candidate source\n', { status: 200, headers: { etag: 'ready-review-fixture' } });
    }
    return new Response('not found', { status: 404 });
  };
  const env = {
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: `Independent state-of-play from ${model}` };
      },
    },
  };
  return { repository, aiCalls, fetchImpl, env };
}

test('a real READY_FOR_REVIEW autonomy job is recovered into WAITING_TEACHER instead of idling', async () => {
  const f = fixture();
  const job = await f.repository.create({
    id: 'mel-autonomy-mel-work-01-1',
    requested_by: 'mel-autonomy',
    goal: '[MEL-WORK-01] Work Engine persistant — États de tâche, artefacts, checkpoints, reprise',
    optional_context: {
      roadmap_id: 'MEL-WORK-01',
      phase_id: 'P07',
      phase: 'Work, agents et automatisations',
      priority: 'P0',
      candidate_branch_only: true,
      zero_added_cost: true,
      source: 'autonomy-supervisor',
    },
  });
  await f.repository.update(job.id, {
    status: 'READY_FOR_REVIEW',
    candidate_branch: 'mel-dev/mel-autonomy-mel-work-01-1',
    result_json: {
      autonomy_proofs: {
        work_dag_resume: {
          status: 'VERIFIED',
          recovered_interrupted_node: true,
          providers_attempted: 2,
          successful_candidates: 2,
          verified_at: new Date().toISOString(),
        },
      },
    },
  });

  const tick = await runAutonomyRuntimeTick(f.env, { repository: f.repository, fetchImpl: f.fetchImpl });

  assert.equal(tick.ok, true);
  assert.equal(tick.job.id, job.id);
  assert.equal(tick.job.status, 'WAITING_TEACHER');
  assert.equal(tick.teacher.status, 'WAITING_TEACHER');
  assert.ok(tick.teacher.request_id);
  assert.ok(f.aiCalls.length >= 2, 'the recovered job must still perform a live multi-AI Council');

  const stored = await f.repository.get(job.id);
  assert.equal(stored.result_json.teacher_bridge.status, 'WAITING_TEACHER');
  assert.equal(stored.result_json.teacher_bridge.request.provenance.branch, 'candidate/augmentio-core');
  assert.equal(stored.result_json.teacher_bridge.request.candidate.sha, CANDIDATE_HEAD_SHA);
});
