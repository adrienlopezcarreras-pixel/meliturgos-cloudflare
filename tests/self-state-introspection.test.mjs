import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { inferSelfStateIntent, injectEvolutionPreflightCapability } from '../src/evolution/chat-intent.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';

const HEAD = '1111111111111111111111111111111111111111';

async function fakeGitHubFetch(url) {
  const value = String(url);
  if (value.includes('/git/ref/heads/')) {
    return Response.json({ object: { sha: HEAD } });
  }
  if (value.includes('/contents/src/index.js')) {
    const source = 'export default {};\n';
    return Response.json({
      type: 'file',
      size: source.length,
      sha: '2222222222222222222222222222222222222222',
      content: btoa(source),
    });
  }
  return new Response('{}', { status: 404 });
}

test('combined MEL self-observation question routes read-only before development mutation intent', async () => {
  const text = "est ce que tu vois tous les changements qu'on est en train de t'implementer et toutes les mémoires que tu récupères de chat gpt ?";
  assert.deepEqual(inferSelfStateIntent(text), { id: 'self.state', input: {} });

  const request = new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const body = await (await injectEvolutionPreflightCapability(request)).json();
  assert.deepEqual(body.capability, { id: 'self.state', input: {} });
  assert.deepEqual(body.intent_routing, { mode: 'deterministic', intent: 'SELF_STATE', confidence: 1 });
});

test('ordinary implementation request is not swallowed by self-state routing', async () => {
  const text = 'implémente un bouton de diagnostic dans le chat';
  assert.equal(inferSelfStateIntent(text), null);
  const request = new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, conversation_id: 'self-state-test' }),
  });
  const body = await (await injectEvolutionPreflightCapability(request)).json();
  assert.equal(body.capability?.id, 'evolution.enqueue');
});

test('self.state aggregates bounded live evidence without mutating product state', async () => {
  const DB = sqliteD1();
  try {
    const runtime = createGen2Runtime({
      env: {
        DB,
        MELITURGOS_USER: 'owner',
        MEL_GITHUB_REPOSITORY: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
        MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
        MEL_GITHUB_FETCH: fakeGitHubFetch,
      },
    });

    const descriptor = runtime.bus.list().find(row => row.id === 'self.state');
    assert.ok(descriptor);
    assert.equal(descriptor.risk, 'LOW');
    assert.equal(descriptor.enabled, true);

    const result = await runtime.bus.execute('self.state', {}, {
      owner: 'owner',
      permissions: [],
      requestId: 'self-state-test',
    });

    assert.equal(result.ok, true);
    assert.equal(result.scope, 'bounded_read_only_runtime_observation');
    assert.equal(result.sections.memory.ok, true);
    assert.equal(result.sections.work.ok, true);
    assert.equal(result.sections.work.data.open_only, true);
    assert.equal(result.sections.system.ok, true);
    assert.equal(result.sections.chatgpt_import.ok, true);
    assert.equal(result.sections.chatgpt_import.data.status, 'ONLINE');
    assert.equal(result.sections.code.ok, true);
    assert.equal(result.sections.code.data.head, HEAD);
    assert.equal(result.sections.code.data.branch, 'candidate/mel-clean-autonomy');
    assert.match(result.interpretation.uncommitted_boundary, /not been committed/i);
  } finally {
    DB.close();
  }
});


test('self-state intent recognizes current ChatGPT memory observation phrasing', () => {
  assert.deepEqual(
    inferSelfStateIntent('tu vois les mémoires que tu récupères de ChatGPT maintenant ?'),
    { id: 'self.state', input: {} }
  );
});

test('response improvement request remains a development request, not self observation', async () => {
  const text = 'améliore encore tes réponses et ton raisonnement';
  assert.equal(inferSelfStateIntent(text), null);
  const request = new Request('https://mel.example/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, conversation_id: 'quality-dev' }),
  });
  const body = await (await injectEvolutionPreflightCapability(request)).json();
  assert.equal(body.capability?.id, 'evolution.enqueue');
});
