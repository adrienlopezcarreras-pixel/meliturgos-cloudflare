import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { prepareApprovedImplementationProposal } from '../src/evolution/autonomy-implementation-planner.js';

const HEAD_SHA = '1111111111111111111111111111111111111111';

function fixture({ headSequence = [HEAD_SHA] } = {}) {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const aiCalls = [];
  let headReads = 0;
  const env = {
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: `FICHIERS: src/evolution/autonomy-runtime.js\nCHANGEMENTS: minimal ${model}\nTESTS: node --test\nRISQUES: faibles\nROLLBACK: revert\nCRITÈRES_DE_FIN: CI verte` };
      },
    },
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('/commits/candidate%2Faugmentio-core')) {
      const sha = headSequence[Math.min(headReads, headSequence.length - 1)];
      headReads += 1;
      return Response.json({ sha });
    }
    if (target.startsWith('https://api.github.com/')) return new Response('rate limited', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) {
      return new Response('export function candidateRuntime(){ return true; }\n// MEL-WORK-01\n', { status: 200, headers: { etag: 'source-etag' } });
    }
    return new Response('not found', { status: 404 });
  };
  return { repository, env, aiCalls, fetchImpl, getHeadReads: () => headReads };
}

async function approvedJob(repository) {
  const job = await repository.create({
    id: 'approved-planning-job',
    requested_by: 'mel-autonomy',
    goal: '[MEL-WORK-01] implement resumable work',
    optional_context: { roadmap_id: 'MEL-WORK-01', priority: 'P0' },
  });
  await repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    plan_json: {
      preflight: {
        council: {
          status: 'COMPLETE', phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
          responses: [
            { member: 'workers-ai:a', answer: { estimated_cost: 0 } },
            { member: 'workers-ai:b', answer: { estimated_cost: 0 } },
          ],
        },
      },
    },
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        evidence: { inspection_files: ['src/evolution/autonomy-runtime.js', 'src/work/work-dag.js'] },
        request: { request_id: 'approved-request', provenance: { source: 'MEL_RUNTIME_CRON' } },
        review: { request_id: 'approved-request', verdict: 'APPROVE_PLAN', development_allowed: true, feedback: 'Keep the diff small.' },
      },
    },
  });
  return repository.get(job.id);
}

test('after Teacher approval MEL independently builds and persists a bounded multi-AI implementation proposal', async () => {
  const f = fixture();
  const job = await approvedJob(f.repository);
  const proposal = await prepareApprovedImplementationProposal({ env: f.env, repository: f.repository, job, fetchImpl: f.fetchImpl });
  assert.equal(proposal.status, 'READY');
  assert.equal(proposal.teacher_request_id, 'approved-request');
  assert.equal(proposal.candidate_branch, 'candidate/augmentio-core');
  assert.equal(proposal.candidate_sha, HEAD_SHA);
  assert.ok(proposal.inspected_files.length >= 1);
  assert.ok(proposal.providers_attempted.length >= 2);
  assert.ok(f.aiCalls.length >= 2);
  assert.match(proposal.selected.text, /FICHIERS:/);
  assert.equal(proposal.production_touched, false);
  assert.equal(proposal.candidate_write_performed, false);
  assert.ok(f.getHeadReads() >= 2);
  const stored = await f.repository.get(job.id);
  assert.equal(stored.status, 'TEACHER_APPROVED');
  assert.equal(stored.result_json.implementation_proposal.status, 'READY');
  assert.equal(stored.result_json.implementation_proposal.candidate_sha, HEAD_SHA);
});

test('approved implementation proposal is idempotently reused only with an exact candidate sha', async () => {
  const f = fixture();
  const job = await approvedJob(f.repository);
  await prepareApprovedImplementationProposal({ env: f.env, repository: f.repository, job, fetchImpl: f.fetchImpl });
  const calls = f.aiCalls.length;
  const headReads = f.getHeadReads();
  const current = await f.repository.get(job.id);
  const reused = await prepareApprovedImplementationProposal({ env: f.env, repository: f.repository, job: current, fetchImpl: f.fetchImpl });
  assert.equal(reused.reused, true);
  assert.equal(reused.candidate_sha, HEAD_SHA);
  assert.equal(f.aiCalls.length, calls);
  assert.equal(f.getHeadReads(), headReads);
});

test('legacy READY proposal without candidate sha is regenerated instead of being reused', async () => {
  const f = fixture();
  const job = await approvedJob(f.repository);
  const current = await f.repository.get(job.id);
  await f.repository.update(job.id, {
    result_json: {
      ...current.result_json,
      implementation_proposal: {
        status: 'READY', teacher_request_id: 'approved-request', candidate_branch: 'candidate/augmentio-core',
        selected: { text: 'stale legacy proposal' }, providers_attempted: ['workers-ai:a', 'workers-ai:b'],
      },
    },
  });
  const refreshed = await prepareApprovedImplementationProposal({ env: f.env, repository: f.repository, job: await f.repository.get(job.id), fetchImpl: f.fetchImpl });
  assert.notEqual(refreshed.reused, true);
  assert.equal(refreshed.candidate_sha, HEAD_SHA);
  assert.ok(f.aiCalls.length >= 2);
});

test('planner fails closed if candidate head moves during code inspection', async () => {
  const f = fixture({ headSequence: [HEAD_SHA, '2222222222222222222222222222222222222222'] });
  const job = await approvedJob(f.repository);
  await assert.rejects(
    () => prepareApprovedImplementationProposal({ env: f.env, repository: f.repository, job, fetchImpl: f.fetchImpl }),
    (error) => error?.code === 'CANDIDATE_HEAD_CHANGED_DURING_INSPECTION',
  );
  assert.equal(f.aiCalls.length, 0);
});

test('planner refuses work without an exact correlated Teacher approval', async () => {
  const f = fixture();
  const job = await f.repository.create({ id: 'not-approved', requested_by: 'mel-autonomy', goal: 'x' });
  await assert.rejects(
    () => prepareApprovedImplementationProposal({ env: f.env, repository: f.repository, job, fetchImpl: f.fetchImpl }),
    (error) => error?.code === 'TEACHER_APPROVAL_REQUIRED',
  );
});
