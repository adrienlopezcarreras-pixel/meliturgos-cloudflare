import test from 'node:test';
import assert from 'node:assert/strict';

import { MentorMemoryRepository } from '../src/learning/mentor-memory.js';
import { MentorEngine, mentorPolicy } from '../src/learning/mentor-engine.js';
import { reconcileRuntimeTeacherReplies } from '../src/teachers/github-reply-reconciler.js';

function unique(label) {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function verifiedCiProof(sha = 'b'.repeat(40), runId = 424242) {
  return {
    verified: true,
    workflow: 'full-candidate-ci',
    run_id: runId,
    head_sha: sha,
    head_branch: 'candidate/mel-clean-autonomy',
    conclusion: 'success',
  };
}

test('acquired experiences are deduplicated, proof-gated, validated, and reread without downgrade', async () => {
  const memory = new MentorMemoryRepository(null);
  const marker = unique('experience-loop');
  const fingerprint = `teacher:${marker}`;
  const goal = `Corriger ${marker} sans transformer une observation en fait.`;

  const first = await memory.acquireExperience({
    fingerprint,
    job_id: `job-${marker}`,
    goal,
    source_type: 'TEACHER_REVIEW',
    lesson: `Le Teacher observe ${marker}: ajouter une garde explicite.`,
    evidence: { teacher_request_id: `request-${marker}` },
  });
  const second = await memory.acquireExperience({
    fingerprint,
    job_id: `job-${marker}`,
    goal,
    source_type: 'TEACHER_REVIEW',
    lesson: `Le Teacher observe ${marker}: ajouter une garde explicite.`,
    evidence: { teacher_request_id: `request-${marker}` },
  });

  assert.equal(first.id, second.id);
  assert.equal(second.trust, 'OBSERVATION');
  assert.equal(second.evidence.experience.validated, false);
  assert.equal(second.evidence.experience.occurrences, 2);

  const stored = (await memory.recent({ kind: 'EXPERIENCE', limit: 500 })).filter(row => row.id === first.id);
  assert.equal(stored.length, 1, 'duplicate acquisition must keep exactly one memory row');

  const split = await memory.experienceContext(goal, { limit: 20 });
  const observation = split.observations.find(row => row.id === first.id);
  assert.ok(observation, 'raw experience must be available for next-cycle reread');
  assert.equal(observation.trust, 'OBSERVATION');
  assert.equal(observation.occurrences, 2);
  assert.equal(split.validated.some(row => row.id === first.id), false);

  const trustedBeforeProof = await memory.context(goal, { limit: 20 });
  assert.equal(trustedBeforeProof.some(row => row.id === first.id), false, 'unvalidated observation must never enter trusted context');

  await assert.rejects(
    memory.validateExperience({ fingerprint, proof: { verified: true } }),
    error => error?.code === 'MENTOR_EXPERIENCE_PROOF_REQUIRED',
    'an asserted validation without exact candidate CI evidence must fail closed',
  );

  const validated = await memory.validateExperience({ fingerprint, proof: verifiedCiProof() });
  assert.equal(validated.id, first.id);
  assert.equal(validated.trust, 'VALIDATED');
  assert.equal(validated.evidence.experience.validated, true);
  assert.equal(validated.evidence.validation.validated, true);
  assert.equal(validated.evidence.validation.workflow, 'full-candidate-ci');
  assert.equal(validated.evidence.proof_status, 'VERIFIED_CANDIDATE_CI');
  assert.equal(validated.tags.includes('validated'), true);
  assert.equal(validated.tags.includes('unvalidated'), false);

  const splitAfterProof = await memory.experienceContext(goal, { limit: 20 });
  assert.equal(splitAfterProof.validated.some(row => row.id === first.id), true, 'validated experience must be reread as trusted on the next cycle');
  assert.equal(splitAfterProof.observations.some(row => row.id === first.id), false);
  const trustedAfterProof = await memory.context(goal, { limit: 20 });
  assert.equal(trustedAfterProof.some(row => row.id === first.id), true);

  const third = await memory.acquireExperience({
    fingerprint,
    job_id: `job-${marker}`,
    goal,
    source_type: 'TEACHER_REVIEW',
    lesson: `Le Teacher observe ${marker}: ajouter une garde explicite.`,
    evidence: { proof_status: 'UNVALIDATED_OBSERVATION' },
  });
  assert.equal(third.evidence.experience.occurrences, 3);
  assert.equal(third.evidence.experience.validated, true, 'a duplicate acquisition must never downgrade a validated experience');
  assert.equal(third.evidence.proof_status, 'VERIFIED_CANDIDATE_CI');
  assert.equal(third.tags.includes('validated'), true);
  assert.equal(third.tags.includes('unvalidated'), false);
});

test('mentor rereads observations as non-facts and stores Council proposals as unvalidated experience', async () => {
  const memory = new MentorMemoryRepository(null);
  const marker = unique('mentor-reread');
  const goal = `Implémenter ${marker} avec séparation stricte observation / vérité.`;
  const rawLesson = `Observation ${marker}: vérifier la frontière de confiance au cycle suivant.`;

  await memory.acquireExperience({
    fingerprint: `council:${marker}`,
    job_id: `job-${marker}`,
    goal,
    source_type: 'COUNCIL_REVIEW',
    lesson: rawLesson,
    evidence: { council_status: 'OBSERVED_ONLY' },
  });

  let capturedPrompt = '';
  const provider = {
    id: 'test-zero-cost-provider',
    providerId: 'test-provider',
    modelId: 'test-model',
    async invoke({ input }) {
      capturedPrompt = input;
      return {
        text: JSON.stringify({
          summary: `Proposition ${marker}`,
          changes: [{
            path: 'src/learning/experience-proof-fixture.js',
            content: 'export const experienceProofFixture = true;\n',
            reason: 'Fixture de proposition pour le test de mémoire.',
          }],
          tests: ['test:smoke'],
          confidence: 0.9,
          lessons: [],
          risks: [],
        }),
        provenance: { provider: 'test-provider', model: 'test-model', cost: 0 },
      };
    },
  };

  const mentor = new MentorEngine({
    memory,
    providerFactory: () => [provider],
  });
  const result = await mentor.propose({
    env: {},
    jobId: `job-${marker}`,
    goal,
    inspectedFiles: [{
      path: 'src/learning/mentor-memory.js',
      content: 'export const inspected = true;\n',
    }],
  });

  assert.match(capturedPrompt, /OBSERVATIONS ACQUISES NON VALIDÉES/);
  assert.ok(capturedPrompt.includes(rawLesson));
  assert.match(capturedPrompt, /NE JAMAIS LES TRAITER COMME DES FAITS/);
  assert.equal(result.policy, 'ZERO_ADDED_COST_FAIL_CLOSED');
  assert.equal(mentorPolicy.deployment_requires_human_approval, true);
  assert.ok(result.learning.acquired_observation_count >= 1);

  const experiences = await memory.experienceContext(goal, { limit: 20 });
  const councilProposal = experiences.observations.find(row =>
    row.source_type === 'MENTOR_COUNCIL_CODE_PROPOSAL' && row.lesson.includes(marker));
  assert.ok(councilProposal, 'Council proposal must be stored as an acquired observation');
  assert.equal(councilProposal.validated, false);

  const trusted = await memory.context(goal, { limit: 20 });
  assert.equal(trusted.some(row => row.id === councilProposal.id), false);
});

test('runtime Teacher feedback is acquired immediately but remains unvalidated pending proof', async () => {
  const marker = unique('teacher-runtime');
  const sha = 'a'.repeat(40);
  const requestId = `request-${marker}`;
  const jobId = `job-${marker}`;
  const feedback = `Teacher feedback ${marker}: corriger puis prouver par test.`;
  const request = {
    type: 'MEL_TEACHER_REVIEW_REQUEST',
    version: 2,
    request_id: requestId,
    created_at: new Date().toISOString(),
    objective: `Objectif ${marker}`,
    stage: 'TEACHER_REVIEW_REQUIRED',
    target_sha: sha,
    candidate: { branch: 'candidate/mel-clean-autonomy', sha },
    requested_review: ['correctness'],
  };

  let job = {
    id: jobId,
    goal: request.objective,
    status: 'WAITING_TEACHER',
    plan_json: { preflight: { ok: true } },
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request,
        evidence: {},
        review: null,
        queued_at: new Date().toISOString(),
        reviewed_at: null,
      },
    },
  };

  const repository = {
    async list() { return [structuredClone(job)]; },
    async get(id) { return id === job.id ? structuredClone(job) : null; },
    async update(id, patch) {
      assert.equal(id, job.id);
      job = { ...job, ...structuredClone(patch) };
      return structuredClone(job);
    },
  };

  const replyLine = JSON.stringify({
    request_id: requestId,
    target_sha: sha,
    verdict: 'NEEDS_CHANGES',
    feedback,
    evidence: ['teacher-review-only'],
  });
  const fetchImpl = async () => ({
    status: 200,
    ok: true,
    async text() { return `${replyLine}\n`; },
  });

  const reconciliation = await reconcileRuntimeTeacherReplies({
    repository,
    env: {
      MEL_CANONICAL_CANDIDATE_SHA: sha,
      MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
    },
    fetchImpl,
  });

  assert.equal(reconciliation.applied.length, 1);
  assert.equal(reconciliation.applied[0].learning.validated, false);
  assert.equal(reconciliation.applied[0].learning.trust, 'OBSERVATION');
  assert.equal(job.status, 'QUEUED', 'NEEDS_CHANGES must requeue the job instead of validating the feedback');

  const memory = new MentorMemoryRepository(null);
  const rows = await memory.recent({ kind: 'EXPERIENCE', limit: 500 });
  const acquired = rows.find(row =>
    row.job_id === jobId && row.evidence?.experience?.source_type === 'TEACHER_REVIEW');
  assert.ok(acquired, 'Teacher feedback must be persisted as acquired experience');
  assert.equal(acquired.lesson, feedback);
  assert.equal(acquired.evidence.experience.validated, false);
  assert.equal(acquired.evidence.proof_status, 'UNVALIDATED_OBSERVATION');

  const trusted = await memory.context(request.objective, { limit: 20 });
  assert.equal(trusted.some(row => row.id === acquired.id), false);
});

