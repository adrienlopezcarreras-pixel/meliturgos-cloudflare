import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTeacherHandoffReview,
  createTeacherHandoffPacket,
  teacherHandoffPublicView,
  verifyTeacherHandoffPacket,
} from '../../src/teachers/teacher-handoff-packet.js';
import { MULTI_AI_PROTOCOL } from '../../src/coordination/multi-ai-protocol.js';

const SHA = 'a'.repeat(40);

function request(overrides = {}) {
  return {
    type: 'MEL_TEACHER_REVIEW_REQUEST',
    version: 2,
    request_id: 'req-1',
    created_at: '2026-09-25T08:00:00.000Z',
    objective: 'Improve MEL continuity',
    stage: 'TEACHER_REVIEW_REQUIRED',
    target_sha: SHA,
    council: {
      status: 'COMPLETE',
      phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
      budget_policy: 'ZERO_ADDED_COST_FAIL_CLOSED',
      all_required_roles_satisfied: true,
      required_roles_succeeded: [
        'ARCHITECTURE_REUSE',
        'SECURITY_GOVERNANCE',
        'TESTS_EVIDENCE',
        'PRODUCT_INTEGRATION',
      ],
      responses: [
        {
          member: 'provider-a::ARCHITECTURE_REUSE',
          answer: {
            role: 'ARCHITECTURE_REUSE',
            role_label: 'Architecture',
            provider_id: 'provider-a',
            provenance: { provider: 'workers-ai', model: 'model-a' },
            provider_fallback_used: false,
          },
        },
      ],
      synthesis: {
        status: 'COMPLETE',
        coordinator: 'MEL',
        provider_id: 'provider-a',
        provenance: { provider: 'workers-ai', model: 'model-a' },
        text: 'Use the existing durable services.',
      },
    },
    inspection: {
      status: 'COMPLETE',
      evidence: [
        { path: 'src/core/example.js', sha: SHA, finding: 'reuse this service' },
      ],
    },
    spec: { strategy: 'small reversible diff' },
    candidate: {
      repository: MULTI_AI_PROTOCOL.repository,
      branch: MULTI_AI_PROTOCOL.canonicalCandidate,
      sha: SHA,
    },
    patch_summary: { files: ['src/core/example.js'] },
    tests: [
      { name: 'core continuity', passed: true, run_id: '36100000000', head_sha: SHA },
    ],
    security: { status: 'PASS', secrets: [] },
    unknowns: ['production latency'],
    rollback: { strategy: 'revert exact candidate commit' },
    provenance: {
      target_sha: SHA,
      roadmap_id: 'MEL-CONTEXT-03',
      producer: 'MEL',
    },
    requested_review: [
      'architecture',
      'correctness',
      'security_privacy',
    ],
    ...overrides,
  };
}

test('handoff packet binds Council evidence and exact Git target with SHA-256 integrity', async () => {
  const packet = await createTeacherHandoffPacket({
    request: request(),
    job: {
      id: 'job-1',
      requested_by: 'mel-autonomy',
      status: 'WAITING_TEACHER',
      optional_context: { roadmap_id: 'MEL-CONTEXT-03', priority: 'P1' },
    },
    additionalEvidence: {
      ci: { run_id: '36100000000', result: 'success' },
    },
  });

  assert.equal(packet.schema, 'mel.teacher-handoff/v1');
  assert.equal(packet.request_id, 'req-1');
  assert.equal(packet.target.sha, SHA);
  assert.equal(packet.target.repository, MULTI_AI_PROTOCOL.repository);
  assert.equal(packet.job.roadmap_id, 'MEL-CONTEXT-03');
  assert.equal(packet.council.all_required_roles_satisfied, true);
  assert.equal(packet.inspection.evidence_count, 1);
  assert.equal(packet.tests[0].run_id, '36100000000');
  assert.equal(packet.coordination.canonical_candidate, MULTI_AI_PROTOCOL.canonicalCandidate);
  assert.match(packet.integrity.digest, /^[0-9a-f]{64}$/);
  assert.equal(await verifyTeacherHandoffPacket(packet), true);
});

test('same review request produces stable packet digest when evidence is identical', async () => {
  const a = await createTeacherHandoffPacket({ request: request(), additionalEvidence: { proof: 'same' } });
  const b = await createTeacherHandoffPacket({ request: request(), additionalEvidence: { proof: 'same' } });

  assert.equal(a.packet_id, b.packet_id);
  assert.equal(a.integrity.digest, b.integrity.digest);
});

test('handoff verifier detects post-creation evidence tampering', async () => {
  const packet = await createTeacherHandoffPacket({ request: request() });
  const tampered = structuredClone(packet);
  tampered.tests[0].passed = false;

  await assert.rejects(
    () => verifyTeacherHandoffPacket(tampered),
    error => error?.code === 'TEACHER_HANDOFF_INTEGRITY_MISMATCH',
  );
});

test('handoff creation rejects candidate/request SHA divergence', async () => {
  await assert.rejects(
    () => createTeacherHandoffPacket({
      request: request({
        candidate: {
          repository: MULTI_AI_PROTOCOL.repository,
          branch: MULTI_AI_PROTOCOL.canonicalCandidate,
          sha: 'b'.repeat(40),
        },
      }),
    }),
    error => error?.code === 'TEACHER_HANDOFF_CANDIDATE_SHA_MISMATCH',
  );
});

test('secret-like data is redacted from portable handoff evidence', async () => {
  const packet = await createTeacherHandoffPacket({
    request: request(),
    additionalEvidence: {
      authorization: 'Bearer abcdefghijklmnopqrstuvwxyz',
      api_token: 'must-never-leak',
      nested: { password: 'secret-value', harmless: 'kept' },
    },
  });

  assert.equal('authorization' in packet.additional_evidence, false);
  assert.equal('api_token' in packet.additional_evidence, false);
  assert.equal('password' in packet.additional_evidence.nested, false);
  assert.equal(packet.additional_evidence.nested.harmless, 'kept');
});

test('Teacher reply must bind to exact packet digest in addition to request id and SHA', async () => {
  const packet = await createTeacherHandoffPacket({ request: request() });

  await assert.rejects(
    () => applyTeacherHandoffReview(packet, {
      request_id: 'req-1',
      target_sha: SHA,
      packet_digest: '0'.repeat(64),
      verdict: 'APPROVE_PLAN',
    }),
    error => error?.code === 'TEACHER_REVIEW_PACKET_DIGEST_MISMATCH',
  );

  const result = await applyTeacherHandoffReview(packet, {
    request_id: 'req-1',
    target_sha: SHA,
    packet_digest: packet.integrity.digest,
    verdict: 'APPROVE_PLAN',
    feedback: 'Proceed with the reviewed exact candidate.',
    evidence: [{ check: 'architecture', result: 'pass' }],
    provenance: { teacher: 'external-chatgpt' },
  });

  assert.equal(result.development_allowed, true);
  assert.equal(result.packet_id, 'teacher-handoff:req-1');
  assert.equal(result.packet_digest, packet.integrity.digest);
  assert.equal(result.target_sha, SHA);
});

test('public handoff view excludes embedded raw request while retaining proof summaries', async () => {
  const packet = await createTeacherHandoffPacket({ request: request() });
  const view = teacherHandoffPublicView(packet);

  assert.equal(view.packet_id, packet.packet_id);
  assert.equal(view.integrity.digest, packet.integrity.digest);
  assert.equal('request' in view, false);
  assert.equal(view.council.synthesis.status, 'COMPLETE');
  assert.equal(view.inspection.evidence_count, 1);
});
