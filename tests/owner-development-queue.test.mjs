import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { enqueueOwnerDevelopmentRequest, enqueueSupervisedDevelopmentRequest } from '../src/evolution/owner-development-queue.js';

const CANDIDATE_HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';

function fixture() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const aiCalls = [];
  const fetchCalls = [];
  const env = {
    MELITURGOS_USER: 'test',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_BRANCH: CANDIDATE_BRANCH,
    MEL_TEACHER_BRANCH: CANDIDATE_BRANCH,
    MEL_TEACHER_APPROVED_BRANCH: CANDIDATE_BRANCH,
    AI: {
      async run(model) {
        aiCalls.push(model);
        return { response: `Independent state-of-play from ${model}` };
      },
    },
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    fetchCalls.push(target);
    if (target.includes('/commits/candidate%2Fmel-clean-autonomy')) return Response.json({ sha: CANDIDATE_HEAD_SHA });
    if (target.startsWith('https://api.github.com/')) return new Response('rate-limit fixture', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) {
      return new Response('export const fixture = true;\n// candidate source\n', { status: 200, headers: { etag: 'fixture' } });
    }
    return new Response('not found', { status: 404 });
  };
  return { repository, env, aiCalls, fetchCalls, fetchImpl };
}

test('owner development request persists, runs Council first, inspects candidate code and waits for Teacher', async () => {
  const f = fixture();
  const result = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Développe une compétence calendrier',
    conversationId: 'conversation-1',
    requestKey: 'message-1',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.requested_by, 'owner-chat');
  assert.equal(result.status, 'WAITING_TEACHER');
  assert.equal(result.teacher.status, 'WAITING_TEACHER');
  assert.ok(result.teacher.request_id);
  assert.equal(result.candidate_only, true);
  assert.equal(result.zero_added_cost, true);
  assert.ok(f.aiCalls.length >= 2, 'Council-first must call at least two explicitly zero-cost configured models');
  assert.ok(f.fetchCalls.some((url) => url.includes('raw.githubusercontent.com')), 'candidate code must be inspected before Teacher review');

  const stored = await f.repository.get(result.job_id);
  assert.equal(stored.status, 'WAITING_TEACHER');
  assert.equal(stored.requested_by, 'owner-chat');
  assert.equal(stored.optional_context.rule, 'AI_COUNCIL_BEFORE_CODE');
  assert.ok(stored.plan_json.preflight.council);
  assert.equal(stored.result_json.teacher_bridge.status, 'WAITING_TEACHER');
  assert.equal(stored.result_json.teacher_bridge.request.candidate.sha, CANDIDATE_HEAD_SHA);
});

test('live capability inventory turns a real owner gap into a persisted Module Lab need before any code generation', async () => {
  const f = fixture();
  const result = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Développe une compétence de spectrométrie stellaire inconnue',
    conversationId: 'conversation-gap',
    requestKey: 'message-gap',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
    capabilities: [],
  });

  assert.equal(result.created, true);
  assert.equal(result.status, 'WAITING_TEACHER');
  const stored = await f.repository.get(result.job_id);
  assert.equal(stored.optional_context.module_proposal.decision, 'PROPOSE_MODULE');
  assert.equal(stored.optional_context.module_proposal.gap_classification, 'POSSIBLE_GAP');
  assert.equal(stored.optional_context.module_proposal.activation_allowed, false);
  assert.equal(stored.plan_json.module_lab.stage, 'need');
  assert.equal(stored.plan_json.module_lab.status, 'NEED_READY');
  assert.equal(stored.plan_json.module_lab.code_generation_allowed, false);
  assert.equal(stored.plan_json.module_lab.activation_allowed, false);
  assert.equal(stored.plan_json.module_lab.teacher_required, true);
  assert.ok(stored.plan_json.module_lab.manifest_id.startsWith('mel-'));
});

test('live capability inventory reuses a healthy match instead of creating duplicate development work', async () => {
  const f = fixture();
  const result = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Développe une compétence de recherche web',
    conversationId: 'conversation-reuse',
    requestKey: 'message-reuse',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
    capabilities: [{
      id: 'web.research',
      name: 'Recherche web',
      category: 'web',
      description: 'research search web internet recherche',
      health: 'HEALTHY',
      enabled: true,
    }],
  });

  assert.equal(result.created, false);
  assert.equal(result.job_id, null);
  assert.equal(result.status, 'REUSE_EXISTING');
  assert.equal(result.gap.classification, 'MATCHED_AVAILABLE');
  assert.equal(result.gap.matched_capability, 'web.research');
  assert.equal(f.aiCalls.length, 0, 'no Council cost/work is spent on a capability that already exists');
  const jobs = (await f.repository.list()).filter((job) => job.requested_by === 'owner-chat');
  assert.equal(jobs.length, 0);
});

