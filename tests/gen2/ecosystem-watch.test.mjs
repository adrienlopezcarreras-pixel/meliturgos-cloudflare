import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ECOSYSTEM_WATCH_TARGETS,
  getEcosystemWatchCatalog,
} from '../../src/evaluation/ecosystem-watch-catalog.js';
import { runCapabilityWatch } from '../../src/evaluation/capability-watch.js';
import { planEcosystemDiscoveries, mergeEcosystemDiscoveryLedger, selectEcosystemDiscoveryCandidate, markEcosystemDiscoveryOwnerDecision, markEcosystemDiscoveryHandoff, reconcileEcosystemDiscoveryHandoffs } from '../../src/evaluation/ecosystem-discovery-planner.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';
import { reconcileDiscoveryJobs } from '../../src/evaluation/capability-watch-runtime.js';

test('ecosystem watch catalog is unique and covers AI, tooling and creative arts', () => {
  const catalog = getEcosystemWatchCatalog();
  const ids = catalog.targets.map(row => row.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'watch_openai_chatgpt',
    'watch_anthropic_claude',
    'watch_google_gemini',
    'watch_xai_grok',
    'watch_plugins_connectors',
    'watch_visual_art',
    'watch_audio_music',
    'watch_video_cinema',
  ]) assert.ok(ids.includes(id), id);
  assert.ok(catalog.targets.every(row => row.mode === 'observe' && row.metadata.query));
  const openai = catalog.targets.find(row => row.id === 'watch_openai_chatgpt');
  assert.ok(openai.metadata.sources.length >= 2);
  assert.ok(openai.metadata.sources.some(url => String(url).includes('developers.openai.com/api/docs/changelog')));
});

test('canonical capability watch persists observations without inventing scores', async () => {
  const result = await runCapabilityWatch({
    now: Date.UTC(2026, 8, 18, 9, 0, 0),
    intervalMs: 6 * 60 * 60 * 1000,
    targets: ECOSYSTEM_WATCH_TARGETS.slice(0, 2),
    evaluator: async ({ target }) => ({
      evidence: {
        status: 'OBSERVED',
        summary: target.metadata.label,
        citations_count: 2,
        sources: [{ title: 'Official', url: 'https://example.com' }],
      },
    }),
  });

  assert.equal(result.status, 'RAN');
  assert.equal(result.overall, null);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.results.every(row => row.mode === 'observe' && row.score === null), true);
  assert.equal(Object.keys(result.state.last_observations).length, 2);
});


test('sourced creative watch observations reuse canonical media capabilities before proposing new code', () => {
  const runtime = createGen2Runtime({ env: {} });
  const plan = planEcosystemDiscoveries({
    catalog: getEcosystemWatchCatalog(),
    capabilities: runtime.bus.list(),
    watchResult: {
      status: 'RAN',
      source_sha: 'abc123',
      results: [{
        id: 'watch_visual_art',
        mode: 'observe',
        evidence: {
          status: 'OBSERVED',
          summary: 'Official visual tools observed.',
          citations_count: 1,
          sources: [{ title: 'Official', url: 'https://example.com/visual' }],
          detected_capabilities: ['image.generate', 'art-history'],
        },
      }],
    },
  });
  const generation = plan.items.find(item => item.capability_hint === 'image.generate');
  assert.ok(generation);
  assert.equal(generation.action, 'UNBLOCK_EXISTING');
  assert.equal(generation.best_match.id, 'media.image.generate');
  const artHistory = plan.items.find(item => item.capability_hint === 'art-history');
  assert.ok(artHistory);
  assert.equal(artHistory.action, 'PROPOSE_EXTENSION');
  assert.equal(artHistory.suggested_kind, 'module');
  assert.equal(artHistory.proposal.activation_allowed, false);
});

