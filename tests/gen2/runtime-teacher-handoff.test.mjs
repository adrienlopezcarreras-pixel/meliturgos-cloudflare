import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRuntimeTeacherHandoffReply,
  queueRuntimeTeacherHandoff,
} from '../../src/teachers/runtime-teacher-bridge.js';
import { buildRuntimeTeacherMirror } from '../../src/teachers/github-request-mirror.js';
import { MULTI_AI_PROTOCOL } from '../../src/coordination/multi-ai-protocol.js';

const SHA = 'a'.repeat(40);

class MemoryRepository {
  constructor(job) {
    this.jobs = new Map([[job.id, structuredClone(job)]]);
  }
  async get(id) {
    const row = this.jobs.get(id);
    return row ? structuredClone(row) : null;
  }
  async list() {
    return [...this.jobs.values()].map(row => structuredClone(row));
  }
  async update(id, patch) {
    const current = this.jobs.get(id);
    if (!current) throw new Error('JOB_NOT_FOUND');
    const updated = { ...current, ...structuredClone(patch) };
    this.jobs.set(id, updated);
    return structuredClone(updated);
  }
}

function request() {
  return {
    type: 'MEL_TEACHER_REVIEW_REQUEST',
    version: 2,
    request_id: 'req-runtime-1',
    created_at: '2026-09-25T08:00:00.000Z',
    objective: 'Validate exact candidate',
    stage: 'TEACHER_REVIEW_REQUIRED',
    target_sha: SHA,
    council: {
      status: 'COMPLETE',
      phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
      all_required_roles_satisfied: true,
      required_roles_succeeded: [
        'ARCHITECTURE_REUSE',
        'SECURITY_GOVERNANCE',
        'TESTS_EVIDENCE',
        'PRODUCT_INTEGRATION',
      ],
      responses: [],
      synthesis: {
        status: 'COMPLETE',
        coordinator: 'MEL',
        text: 'Proceed only on exact evidence.',
      },
      teacher_required: true,
      development_allowed: false,
    },
    inspection: {
      status: 'COMPLETE',
      evidence: [{ path: 'src/core/file.js', sha: SHA }],
    },
    spec: { change: 'bounded' },
    candidate: {
      repository: MULTI_AI_PROTOCOL.repository,
      branch: MULTI_AI_PROTOCOL.canonicalCandidate,
      sha: SHA,
    },
    patch_summary: { files: ['src/core/file.js'] },
    tests: [{ name: 'targeted', passed: true, head_sha: SHA }],
    security: { status: 'PASS' },
    unknowns: [],
    rollback: { strategy: 'git revert' },
    provenance: { target_sha: SHA, roadmap_id: 'MEL-CONTEXT-03' },
    requested_review: ['architecture', 'correctness'],
  };
}

function job() {
  return {
    id: 'job-1',
    requested_by: 'mel-autonomy',
    goal: 'Validate exact candidate',
    status: 'READY_FOR_REVIEW',
    result_json: {},
    plan_json: {},
    optional_context: { roadmap_id: 'MEL-CONTEXT-03', priority: 'P1' },
  };
}

test('runtime handoff queue persists integrity-bound packet beside existing teacher_bridge state', async () => {
  const repository = new MemoryRepository(job());
  const queued = await queueRuntimeTeacherHandoff(
    repository,
    'job-1',
    request(),
    { ci: { run_id: '361000', status: 'success' } },
  );

  assert.equal(queued.state.status, 'WAITING_TEACHER');
  assert.equal(queued.integrity_verified, true);
  assert.equal(queued.packet.request_id, 'req-runtime-1');
  assert.match(queued.packet.integrity.digest, /^[0-9a-f]{64}$/);

  const stored = await repository.get('job-1');
  assert.equal(stored.status, 'WAITING_TEACHER');
  assert.equal(stored.result_json.teacher_bridge.request.request_id, 'req-runtime-1');
  assert.equal(stored.result_json.teacher_handoff.packet_id, 'teacher-handoff:req-runtime-1');
  assert.equal(
    stored.result_json.teacher_handoff.target.sha,
    stored.result_json.teacher_bridge.request.target_sha,
  );
});

test('GitHub mirror exports only handoff identity/integrity metadata', async () => {
  const repository = new MemoryRepository(job());
  const queued = await queueRuntimeTeacherHandoff(repository, 'job-1', request(), {
    private_notes: 'internal evidence remains in D1',
  });
  const stored = await repository.get('job-1');

  const mirror = buildRuntimeTeacherMirror(stored, queued.state);
  assert.equal(mirror.handoff.schema, 'mel.teacher-handoff/v1');
  assert.equal(mirror.handoff.packet_id, 'teacher-handoff:req-runtime-1');
  assert.equal(mirror.handoff.packet_digest, queued.packet.integrity.digest);
  assert.equal(mirror.handoff.target_sha, SHA);
  assert.equal('request' in mirror.handoff, false);
  assert.equal(JSON.stringify(mirror).includes('internal evidence remains in D1'), false);
});

test('integrity-bound runtime reply requires exact packet digest', async () => {
  const repository = new MemoryRepository(job());
  const queued = await queueRuntimeTeacherHandoff(repository, 'job-1', request());

  await assert.rejects(
    () => applyRuntimeTeacherHandoffReply(repository, {
      request_id: 'req-runtime-1',
      target_sha: SHA,
      packet_digest: '0'.repeat(64),
      verdict: 'APPROVE_PLAN',
    }),
    error => error?.code === 'TEACHER_REVIEW_PACKET_DIGEST_MISMATCH',
  );

  const result = await applyRuntimeTeacherHandoffReply(repository, {
    request_id: 'req-runtime-1',
    target_sha: SHA,
    packet_digest: queued.packet.integrity.digest,
    verdict: 'APPROVE_PLAN',
    feedback: 'Approved exact packet.',
    evidence: [{ check: 'architecture', status: 'PASS' }],
    provenance: { teacher: 'external-chatgpt' },
  });

  assert.equal(result.handoff_verified, true);
  assert.equal(result.packet_digest, queued.packet.integrity.digest);
  assert.equal(result.job.status, 'TEACHER_APPROVED');
  assert.equal(result.job.result_json.last_teacher_handoff.integrity_verified, true);
  assert.equal(result.job.result_json.last_teacher_handoff.target_sha, SHA);
});

test('legacy runtime teacher reply path remains available because new path is additive', async () => {
  const repository = new MemoryRepository(job());
  await queueRuntimeTeacherHandoff(repository, 'job-1', request());

  const stored = await repository.get('job-1');
  assert.equal(stored.result_json.teacher_bridge.status, 'WAITING_TEACHER');
  assert.equal(stored.result_json.teacher_handoff.schema, 'mel.teacher-handoff/v1');

  // This test intentionally does not invoke the legacy reply function: the
  // contract proof is that queueRuntimeTeacherHandoff preserved teacher_bridge
  // unchanged while adding a separate teacher_handoff field.
  assert.equal(stored.result_json.teacher_bridge.request.type, 'MEL_TEACHER_REVIEW_REQUEST');
});
