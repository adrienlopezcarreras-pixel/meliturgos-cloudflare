import test from 'node:test';
import assert from 'node:assert/strict';
import { retireObsoleteQueueJobs, KNOWN_LEGACY_OWNER_JOBS } from '../src/evolution/queue-hygiene.js';

function repo(jobs) {
  const rows = new Map(jobs.map(job => [job.id, { ...job }]));
  return {
    async list() { return [...rows.values()]; },
    async update(id, patch) {
      const next = { ...rows.get(id), ...patch, updated_at: Date.now() };
      rows.set(id, next);
      return next;
    },
    rows,
  };
}

test('known legacy owner jobs are archived as CANCELLED, never deleted', async () => {
  const id = [...KNOWN_LEGACY_OWNER_JOBS][0];
  const repository = repo([{ id, status: 'QUEUED', requested_by: 'owner-chat', created_at: 1, updated_at: 2, result_json: {} }]);
  const result = await retireObsoleteQueueJobs(repository, { now: 1000, staleMs: 999999 });
  assert.equal(result.retired.length, 1);
  assert.equal(repository.rows.get(id).status, 'CANCELLED');
  assert.equal(repository.rows.get(id).result_json.queue_retirement.status, 'RETIRED_OBSOLETE');
  assert.equal(result.policy, 'archive-not-delete');
});

test('fresh current owner job is preserved', async () => {
  const repository = repo([{ id: 'owner-chat-current', status: 'QUEUED', requested_by: 'owner-chat', created_at: 900, updated_at: 900, result_json: {} }]);
  const result = await retireObsoleteQueueJobs(repository, { now: 1000, staleMs: 100 });
  assert.equal(result.retired.length, 0);
  assert.equal(repository.rows.get('owner-chat-current').status, 'QUEUED');
});

test('old recovered owner job is retired after stale window', async () => {
  const repository = repo([{
    id: 'owner-chat-recovered',
    status: 'QUEUED',
    requested_by: 'owner-chat',
    created_at: 1,
    updated_at: 100,
    result_json: { passive_state_recovery: { reason: 'TEACHER_APPROVAL_MISSING' } },
  }]);
  const result = await retireObsoleteQueueJobs(repository, { now: 1000, staleMs: 500 });
  assert.equal(result.retired.length, 1);
  assert.equal(repository.rows.get('owner-chat-recovered').status, 'CANCELLED');
});
