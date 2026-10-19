import test from 'node:test';
import assert from 'node:assert/strict';
import { injectEvolutionPreflightCapability } from '../src/evolution/chat-intent.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

test('the real bus persists a missing skill once even while Council providers are unavailable', async () => {
  const DB = sqliteD1();
  const pending = [];
  try {
    const repository = new D1DevJobRepository(DB);
    await repository.init();
    const runtime = createGen2Runtime({
      env: {
        DB,
        MEL_GITHUB_REPOSITORY: 'owner/repo',
        MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
        MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
      },
      fetchImpl: async () => new Response('fixture restricted', { status: 403 }),
    });
    const input = { goal: 'Spectrométrie stellaire tomographique', conversationId: 'durable-gap', requestKey: 'same-owner-message' };
    const context = { owner: 'owner-chat', permissions: [], waitUntil: promise => pending.push(promise) };
    const first = await runtime.bus.execute('evolution.enqueue', input, context);
    assert.equal(first.created, true);
    assert.equal(first.status, 'QUEUED');
    assert.equal(first.preflight_scheduled, true);
    const again = await runtime.bus.execute('evolution.enqueue', input, context);
    assert.equal(again.created, false);
    assert.equal(again.job_id, first.job_id);
    assert.equal(pending.length, 1);
    await Promise.all(pending);
    const jobs = await repository.list();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, first.job_id);
    assert.equal(jobs[0].status, 'QUEUED');
    assert.equal(jobs[0].approval_status, 'PENDING');
    assert.equal(jobs[0].optional_context.candidate_branch_only, true);
  } finally { DB.close(); }
});

test('natural chat development intent crosses CapabilityBus and reuses existing code.search without persistence', async () => {
  const request = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: 'Développe une capacité de recherche dans le code source du dépôt',
      conversation_id: 'conv-gap-bus-e2e-1',
      client_message_id: 'msg-gap-bus-e2e-1',
    }),
  });

  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();

  assert.equal(body.capability?.id, 'evolution.enqueue');
  assert.equal(body.capability?.input?.conversationId, 'conv-gap-bus-e2e-1');
  assert.equal(body.capability?.input?.requestKey, 'msg-gap-bus-e2e-1');

  const audit = [];
  const env = {
    AI: {
      async run() {
        throw new Error('AI_SHOULD_NOT_BE_CALLED_FOR_REUSE');
      },
    },
    DB: {
      prepare() {
        throw new Error('DB_SHOULD_NOT_BE_CALLED_FOR_REUSE');
      },
    },
  };
  const runtime = createGen2Runtime({
    env,
    audit: async (event) => audit.push(event),
  });

  const result = await runtime.bus.execute(
    body.capability.id,
    body.capability.input,
    { owner: 'owner-chat', permissions: [], requestId: 'req-gap-bus-e2e-1' },
  );

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.job_id, null);
  assert.equal(result.status, 'REUSE_EXISTING');
  assert.equal(result.gap?.classification, 'MATCHED_AVAILABLE');
  assert.equal(result.gap?.matched_capability, 'code.search');
  assert.equal(result.module_proposal?.decision, 'REUSE_EXISTING');
  assert.equal(result.module_proposal?.activation_allowed, false);
  assert.deepEqual(
    audit.filter((event) => event.capability === 'evolution.enqueue').map((event) => event.status),
    ['STARTED', 'SUCCEEDED'],
  );
});
