import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';

const context = { owner: 'adrien', permissions: [], requestId: 'test' };

test('default CapabilityBus exposes real planning, memory, diagnostics, Council and orchestration capabilities', () => {
  const bus = createDefaultCapabilityBus({ env: { MELITURGOS_USER: 'adrien' }, fetchImpl: async () => new Response('', { status: 503 }) });
  const ids = new Set(bus.list().map(x => x.id));
  for (const id of ['echo','code.read','code.search','augmentio.fanout','council.state-of-play','evolution.preflight','roadmap.read','system.bindings','rag.search','conversation.list','chatgpt.archive.preview']) {
    assert.ok(ids.has(id), `missing ${id}`);
  }
  assert.ok(ids.size >= 11);
});

test('roadmap and system diagnostics execute through CapabilityBus', async () => {
  const bus = createDefaultCapabilityBus({ env: { MELITURGOS_USER: 'adrien', AI: {}, DB: {} }, fetchImpl: async () => new Response('', { status: 503 }) });
  const roadmap = await bus.execute('roadmap.read', {}, context);
  assert.equal(roadmap.ok, true);
  assert.ok(roadmap.summary.total >= 90);
  const bindings = await bus.execute('system.bindings', {}, context);
  assert.equal(bindings.ai, true);
  assert.equal(bindings.db, true);
  assert.equal(bindings.owner_configured, true);
});

test('augmentio.fanout CapabilityBus handler runs actual configured zero-cost models', async () => {
  const calls = [];
  const env = {
    MELITURGOS_USER: 'adrien',
    AI: { run: async (model, payload) => { calls.push({ model, payload }); return { response: 'réponse '+model }; } }
  };
  const bus = createDefaultCapabilityBus({ env, fetchImpl: async () => new Response('', { status: 503 }) });
  const result = await bus.execute('augmentio.fanout', { input: 'état des lieux', maxCandidates: 3 }, context);
  assert.ok(result.best?.text);
  assert.ok(result.candidates.length >= 1);
  assert.ok(calls.length >= 1);
  assert.ok(result.providersAttempted.every(x => x.startsWith('workers-ai:')));
});

test('Council and evolution capabilities consult multiple AIs before permitting code inspection', async () => {
  const calls = [];
  const env = {
    MELITURGOS_USER: 'adrien',
    AI: { run: async model => { calls.push(model); return { response: 'diagnostic '+model }; } }
  };
  const bus = createDefaultCapabilityBus({ env, fetchImpl: async () => new Response('', { status: 503 }) });
  const council = await bus.execute('council.state-of-play', { goal: 'ajouter agenda', minResponses: 2 }, context);
  assert.equal(council.status, 'COMPLETE');
  assert.ok(council.responses.length >= 2);
  const preflight = await bus.execute('evolution.preflight', { goal: 'ajouter agenda', minResponses: 2 }, context);
  assert.equal(preflight.stage, 'AI_STATE_OF_PLAY_COMPLETE');
  assert.equal(preflight.code_generation_allowed, false);
  assert.equal(preflight.code_inspection_allowed, true);
  assert.ok(calls.length >= 4);
});

