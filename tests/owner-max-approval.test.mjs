import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOwnerMaxApproval } from '../src/teachers/owner-max-approval.js';

class MemoryRepo {
  constructor(job) { this.job = structuredClone(job); }
  async get(id) { return id === this.job.id ? structuredClone(this.job) : null; }
  async update(id, patch) {
    if (id !== this.job.id) return null;
    this.job = { ...this.job, ...structuredClone(patch), updated_at: Date.now() };
    return structuredClone(this.job);
  }
}

function waitingJob() {
  const sha = 'a'.repeat(40);
  return {
    id: 'job-owner-max-1',
    status: 'WAITING_TEACHER',
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request: {
          type: 'MEL_TEACHER_REVIEW_REQUEST',
          request_id: 'req-owner-max-1',
          target_sha: sha,
          stage: 'TEACHER_REVIEW_REQUIRED',
          candidate: { branch: 'candidate/mel-clean-autonomy', sha },
          provenance: { source: 'MEL_RUNTIME_CRON' },
          requested_review: ['security', 'tests'],
        },
        evidence: { candidate_sha: sha },
        review: null,
      },
    },
  };
}

test('owner MAX converts an already inspected Teacher wait into candidate-only approval', async () => {
  const repo = new MemoryRepo(waitingJob());
  const out = await applyOwnerMaxApproval(repo, 'job-owner-max-1');
  assert.equal(out.duplicate, false);
  const job = await repo.get('job-owner-max-1');
  assert.equal(job.status, 'TEACHER_APPROVED');
  assert.equal(job.result_json.teacher_bridge.status, 'ANSWERED');
  assert.equal(job.result_json.teacher_bridge.review.verdict, 'APPROVE_PLAN');
  assert.equal(job.result_json.teacher_bridge.review.development_allowed, true);
  assert.equal(job.result_json.teacher_bridge.review.owner_override, true);
  assert.equal(job.result_json.owner_max_autonomy.production_release_allowed, false);
});

test('owner MAX fails closed without a correlated candidate Teacher request', async () => {
  const job = waitingJob();
  job.result_json.teacher_bridge.request.candidate.sha = 'not-a-sha';
  const repo = new MemoryRepo(job);
  await assert.rejects(
    () => applyOwnerMaxApproval(repo, job.id),
    error => error?.code === 'OWNER_MAX_PREFLIGHT_EVIDENCE_REQUIRED',
  );
  assert.equal((await repo.get(job.id)).status, 'WAITING_TEACHER');
});