test('ecosystem discovery planner proposes tooling as plugin and ledger deduplicates across runs', () => {
  const catalog = {
    targets: [{
      id: 'tool-watch',
      metadata: { label: 'Tooling', category: 'tooling', capabilities: ['new-connector'] },
    }],
  };
  const watchResult = {
    status: 'RAN',
    results: [{
      id: 'tool-watch',
      evidence: {
        status: 'OBSERVED',
        citations_count: 2,
        sources: [{ title: 'Docs', url: 'https://example.com/docs' }],
        detected_capabilities: ['new-connector'],
      },
    }],
  };
  const first = planEcosystemDiscoveries({ catalog, watchResult, capabilities: [] });
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0].suggested_kind, 'plugin');
  assert.equal(first.items[0].proposal.decision, 'PROPOSE_PLUGIN');
  assert.match(first.items[0].proposal.manifest.entrypoint, /^src\/plugins\/generated\//);

  const ledger1 = mergeEcosystemDiscoveryLedger({}, first, 100);
  const ledger2 = mergeEcosystemDiscoveryLedger(ledger1, first, 200);
  assert.equal(ledger2.items.length, 1);
  assert.equal(ledger2.items[0].seen_count, 2);
  assert.equal(ledger2.items[0].first_seen_at, 100);
  assert.equal(ledger2.items[0].last_seen_at, 200);
});


test('handoff selector prioritizes unblocking an existing sourced creative capability and only returns one item', () => {
  const ledger = {
    items: [
      {
        fingerprint: 'capability:art-history',
        capability_hint: 'art-history',
        category: 'creative',
        action: 'PROPOSE_EXTENSION',
        evidence_status: 'SOURCED_OBSERVATION',
        citations_count: 3,
        seen_count: 2,
        sources: [{ title: 'A', url: 'https://example.com/a' }],
        proposal: { activation_allowed: false },
        suggested_kind: 'module',
      },
      {
        fingerprint: 'capability:music.generate',
        capability_hint: 'music.generate',
        category: 'creative',
        action: 'UNBLOCK_EXISTING',
        evidence_status: 'SOURCED_OBSERVATION',
        citations_count: 1,
        seen_count: 1,
        sources: [{ title: 'B', url: 'https://example.com/b' }],
        best_match: { id: 'media.music.generate' },
        suggested_kind: 'module',
      },
    ],
  };
  const selected = selectEcosystemDiscoveryCandidate(ledger);
  assert.equal(selected.fingerprint, 'capability:music.generate');
  assert.equal(selected.action, 'UNBLOCK_EXISTING');
  assert.match(selected.goal, /sans créer de capacité en doublon/i);
  assert.equal(selected.roadmap_id, 'GEN2-42');

  const marked = markEcosystemDiscoveryHandoff(ledger, selected.fingerprint, {
    status: 'WAITING_TEACHER',
    job_id: 'ecosystem-watch-123',
    created: true,
  }, 1234);
  assert.equal(marked.items.find(item => item.fingerprint === selected.fingerprint).handoff.job_id, 'ecosystem-watch-123');
  const next = selectEcosystemDiscoveryCandidate(marked);
  assert.equal(next.fingerprint, 'capability:art-history');
});


test('selector sends a sourced REUSE_EXISTING optimization into the supervised handoff path', () => {
  const ledger = {
    items: [
      {
        fingerprint: 'capability:web.research',
        capability_hint: 'web.research',
        category: 'tooling',
        action: 'REUSE_EXISTING',
        evidence_status: 'SOURCED_OBSERVATION',
        citations_count: 4,
        seen_count: 3,
        sources: [{ title: 'Official research docs', url: 'https://example.com/research' }],
        best_match: { id: 'web.research' },
        roadmap_matches: [{
          id: 'GEN2-37',
          title: 'Web / recherche',
          status: 'PARTIAL',
          priority: 'P1',
        }],
        suggested_kind: 'plugin',
      },
      {
        fingerprint: 'capability:new-tool',
        capability_hint: 'new-tool',
        category: 'tooling',
        action: 'PROPOSE_EXTENSION',
        evidence_status: 'SOURCED_OBSERVATION',
        citations_count: 10,
        seen_count: 10,
        sources: [{ title: 'Community', url: 'https://example.com/tool' }],
        proposal: { activation_allowed: false },
        suggested_kind: 'plugin',
      },
    ],
  };

  const selected = selectEcosystemDiscoveryCandidate(ledger);
  assert.equal(selected.fingerprint, 'capability:web.research');
  assert.equal(selected.action, 'REUSE_EXISTING');
  assert.match(selected.goal, /Optimiser la capacité existante web\.research/i);
  assert.match(selected.goal, /GEN2-37/);
  assert.equal(selected.roadmap_id, 'GEN2-42');
});