test('replaying the same owner message is idempotent and does not repeat the Council', async () => {
  const f = fixture();
  const input = {
    env: f.env,
    goal: 'Ajoute un module calendrier',
    conversationId: 'conversation-2',
    requestKey: 'message-2',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  };
  const first = await enqueueOwnerDevelopmentRequest(input);
  const calls = f.aiCalls.length;
  const second = await enqueueOwnerDevelopmentRequest(input);
  assert.equal(second.created, false);
  assert.equal(second.job_id, first.job_id);
  assert.equal(second.status, 'WAITING_TEACHER');
  assert.equal(f.aiCalls.length, calls, 'same message must not repeat Council work');
  const jobs = (await f.repository.list()).filter((job) => job.requested_by === 'owner-chat');
  assert.equal(jobs.length, 1);
});

test('two distinct owner message ids can intentionally request two distinct jobs', async () => {
  const f = fixture();
  const first = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Ajoute un module calendrier',
    conversationId: 'conversation-3',
    requestKey: 'message-a',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  });
  const second = await enqueueOwnerDevelopmentRequest({
    env: f.env,
    goal: 'Ajoute un module calendrier',
    conversationId: 'conversation-3',
    requestKey: 'message-b',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
  });
  assert.notEqual(second.job_id, first.job_id);
  assert.equal(second.created, true);
});

test('owner queue requires durable D1 when no test repository is injected', async () => {
  await assert.rejects(
    () => enqueueOwnerDevelopmentRequest({
      env: { AI: { run: async () => ({ response: 'x' }) } },
      goal: 'Développe une compétence calendrier',
    }),
    (error) => error?.code === 'DB_BINDING_MISSING',
  );
});

test('owner queue refuses a non-candidate Teacher branch fail-closed', async () => {
  const f = fixture();
  f.env.MEL_TEACHER_BRANCH = 'main';
  await assert.rejects(
    () => enqueueOwnerDevelopmentRequest({
      env: f.env,
      goal: 'Développe une compétence calendrier',
      conversationId: 'conversation-4',
      requestKey: 'message-4',
      repository: f.repository,
      fetchImpl: f.fetchImpl,
    }),
    (error) => error?.code === 'AUTONOMY_BRANCH_NOT_CANDIDATE' || error?.code === 'AUTONOMY_CANDIDATE_BRANCH_DIVERGENCE',
  );
});


test('ecosystem discovery can enqueue one blocked existing capability for Council/Teacher without creating a duplicate capability', async () => {
  const f = fixture();
  const input = {
    env: f.env,
    goal: 'Débloquer la capacité existante media.music.generate sans créer de doublon.',
    requestKey: 'capability:music.generate',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
    capabilities: [{
      id: 'media.music.generate',
      name: 'Création musicale',
      category: 'creative-media',
      description: 'music.generate music generation composition soundtrack',
      health: 'UNAVAILABLE',
      enabled: true,
    }],
    requestedBy: 'mel-autonomy',
    source: 'ecosystem-watch',
    priority: 'P1',
    extensionKind: 'plugin',
    allowBlockedExisting: true,
    targetCapabilityId: 'media.music.generate',
    roadmapId: 'GEN2-42',
    inspectionPaths: ['src/capabilities/creative-media-capabilities.js'],
    inspectionQueries: ['media.music.generate', 'GEN2-42'],
    evidence: {
      fingerprint: 'capability:music.generate',
      capability_hint: 'music.generate',
      citations_count: 2,
      observed_on: ['watch_audio_music'],
      sources: [{ title: 'Official docs', url: 'https://example.com/music' }],
      source_watch_sha: CANDIDATE_HEAD_SHA,
    },
  };

  const first = await enqueueSupervisedDevelopmentRequest(input);
  assert.equal(first.created, true);
  assert.equal(first.requested_by, 'mel-autonomy');
  assert.equal(first.source, 'ecosystem-watch');
  assert.equal(first.priority, 'P1');
  assert.equal(first.status, 'WAITING_TEACHER');
  assert.ok(first.teacher.request_id);

  const stored = await f.repository.get(first.job_id);
  assert.equal(stored.optional_context.extension_proposal.decision, 'UNBLOCK_EXISTING');
  assert.equal(stored.optional_context.extension_proposal.matched_capability, 'media.music.generate');
  assert.equal(stored.optional_context.extension_kind, 'plugin');
  assert.equal(stored.optional_context.discovery_evidence.fingerprint, 'capability:music.generate');
  assert.equal(stored.optional_context.roadmap_id, 'GEN2-42');
  assert.ok(stored.optional_context.inspection_paths.includes('src/capabilities/creative-media-capabilities.js'));
  assert.equal(stored.plan_json?.module_lab, undefined, 'unblocking an existing capability must not create a duplicate Module Lab module');

  const calls = f.aiCalls.length;
  const replay = await enqueueSupervisedDevelopmentRequest(input);
  assert.equal(replay.created, false);
  assert.equal(replay.job_id, first.job_id);
  assert.equal(f.aiCalls.length, calls, 'fingerprint replay must not repeat Council work');
});


