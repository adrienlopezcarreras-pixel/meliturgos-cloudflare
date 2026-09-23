import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { reconcileRuntimeCompletions } from '../src/teachers/github-completion-reconciler.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const REQUEST = 'mentor-completion-request';
const JOB = 'mentor-completion-job';
const BRANCH = 'candidate/augmentio-core';

async function approvedRepository({ withRevision = false } = {}) {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: JOB, requested_by: 'mel-autonomy', goal: 'Rendre la reprise autonome plus robuste' });
  await repository.update(job.id, {
    status: 'TEACHER_APPROVED',
    result_json: {
      ...(withRevision ? {
        teacher_bridge_history: [{
          status: 'ANSWERED',
          request: {
            request_id: 'old-request',
            objective: 'Rendre la reprise autonome plus robuste',
            patch_summary: { summary: 'Ancienne approche qui réutilisait une approbation liée à un SHA périmé.' },
          },
          review: {
            request_id: 'old-request',
            verdict: 'NEEDS_CHANGES',
            development_allowed: false,
            feedback: 'Recalculer la demande Teacher sur le SHA courant puis relancer tous les tests ciblés et la CI complète.',
          },
        }],
      } : {}),
      teacher_bridge: {
        status: 'ANSWERED',
        request: {
          request_id: REQUEST,
          provenance: { producer: 'MEL_RUNTIME_CRON', candidate_sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        },
        review: { request_id: REQUEST, verdict: 'APPROVE_PLAN', development_allowed: true },
      },
      dev_bridge: {
        status: 'READY_FOR_REVIEW',
        candidate_branch: BRANCH,
        diff_summary: 'Mentor completion provenance test change',
        needs_repair: false,
        received_at: '2026-09-11T12:00:00.000Z',
        tests: [{ name: 'targeted bridge test', passed: true }],
      },
      implementation_proposal: {
        status: 'READY',
        teacher_request_id: REQUEST,
        candidate_branch: BRANCH,
        providers_attempted: ['workers-ai:a', 'workers-ai:b'],
        inspected_files: [{ path: 'src/evolution/autonomy-runtime.js', sha: 'source-sha' }],
        selected: { provider: 'workers-ai', model: 'a', text: 'small tested implementation' },
        production_touched: false,
        candidate_write_performed: false,
      },
    },
  });
  return repository;
}

function fetchImpl(completionOverrides = {}) {
  return async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/completions.jsonl')) {
      return new Response(`${JSON.stringify({
        kind: 'MEL_WORK_COMPLETION',
        status: 'COMPLETED',
        job_id: JOB,
        request_id: REQUEST,
        candidate_sha: SHA,
        candidate_branch: BRANCH,
        ci_run_id: 5151,
        tests: [{ name: 'full candidate suite', passed: true }],
        summary: 'Reprise autonome validée et testée.',
        ...completionOverrides,
      })}\n`, { status: 200 });
    }
    if (target.includes('/actions/runs/5151')) {
      return Response.json({
        name: 'full-candidate-ci',
        head_sha: SHA,
        head_branch: BRANCH,
        status: 'completed',
        conclusion: 'success',
      });
    }
    return new Response('not found', { status: 404 });
  };
}

test('verified candidate completion becomes persistent Mentor development memory with additive provenance', async () => {
  const DB = sqliteD1();
  try {
    const repository = await approvedRepository();
    const result = await reconcileRuntimeCompletions({
      repository,
      env: { DB, MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      fetchImpl: fetchImpl(),
    });
    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0].mentor_learning, true);

    const lesson = await DB.prepare("SELECT * FROM mentor_lessons WHERE job_id=? AND kind='DEVELOPMENT_OUTCOME'").bind(JOB).first();
    assert.ok(lesson);
    assert.equal(lesson.outcome, 'SUCCEEDED');
    assert.match(lesson.lesson, /Reprise autonome validée/i);
    const evidence = JSON.parse(lesson.evidence_json);
    assert.equal(evidence.provenance.teacher.request_id, REQUEST);
    assert.equal(evidence.provenance.teacher.verdict, 'APPROVE_PLAN');
    assert.equal(evidence.provenance.teacher.development_allowed, true);
    assert.equal(evidence.provenance.teacher.producer, 'MEL_RUNTIME_CRON');
    assert.equal(evidence.provenance.dev_bridge.status, 'READY_FOR_REVIEW');
    assert.equal(evidence.provenance.dev_bridge.candidate_branch, BRANCH);
    assert.equal(evidence.provenance.dev_bridge.tests[0].name, 'targeted bridge test');
    assert.equal(evidence.provenance.dev_bridge.tests[0].passed, true);

    const stored = await repository.get(JOB);
    assert.equal(stored.result_json.autonomy_completion.mentor_learning.recorded, true);
    assert.equal(stored.result_json.autonomy_completion.mentor_learning.kind, 'DEVELOPMENT_OUTCOME');
    assert.equal(stored.result_json.teacher_bridge.review.verdict, 'APPROVE_PLAN');
    assert.equal(stored.result_json.dev_bridge.status, 'READY_FOR_REVIEW');
    assert.equal(stored.result_json.dev_bridge.tests[0].passed, true);
  } finally {
    DB.close();
  }
});