test('recurring watch merge preserves an existing handoff instead of duplicating work', () => {
  const previous = {
    run_count: 1,
    items: [{
      fingerprint: 'capability:music.generate',
      capability_hint: 'music.generate',
      action: 'UNBLOCK_EXISTING',
      handoff: { job_id: 'ecosystem-watch-1', status: 'WAITING_TEACHER', attempts: 1 },
      first_seen_at: 100,
      seen_count: 1,
    }],
  };
  const plan = {
    generated_at: '2026-09-18T10:00:00Z',
    items: [{
      fingerprint: 'capability:music.generate',
      capability_hint: 'music.generate',
      action: 'UNBLOCK_EXISTING',
      evidence_status: 'SOURCED_OBSERVATION',
      sources: [{ title: 'Official', url: 'https://example.com/music' }],
    }],
  };
  const merged = mergeEcosystemDiscoveryLedger(previous, plan, 200);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].handoff.job_id, 'ecosystem-watch-1');
  assert.equal(merged.items[0].handoff.attempts, 1);
  assert.equal(selectEcosystemDiscoveryCandidate(merged), null);
});

test('handoff reconciliation follows the canonical dev job through Teacher and verified completion without incrementing attempts', () => {
  const ledger = {
    items: [{
      fingerprint: 'capability:music.generate',
      capability_hint: 'music.generate',
      action: 'UNBLOCK_EXISTING',
      evidence_status: 'SOURCED_OBSERVATION',
      sources: [{ title: 'Official', url: 'https://example.com/music' }],
      handoff: {
        job_id: 'ecosystem-watch-1',
        status: 'WAITING_TEACHER',
        attempts: 1,
        teacher_request_id: 'req-1',
      },
    }],
  };
  const approved = reconcileEcosystemDiscoveryHandoffs(ledger, [{
    id: 'ecosystem-watch-1',
    status: 'TEACHER_APPROVED',
    updated_at: 150,
    result_json: {
      teacher_bridge: {
        status: 'ANSWERED',
        request: { request_id: 'req-1', provenance: { candidate_sha: 'a'.repeat(40) } },
        review: { request_id: 'req-1', verdict: 'APPROVE_PLAN' },
      },
    },
  }], 200);
  assert.equal(approved.changed, true);
  assert.equal(approved.ledger.items[0].handoff.status, 'TEACHER_APPROVED');
  assert.equal(approved.ledger.items[0].handoff.teacher_verdict, 'APPROVE_PLAN');
  assert.equal(approved.ledger.items[0].handoff.attempts, 1);
  assert.equal(approved.ledger.items[0].handoff.closed, false);

  const completed = reconcileEcosystemDiscoveryHandoffs(approved.ledger, [{
    id: 'ecosystem-watch-1',
    status: 'COMPLETED',
    updated_at: 250,
    result_json: {
      autonomy_completion: {
        status: 'VERIFIED',
        request_id: 'req-1',
        candidate_sha: 'b'.repeat(40),
        ci: { run_id: 12345 },
      },
    },
  }], 300);
  const handoff = completed.ledger.items[0].handoff;
  assert.equal(handoff.status, 'COMPLETED');
  assert.equal(handoff.closed, true);
  assert.equal(handoff.completion_verified, true);
  assert.equal(handoff.candidate_sha, 'b'.repeat(40));
  assert.equal(handoff.ci_run_id, 12345);
  assert.equal(handoff.attempts, 1);
  assert.equal(selectEcosystemDiscoveryCandidate(completed.ledger), null);
});

test('Teacher rejection closes the discovery while a non-Teacher failure remains retryable', () => {
  const base = {
    items: [{
      fingerprint: 'capability:new-tool',
      capability_hint: 'new-tool',
      action: 'PROPOSE_EXTENSION',
      evidence_status: 'SOURCED_OBSERVATION',
      sources: [{ title: 'Docs', url: 'https://example.com/tool' }],
      proposal: { activation_allowed: false },
      handoff: { job_id: 'job-1', status: 'WAITING_TEACHER', attempts: 1 },
    }],
  };
  const rejected = reconcileEcosystemDiscoveryHandoffs(base, [{
    id: 'job-1',
    status: 'FAILED',
    error: 'TEACHER_REJECT',
    updated_at: 10,
    result_json: { autonomy_block_reason: 'TEACHER_REJECT' },
  }], 20);
  assert.equal(rejected.ledger.items[0].handoff.closed, true);
  assert.equal(rejected.ledger.items[0].handoff.retryable, false);
  assert.equal(selectEcosystemDiscoveryCandidate(rejected.ledger), null);

  const retryable = reconcileEcosystemDiscoveryHandoffs(base, [{
    id: 'job-1',
    status: 'FAILED',
    error: 'TRANSIENT_PROVIDER_FAILURE',
    updated_at: 11,
    result_json: {},
  }], 21);
  assert.equal(retryable.ledger.items[0].handoff.closed, false);
  assert.equal(retryable.ledger.items[0].handoff.retryable, true);
  assert.equal(selectEcosystemDiscoveryCandidate(retryable.ledger)?.fingerprint, 'capability:new-tool');
});