test('Gen2 roadmap, RAG and conversation-list HTTP routes stay behind CapabilityBus', async () => {
  const source = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /getRoadmapPayload/);
  assert.doesNotMatch(source, /RAGService\.search/);
  assert.doesNotMatch(source, /SELECT id, title, status, created_at, updated_at FROM conversations/);
  assert.match(source, /runtime\.bus\.execute\("roadmap\.read"/);
  assert.match(source, /runtime\.bus\.execute\("rag\.search"/);
  assert.match(source, /runtime\.bus\.execute\("conversation\.list"/);
});

test('commercial MEL free-only mode excludes unconfigured paid-optional Vercel capabilities without hiding Cloudflare alternatives', async () => {
  const bus = createDefaultCapabilityBus({
    env: { MELITURGOS_USER: 'owner' },
    fetchImpl: async () => { throw new Error('provider must not be called during inventory'); },
  });
  const ids = new Set(bus.list().map(row => row.id));
  assert.ok(ids.has('cloudflare.workers.read'));
  assert.ok(ids.has('cloudflare.deployments.read'));
  assert.ok(ids.has('cloudflare.deployments.create'));
  assert.equal([...ids].filter(id => id.startsWith('vercel.')).length, 0);
  const bindings = await bus.execute('system.bindings', {}, { owner:'owner', permissions: [] });
  assert.equal(bindings.vercel_optional_excluded_free_only, true);
  assert.equal(bindings.vercel_control_configured, false);
  assert.equal(bindings.free_deployment_provider, 'cloudflare');
});

test('Vercel capabilities stay excluded even when a token and legacy opt-in flag exist', () => {
  const env = { MELITURGOS_USER:'owner', VERCEL_TOKEN:'configured-but-not-approved', MEL_ENABLE_OPTIONAL_VERCEL:'true' };
  const bus = createDefaultCapabilityBus({ env });
  assert.equal(bus.list().filter(row => row.provider === 'vercel').length, 0);
  const bindings = bus.list().find(row => row.id === 'system.bindings');
  assert.ok(bindings);
});

// MEL-CHAT-08: one identifier from validation to render; quota, timeout and
// replay never produce a false success nor a double action.
test('MEL-CHAT-08: dispatch contracts share one identifier and refuse false success or double action', async () => {
  const { CapabilityBus } = await import('../src/capabilities/capability-bus.js');
  const audits = [];
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false };
  const record = id => ({ id, name: id, category: 'test', version: '1.0.0', provider: 'test', description: id,
    input_schema: { type: 'object', properties: {}, additionalProperties: false }, output_schema: schema,
    risk: 'LOW', permissions: [], health: 'OK', enabled: true });
  let runs = 0;
  const bus = new CapabilityBus({ audit: async e => { audits.push(e); } });
  bus.discover(record('test.write'), async () => { runs++; return { ok: true }; });
  bus.discover(record('test.bad'), async () => ({ unexpected: true }));

  const detailed = await bus.executeDetailed('test.write', {}, { owner: 'o', requestId: 'req-1', idempotencyKey: 'key-1' });
  assert.match(detailed.execution_id, /^[0-9a-f-]{8,64}$/i);
  assert.equal(detailed.capability, 'test.write');
  assert.deepEqual(detailed.output, { ok: true });
  const ids = audits.filter(e => e.capability === 'test.write').map(e => e.id);
  assert.equal(new Set(ids).size, 1, 'every audit row of one call shares the identifier');
  assert.equal(ids[0], detailed.execution_id, 'the caller and the render share that same identifier');

  await assert.rejects(bus.execute('test.write', {}, { owner: 'o', requestId: 'req-1', idempotencyKey: 'key-1' }), e => e.code === 'CAPABILITY_REPLAY_REFUSED');
  assert.equal(runs, 1, 'a replayed dispatch never runs the action twice');
  await bus.execute('test.write', {}, { owner: 'o', requestId: 'req-1' });
  assert.equal(runs, 2, 'without an idempotency key an ordinary second call still runs');
  assert.ok(audits.some(e => e.reason === 'CAPABILITY_REPLAY_REFUSED'));

  await assert.rejects(bus.execute('test.bad', {}, { owner: 'o' }), e =>
    e.output_contract_violation === true && e.action_may_have_run === true && typeof e.execution_id === 'string');
  assert.ok(!audits.some(e => e.capability === 'test.bad' && e.status === 'SUCCEEDED'), 'a broken output is never a success');
});

test('MEL-CHAT-08: Google quota and timeout are typed and say whether the action may have run', async () => {
  const mod = await import('../src/capabilities/google-workspace-capabilities.js');
  assert.equal(typeof mod.registerGoogleWorkspaceCapabilities, 'function');
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('src/capabilities/google-workspace-capabilities.js', 'utf8');
  assert.match(source, /retryable: true, action_may_have_run: false/);
  assert.match(source, /retryable: method === 'GET', action_may_have_run: method !== 'GET'/);
});

// MEL-MANIFEST-03: a validated delivery registers ONE descriptor; red CI, name
// conflict or missing proof stop the registration.
test('MEL-MANIFEST-03: only a validated delivery registers a skill on the canonical bus', async () => {
  const { CapabilityBus, registerDeliveredSkill, skillDeliveryDescriptor } = await import('../src/capabilities/capability-bus.js');
  const sha = 'a'.repeat(40);
  const good = { capability_id: 'skill.new', candidate_sha: sha, ci_passed: true, ci_run_id: 42, roadmap_id: 'MEL-X-01' };
  const record = { id: 'skill.new', name: 'n', category: 'test', version: '1.0.0', provider: 'p', description: 'd',
    input_schema: { type: 'object', additionalProperties: false }, output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'OK', enabled: true };

  const bus = new CapabilityBus();
  const descriptor = registerDeliveredSkill(bus, good, record, async () => ({}));
  assert.equal(descriptor.capability_id, 'skill.new');
  assert.equal(descriptor.candidate_sha, sha);
  assert.equal(descriptor.ci_run_id, 42);
  assert.ok(bus.records.has('skill.new'), 'the skill exists on the one canonical bus');

  // Registered twice: a name conflict, never a silent overwrite.
  assert.throws(() => registerDeliveredSkill(bus, good, record, async () => ({})), e => e.code === 'SKILL_DELIVERY_NAME_CONFLICT');

  for (const [patch, code] of [[{ ci_passed: false }, 'SKILL_DELIVERY_CI_RED'], [{ ci_run_id: 0 }, 'SKILL_DELIVERY_PROOF_REQUIRED'],
    [{ candidate_sha: 'main' }, 'SKILL_DELIVERY_SHA_REQUIRED'], [{ capability_id: 'X' }, 'SKILL_DELIVERY_ID_INVALID']]) {
    assert.throws(() => skillDeliveryDescriptor({ ...good, ...patch }), e => e.code === code, code);
  }
  assert.throws(() => registerDeliveredSkill(new CapabilityBus(), good, { ...record, id: 'autre' }, async () => ({})),
    e => e.code === 'SKILL_DELIVERY_ID_MISMATCH');
});