test('ecosystem discovery can enqueue supervised optimization of a healthy existing capability without creating a duplicate module', async () => {
  const f = fixture();
  const input = {
    env: f.env,
    goal: 'Optimiser la capacité existante web.research à partir d’une alternative sourcée, comparer à la roadmap et conserver le choix actuel sans gain reproductible.',
    requestKey: 'capability:web.research',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
    capabilities: [{
      id: 'web.research',
      name: 'Recherche web',
      category: 'web',
      description: 'research search web internet recherche sources',
      health: 'HEALTHY',
      enabled: true,
    }],
    requestedBy: 'mel-autonomy',
    source: 'ecosystem-watch',
    priority: 'P1',
    extensionKind: 'plugin',
    allowExistingOptimization: true,
    targetCapabilityId: 'web.research',
    roadmapId: 'GEN2-42',
    inspectionPaths: ['src/evaluation/ecosystem-discovery-planner.js'],
    inspectionQueries: ['web.research', 'GEN2-42'],
    evidence: {
      fingerprint: 'capability:web.research',
      capability_hint: 'web.research',
      citations_count: 3,
      observed_on: ['watch_plugins_connectors'],
      sources: [{ title: 'Official docs', url: 'https://example.com/research' }],
      source_watch_sha: CANDIDATE_HEAD_SHA,
    },
  };

  const first = await enqueueSupervisedDevelopmentRequest(input);
  assert.equal(first.created, true);
  assert.equal(first.status, 'WAITING_TEACHER');
  assert.ok(first.teacher.request_id);

  const stored = await f.repository.get(first.job_id);
  assert.equal(stored.optional_context.optimization_existing, true);
  assert.equal(stored.optional_context.extension_proposal.decision, 'OPTIMIZE_EXISTING');
  assert.equal(stored.optional_context.extension_proposal.gap_classification, 'MATCHED_AVAILABLE');
  assert.equal(stored.optional_context.extension_proposal.matched_capability, 'web.research');
  assert.equal(stored.optional_context.extension_proposal.manifest, null);
  assert.equal(stored.optional_context.module_proposal, undefined);
  assert.equal(stored.plan_json?.module_lab, undefined, 'optimizing an existing capability must not enter Module Lab as a new module');

  const calls = f.aiCalls.length;
  const replay = await enqueueSupervisedDevelopmentRequest(input);
  assert.equal(replay.created, false);
  assert.equal(replay.job_id, first.job_id);
  assert.equal(f.aiCalls.length, calls, 'optimization fingerprint replay must remain idempotent');
});

test('exact blocked target wins over generic available matches in a sourced ecosystem handoff', async () => {
  const f = fixture();
  const goal = [
    'Débloquer la capacité existante media.video.generate sans créer de capacité en doublon.',
    'Évaluer la découverte sourcée « video.generate » et, seulement si elle est adaptée,',
    'brancher le provider/connecteur zéro coût autorisé minimal sur le port canonique existant.',
    'Conserver les permissions, le fail-closed, les tests, la provenance et le rollback.',
  ].join(' ');

  const result = await enqueueSupervisedDevelopmentRequest({
    env: f.env,
    goal,
    requestKey: 'capability:video.generate',
    repository: f.repository,
    fetchImpl: f.fetchImpl,
    capabilities: [
      {
        id: 'media.video.generate',
        name: 'Génération vidéo',
        category: 'creative-media',
        description: 'video.generate video generation cinema creation',
        health: 'UNAVAILABLE',
        enabled: true,
      },
      {
        id: 'provider.registry',
        name: 'Provider connector registry',
        category: 'tooling',
        description: 'provider connector canonical integration permissions provenance tests',
        health: 'HEALTHY',
        enabled: true,
      },
    ],
    requestedBy: 'mel-autonomy',
    source: 'ecosystem-watch',
    priority: 'P1',
    extensionKind: 'plugin',
    allowBlockedExisting: true,
    targetCapabilityId: 'media.video.generate',
    roadmapId: 'GEN2-42',
    inspectionPaths: ['src/capabilities/creative-media-capabilities.js'],
    inspectionQueries: ['media.video.generate', 'GEN2-42'],
    evidence: {
      fingerprint: 'capability:video.generate',
      capability_hint: 'video.generate',
      citations_count: 2,
      observed_on: ['watch_video_cinema'],
      sources: [{ title: 'Official video docs', url: 'https://example.com/video' }],
      source_watch_sha: CANDIDATE_HEAD_SHA,
    },
  });

  assert.equal(result.created, true);
  assert.equal(result.status, 'WAITING_TEACHER');
  assert.ok(result.job_id);
  const stored = await f.repository.get(result.job_id);
  assert.equal(stored.optional_context.extension_proposal.decision, 'UNBLOCK_EXISTING');
  assert.equal(stored.optional_context.extension_proposal.gap_classification, 'MATCHED_BUT_BLOCKED');
  assert.equal(stored.optional_context.extension_proposal.matched_capability, 'media.video.generate');
});