test('a previous NEEDS_CHANGES Teacher review becomes a validated correction only after full CI success', async () => {
  const DB = sqliteD1();
  try {
    const repository = await approvedRepository({ withRevision: true });
    const result = await reconcileRuntimeCompletions({
      repository,
      env: { DB, MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      fetchImpl: fetchImpl(),
      benchmarkEvaluator: async (testCase) => ({
        score: 1,
        repeated_error: false,
        evidence: { case_id: testCase.id, source: 'completion-test' },
      }),
      benchmarkModelId: '@cf/test-zero-cost',
    });
    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0].corrections_recorded, 1);
    const completedJob = await repository.get(JOB);
    assert.equal(completedJob.result_json.autonomy_completion.mentor_learning.benchmark_cadence.status, 'RAN');
    assert.equal(completedJob.result_json.autonomy_completion.mentor_learning.benchmark_cadence.benchmark.overall, 1);

    const correction = await DB.prepare("SELECT * FROM mentor_lessons WHERE job_id=? AND kind='TEACHER_CORRECTION'").bind(JOB).first();
    assert.ok(correction);
    assert.equal(correction.outcome, 'SUCCEEDED');
    assert.equal(Number(correction.score), 1);
    const evidence = JSON.parse(correction.evidence_json);
    assert.equal(evidence.validated, true);
    assert.match(evidence.before, /approbation.*SHA périmé/i);
    assert.match(evidence.after, /validée et testée/i);
    assert.match(evidence.rationale, /SHA courant/i);
    assert.ok(evidence.tests.some((row) => /full-candidate-ci#5151:success/.test(row)));
  } finally {
    DB.close();
  }
});


test('verified autonomy completion automatically ingests exact-SHA validated learning handoffs with provenance', async () => {
  const DB = sqliteD1();
  try {
    const repository = await approvedRepository();
    const learningHandoff = {
      validated: true,
      provenance: {
        path: '.agents/WEEKLY_HANDOFF_20260923.md',
        sha: SHA,
        commit: SHA,
      },
      experience: {
        id: 'xp-runtime-handoff-1',
        source: 'chatgpt-teacher',
        domain: 'learning-governance',
        task: 'Ingérer automatiquement un handoff validé dans le cycle autonome.',
        input: 'Une complétion autonome validée apporte une nouvelle XP prouvée.',
        before: 'Laisser la XP dans le handoff sans l’injecter dans le LearningEngine.',
        after: 'Après preuve full-candidate-ci, ingérer automatiquement la XP avec provenance exacte et déduplication.',
        rationale: 'Le cycle autonome doit transformer les handoffs validés en apprentissage durable sans intervention manuelle.',
        tests: ['full-candidate-ci#5151:success'],
        tags: ['handoff', 'autonomy', 'learning'],
        validated: true,
        quality: 1,
        created_at: 1790112000000,
      },
    };

    const result = await reconcileRuntimeCompletions({
      repository,
      env: { DB, MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      fetchImpl: fetchImpl({ learning_handoffs: [learningHandoff] }),
    });

    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0].handoffs_ingested, 1);

    const stored = await repository.get(JOB);
    assert.equal(stored.result_json.autonomy_completion.mentor_learning.handoff_corrections_recorded, 1);
    assert.equal(stored.result_json.autonomy_completion.mentor_learning.handoff_ingestion.accepted[0].id, 'xp-runtime-handoff-1');

    const correction = await DB.prepare("SELECT * FROM mentor_lessons WHERE kind='TEACHER_CORRECTION'").first();
    assert.ok(correction);
    const evidence = JSON.parse(correction.evidence_json);
    assert.equal(evidence.id, 'xp-runtime-handoff-1');
    assert.deepEqual(evidence.handoff_provenance, {
      path: '.agents/WEEKLY_HANDOFF_20260923.md',
      sha: SHA,
      commit: SHA,
    });
  } finally {
    DB.close();
  }
});

test('autonomy completion rejects a handoff whose provenance SHA is not the CI-verified candidate SHA', async () => {
  const DB = sqliteD1();
  try {
    const repository = await approvedRepository();
    const result = await reconcileRuntimeCompletions({
      repository,
      env: { DB, MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_TEACHER_BRANCH: BRANCH },
      fetchImpl: fetchImpl({
        learning_handoffs: [{
          validated: true,
          provenance: { path: '.agents/BAD.md', sha: 'c'.repeat(40) },
          experience: {
            id: 'xp-runtime-handoff-bad-sha',
            source: 'chatgpt-teacher',
            domain: 'learning-governance',
            task: 'Reject stale handoff provenance.',
            input: 'A stale handoff is presented.',
            before: 'Accept stale provenance.',
            after: 'Reject stale provenance.',
            rationale: 'Exact-SHA provenance is required.',
            tests: ['proof'],
            tags: ['handoff'],
            validated: true,
            quality: 1,
            created_at: 1790112000001,
          },
        }],
      }),
    });

    assert.equal(result.completed.length, 1);
    assert.equal(result.completed[0].handoffs_ingested, 0);
    const stored = await repository.get(JOB);
    const ingestion = stored.result_json.autonomy_completion.mentor_learning.handoff_ingestion;
    assert.equal(ingestion.accepted.length, 0);
    assert.equal(ingestion.rejected.length, 1);
    assert.ok(ingestion.rejected[0].issues.includes('provenance:sha-mismatch'));
  } finally {
    DB.close();
  }
});
