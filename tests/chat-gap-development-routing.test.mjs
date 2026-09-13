import test from 'node:test';
import assert from 'node:assert/strict';
import { injectEvolutionPreflightCapability } from '../src/evolution/chat-intent.js';
import { enqueueOwnerDevelopmentRequest } from '../src/evolution/owner-development-queue.js';

test('natural development request reuses an existing capability without duplicate module work', async () => {
  const request = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: 'Développe une capacité de recherche dans le code source du dépôt',
      conversation_id: 'conv-gap-reuse-1',
      client_message_id: 'msg-gap-reuse-1',
    }),
  });

  const prepared = await injectEvolutionPreflightCapability(request);
  const body = await prepared.json();

  assert.equal(body.capability?.id, 'evolution.enqueue');
  assert.equal(body.capability?.input?.conversationId, 'conv-gap-reuse-1');
  assert.equal(body.capability?.input?.requestKey, 'msg-gap-reuse-1');

  const result = await enqueueOwnerDevelopmentRequest({
    env: {},
    goal: body.capability.input.goal,
    conversationId: body.capability.input.conversationId,
    requestKey: body.capability.input.requestKey,
    capabilities: [{
      id: 'code.search',
      name: 'Recherche sécurisée dans le dépôt',
      category: 'code',
      description: 'Recherche dans le code source et le dépôt GitHub existant.',
      enabled: true,
      health: 'HEALTHY',
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.job_id, null);
  assert.equal(result.status, 'REUSE_EXISTING');
  assert.equal(result.gap?.classification, 'MATCHED_AVAILABLE');
  assert.equal(result.gap?.matched_capability, 'code.search');
  assert.equal(result.teacher, null);
  assert.equal(result.module_proposal?.decision, 'REUSE_EXISTING');
  assert.equal(result.module_proposal?.proposal_only, true);
  assert.equal(result.module_proposal?.activation_allowed, false);
});