test('verified development outcome promotes the matching Teacher experience and only that experience', async () => {
  const memory = new MentorMemoryRepository(null);
  const mentor = new MentorEngine({ memory, providerFactory: () => [] });
  const marker = unique('teacher-promotion');
  const jobId = `job-${marker}`;
  const requestId = `request-${marker}`;
  const otherRequestId = `request-other-${marker}`;
  const goal = `Valider ${marker} seulement après preuve CI exacte.`;

  const target = await memory.acquireExperience({
    fingerprint: `teacher-review:${jobId}:${requestId}`,
    job_id: jobId,
    goal,
    source_type: 'TEACHER_REVIEW',
    lesson: `Teacher approuve le plan ${marker}.`,
    evidence: { teacher_request_id: requestId, proof_status: 'UNVALIDATED_OBSERVATION' },
  });
  const unrelated = await memory.acquireExperience({
    fingerprint: `teacher-review:${jobId}:${otherRequestId}`,
    job_id: jobId,
    goal,
    source_type: 'TEACHER_REVIEW',
    lesson: `Autre observation Teacher ${marker}.`,
    evidence: { teacher_request_id: otherRequestId, proof_status: 'UNVALIDATED_OBSERVATION' },
  });

  const outcome = await mentor.recordOutcome({
    jobId,
    goal,
    outcome: 'SUCCEEDED',
    lesson: `Le développement ${marker} a passé la CI complète.`,
    evidence: {
      request_id: requestId,
      ci: verifiedCiProof('c'.repeat(40), 515151),
    },
    score: 1,
    tags: ['verified-completion'],
  });

  assert.equal(outcome.experience_validation.validated, true);
  assert.equal(outcome.experience_validation.experience_id, target.id);

  const targetAfter = (await memory.recent({ kind: 'EXPERIENCE', limit: 500 })).find(row => row.id === target.id);
  const unrelatedAfter = (await memory.recent({ kind: 'EXPERIENCE', limit: 500 })).find(row => row.id === unrelated.id);
  assert.equal(targetAfter.evidence.experience.validated, true);
  assert.equal(targetAfter.evidence.validation.workflow, 'full-candidate-ci');
  assert.equal(unrelatedAfter.evidence.experience.validated, false, 'proof for one Teacher request must not validate unrelated observations');

  const reread = await memory.experienceContext(goal, { limit: 20 });
  assert.equal(reread.validated.some(row => row.id === target.id), true);
  assert.equal(reread.observations.some(row => row.id === unrelated.id), true);
});
