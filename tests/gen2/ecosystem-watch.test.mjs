import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ECOSYSTEM_WATCH_TARGETS,
  getEcosystemWatchCatalog,
} from '../../src/evaluation/ecosystem-watch-catalog.js';
import { runCapabilityWatch } from '../../src/evaluation/capability-watch.js';

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
