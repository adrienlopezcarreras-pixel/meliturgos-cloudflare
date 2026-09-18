import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ECOSYSTEM_WATCH_TARGETS,
  getEcosystemWatchCatalog,
} from '../../src/evaluation/ecosystem-watch-catalog.js';
import { runCapabilityWatch } from '../../src/evaluation/capability-watch.js';
import { planEcosystemDiscoveries, mergeEcosystemDiscoveryLedger } from '../../src/evaluation/ecosystem-discovery-planner.js';
import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';

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
