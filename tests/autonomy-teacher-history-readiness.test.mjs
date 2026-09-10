import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { getAutonomyReadiness } from '../src/evolution/autonomy-readiness.js';

test('a correlated runtime Teacher reply remains readiness evidence after NEEDS_CHANGES starts a new request', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({
    id: 'revision-history-job',
    requested_by: 'mel-autonomy',
    goal: 'revise plan',
    optional_context: { roadmap_id: 'MEL-WORK-01' },
  });
  await repository.update(job.id, {
    status: 'WAITING_TEACHER',
    result_json: {
      teacher_bridge_history: [{
        status: 'ANSWERED',
        reviewed_at: '2026-09-10T05:00:00Z',
        request: {
          request_id: 'runtime-old-request',
          provenance: { source: 'MEL_RUNTIME_CRON' },
        },
        review: {
          request_id: 'runtime-old-request',
          verdict: 'NEEDS_CHANGES',
        },
      }],
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request: {
          request_id: 'runtime-new-request',
          provenance: { source: 'MEL_RUNTIME_CRON', revision_of: 'runtime-old-request' },
        },
        review: null,
      },
    },
  });

  const readiness = await getAutonomyReadiness({ repository });
  assert.equal(readiness.gates.runtime_teacher_round_trip, true);
  assert.equal(readiness.evidence.runtime_teacher_round_trip.request_id, 'runtime-old-request');
  assert.equal(readiness.evidence.runtime_teacher_round_trip.verdict, 'NEEDS_CHANGES');
  assert.equal(readiness.evidence.runtime_teacher_round_trip.source, 'history');
  assert.equal(readiness.self_development_ready, false, 'other proof gates are still required');
});

test('non-runtime historical replies do not count as a live Teacher round-trip', async () => {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const job = await repository.create({ id: 'non-runtime-history', requested_by: 'mel-autonomy', goal: 'x' });
  await repository.update(job.id, {
    result_json: {
      teacher_bridge_history: [{
        status: 'ANSWERED',
        request: { request_id: 'manual', provenance: { source: 'FILE_EXERCISE' } },
        review: { request_id: 'manual', verdict: 'APPROVE_PLAN' },
      }],
    },
  });
  const readiness = await getAutonomyReadiness({ repository });
  assert.equal(readiness.gates.runtime_teacher_round_trip, false);
  assert.ok(readiness.blockers.includes('LIVE_TEACHER_ROUND_TRIP_NOT_PROVEN'));
});