test('sourced observations without a detected capability do not invent discovery items', () => {
  const plan = planEcosystemDiscoveries({
    catalog: {
      targets: [{
        id: 'creative-watch',
        metadata: { label: 'Creative', category: 'creative', capabilities: ['image.generate', 'art-history'] },
      }],
    },
    capabilities: [],
    watchResult: {
      status: 'RAN',
      results: [{
        id: 'creative-watch',
        evidence: {
          status: 'OBSERVED',
          citations_count: 1,
          sources: [{ title: 'Official', url: 'https://example.com' }],
          detected_capabilities: [],
        },
      }],
    },
  });
  assert.equal(plan.sourced_observations, 1);
  assert.deepEqual(plan.items, []);
});

test('ecosystem catalog provides direct HTTPS official sources for every target', () => {
  const catalog = getEcosystemWatchCatalog();
  assert.ok(catalog.targets.every(target =>
    Array.isArray(target.metadata.sources)
    && target.metadata.sources.length >= 1
    && target.metadata.sources.every(url => /^https:\/\//.test(url))
  ));
});


test('successful handoff clears stale failure diagnostics instead of exposing contradictory state', () => {
  const ledger = {
    items: [{
      fingerprint: 'capability:image.generate',
      capability_hint: 'image.generate',
      action: 'UNBLOCK_EXISTING',
      evidence_status: 'SOURCED_OBSERVATION',
      sources: [{ title: 'Official', url: 'https://example.com/image' }],
      handoff: {
        status: 'FAILED',
        job_id: 'ecosystem-watch-1',
        code: 'CODE_HEAD_READ_FAILED',
        retryable: true,
        terminal_reason: 'OLD_FAILURE',
        attempts: 2,
      },
    }],
  };

  const marked = markEcosystemDiscoveryHandoff(ledger, 'capability:image.generate', {
    status: 'WAITING_TEACHER',
    job_id: 'ecosystem-watch-1',
    teacher_request_id: 'req-live',
    created: false,
    closed: false,
  }, 500);

  const handoff = marked.items[0].handoff;
  assert.equal(handoff.status, 'WAITING_TEACHER');
  assert.equal(handoff.code, null);
  assert.equal(handoff.retryable, false);
  assert.equal(handoff.terminal_reason, null);
  assert.equal(handoff.teacher_request_id, 'req-live');
  assert.equal(handoff.attempts, 3);
});

test('job reconciliation clears stale error code after a retry reaches Teacher', () => {
  const ledger = {
    items: [{
      fingerprint: 'capability:image.generate',
      handoff: {
        status: 'FAILED',
        job_id: 'ecosystem-watch-1',
        code: 'CODE_HEAD_READ_FAILED',
        retryable: true,
        attempts: 3,
      },
    }],
  };
  const reconciled = reconcileEcosystemDiscoveryHandoffs(ledger, [{
    id: 'ecosystem-watch-1',
    status: 'WAITING_TEACHER',
    error: null,
    updated_at: 800,
    result_json: {
      teacher_bridge: {
        status: 'WAITING_TEACHER',
        request: {
          request_id: 'req-live',
          provenance: { candidate_sha: 'c'.repeat(40) },
        },
      },
    },
  }], 900);

  assert.equal(reconciled.changed, true);
  const handoff = reconciled.ledger.items[0].handoff;
  assert.equal(handoff.status, 'WAITING_TEACHER');
  assert.equal(handoff.code, null);
  assert.equal(handoff.retryable, false);
  assert.equal(handoff.teacher_request_id, 'req-live');
  assert.equal(handoff.candidate_sha, 'c'.repeat(40));
  assert.equal(handoff.attempts, 3);
});


test('owner decisions persist and rejected or deferred proposals are skipped by automatic selection', () => {
  const base = {
    items: [{
      fingerprint: 'capability:new-owner-choice',
      capability_hint: 'new-owner-choice',
      category: 'tooling',
      action: 'PROPOSE_EXTENSION',
      evidence_status: 'SOURCED_OBSERVATION',
      citations_count: 2,
      sources: [{ title: 'Docs', url: 'https://example.com/docs' }],
      proposal: { activation_allowed: false },
      suggested_kind: 'plugin',
    }],
  };
  const rejected = markEcosystemDiscoveryOwnerDecision(base, 'capability:new-owner-choice', {
    status: 'REJECTED',
    decided_by: 'owner',
  }, 100);
  assert.equal(rejected.items[0].owner_decision.status, 'REJECTED');
  assert.equal(selectEcosystemDiscoveryCandidate(rejected), null);

  const deferred = markEcosystemDiscoveryOwnerDecision(base, 'capability:new-owner-choice', {
    status: 'DEFERRED',
    decided_by: 'owner',
  }, 200);
  assert.equal(deferred.items[0].owner_decision.status, 'DEFERRED');
  assert.equal(selectEcosystemDiscoveryCandidate(deferred), null);
});


test('GEN2-42 resumes at most one requeued ecosystem handoff and refreshes Teacher metadata', async () => {
  const jobs = new Map([
    ['job-oldest', {
      id: 'job-oldest',
      status: 'QUEUED',
      requested_by: 'mel-autonomy',
      created_at: 10,
      optional_context: { source: 'ecosystem-watch', roadmap_id: 'GEN2-42' },
      result_json: {},
    }],
    ['job-newer', {
      id: 'job-newer',
      status: 'QUEUED',
      requested_by: 'mel-autonomy',
      created_at: 20,
      optional_context: { source: 'ecosystem-watch', roadmap_id: 'GEN2-42' },
      result_json: {},
    }],
  ]);
  const repository = {
    async get(id) { return jobs.get(id) || null; },
  };
  const ledger = {
    items: [
      {
        fingerprint: 'capability:image.generate',
        handoff: {
          job_id: 'job-oldest',
          status: 'QUEUED',
          teacher_request_id: 'req-stale',
          candidate_sha: 'a'.repeat(40),
          attempts: 2,
        },
      },
      {
        fingerprint: 'capability:video.generate',
        handoff: {
          job_id: 'job-newer',
          status: 'QUEUED',
          attempts: 1,
        },
      },
    ],
  };

  const resumedIds = [];
  const mirroredIds = [];
  const result = await reconcileDiscoveryJobs({}, ledger, {
    repository,
    now: 500,
    resumeTeacherRequest: async ({ job, minimalInspection }) => {
      assert.equal(minimalInspection, true);
      resumedIds.push(job.id);
      const fresh = {
        ...job,
        status: 'WAITING_TEACHER',
        updated_at: 450,
        result_json: {
          teacher_bridge: {
            status: 'WAITING_TEACHER',
            request: {
              request_id: 'req-fresh',
              provenance: { candidate_sha: 'b'.repeat(40) },
            },
          },
        },
      };
      jobs.set(job.id, fresh);
      return fresh.result_json.teacher_bridge;
    },
    mirrorTeacherRequest: async ({ job }) => {
      mirroredIds.push(job.id);
      return { status: 'MIRRORED' };
    },
  });

  assert.deepEqual(resumedIds, ['job-oldest']);
  assert.deepEqual(mirroredIds, ['job-oldest']);
  assert.equal(result.resumed.job_id, 'job-oldest');
  assert.equal(result.resumed.status, 'WAITING_TEACHER');
  assert.equal(result.resumed.teacher_request_id, 'req-fresh');
  assert.equal(result.resumed.mirror_status, 'MIRRORED');

  const oldest = result.ledger.items.find(item => item.handoff.job_id === 'job-oldest').handoff;
  assert.equal(oldest.status, 'WAITING_TEACHER');
  assert.equal(oldest.teacher_request_id, 'req-fresh');
  assert.equal(oldest.candidate_sha, 'b'.repeat(40));
  assert.equal(oldest.attempts, 2);

  const newer = result.ledger.items.find(item => item.handoff.job_id === 'job-newer').handoff;
  assert.equal(newer.status, 'QUEUED');
  assert.equal(newer.attempts, 1);
});
