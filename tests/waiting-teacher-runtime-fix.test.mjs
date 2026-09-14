import test from 'node:test';
import assert from 'node:assert/strict';
import { approveAllWaitingTeachersUnderOwnerMax } from '../src/evolution/autonomy-runtime.js';
import { mirrorOwnerChatTeacherRequestToGitHub } from '../src/teachers/owner-chat-teacher-mirror.js';

class MemoryRepo {
  constructor(jobs) { this.jobs = jobs.map(job => structuredClone(job)); }
  async list() { return this.jobs.map(job => structuredClone(job)); }
  async get(id) { const job = this.jobs.find(row => row.id === id); return job ? structuredClone(job) : null; }
  async update(id, patch) {
    const index = this.jobs.findIndex(row => row.id === id);
    if (index < 0) return null;
    this.jobs[index] = { ...this.jobs[index], ...structuredClone(patch) };
    return structuredClone(this.jobs[index]);
  }
}

function waitingJob(id, requestedBy = 'owner-chat-ui') {
  const sha = 'a'.repeat(40);
  return {
    id,
    requested_by: requestedBy,
    status: 'WAITING_TEACHER',
    optional_context: { roadmap_id: 'P0-WAITING-TEACHER' },
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        queued_at: '2026-09-14T12:00:00.000Z',
        evidence: { candidate_sha: sha },
        request: {
          type: 'MEL_TEACHER_REVIEW_REQUEST',
          request_id: `req-${id}`,
          target_sha: sha,
          stage: 'TEACHER_REVIEW_REQUIRED',
          candidate: { repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare', branch: 'candidate/mel-clean-autonomy', sha },
          provenance: { source: 'MEL_RUNTIME_CRON', roadmap_id: 'P0-WAITING-TEACHER' },
          requested_review: ['security', 'tests'],
          tests: [],
        },
      },
    },
  };
}

test('MAX sweeps every valid WAITING_TEACHER job instead of only the current runtime job', async () => {
  const repo = new MemoryRepo([waitingJob('owner-1'), waitingJob('mel-1', 'mel-autonomy')]);
  const out = await approveAllWaitingTeachersUnderOwnerMax(repo);
  assert.equal(out.attempted, 2);
  assert.equal(out.applied.length, 2);
  assert.equal((await repo.get('owner-1')).status, 'TEACHER_APPROVED');
  assert.equal((await repo.get('mel-1')).status, 'TEACHER_APPROVED');
  assert.equal(out.failed.length, 0);
});

test('owner-chat WAITING_TEACHER request is actually sent to the Teacher transport', async () => {
  const job = waitingJob('owner-transport');
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET' });
    if ((init.method || 'GET') === 'GET') return new Response('', { status: 404 });
    return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } });
  };
  const out = await mirrorOwnerChatTeacherRequestToGitHub({
    env: {
      MEL_GITHUB_TOKEN: 'test-token',
      MEL_GITHUB_REPOSITORY: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
      MEL_TEACHER_TRANSPORT_BRANCH: 'teacher-bridge/runtime',
    },
    job,
    state: job.result_json.teacher_bridge,
    fetchImpl,
  });
  assert.equal(out.status, 'MIRRORED');
  assert.equal(out.owner_chat_transport, true);
  assert.equal(calls.some(call => call.method === 'PUT'), true);
});
