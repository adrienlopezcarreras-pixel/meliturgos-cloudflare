import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeModuleDraft } from '../src/capabilities/module-proposal-capability.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

test('module proposal drafts a valid non-activating manifest only for a real gap', () => {
  const result = proposeModuleDraft({
    goal: 'analyser automatiquement un format stellaire totalement nouveau',
    capabilities: [],
  });
  assert.equal(result.decision, 'PROPOSE_MODULE');
  assert.equal(result.proposal_only, true);
  assert.equal(result.activation_allowed, false);
  assert.ok(result.manifest.id.startsWith('mel-'));
  assert.equal(result.manifest.version, '0.1.0');
  assert.equal(result.manifest.author, 'MEL');
  assert.equal(Array.isArray(result.acceptance_tests), true);
  assert.match(result.next_action, /evolution\.preflight/);
});

test('module proposal refuses to duplicate an available matching capability', () => {
  const result = proposeModuleDraft({
    goal: 'recherche web',
    capabilities: [{ id: 'web.research', name: 'Recherche web', category: 'web', description: 'research search web', health: 'HEALTHY', enabled: true }],
    threshold: 1,
  });
  assert.equal(result.decision, 'REUSE_EXISTING');
  assert.equal(result.manifest, null);
  assert.equal(result.activation_allowed, false);
});

test('module proposal raises risk for mutating or sensitive goals without granting permissions', () => {
  const result = proposeModuleDraft({ goal: 'modifier un fichier puis déployer en production', capabilities: [] });
  assert.equal(result.manifest.risk, 'HIGH');
  assert.deepEqual(result.manifest.permissions, []);
  assert.deepEqual(result.manifest.secrets_required, []);
  assert.equal(result.activation_allowed, false);
});

test('Gen2 runtime exposes evolution.module.propose as low risk', () => {
  const runtime = createGen2Runtime({ env: { MEL_GITHUB_FETCH: async () => new Response('{}', { status: 500 }) } });
  const row = runtime.bus.list().find(item => item.id === 'evolution.module.propose');
  assert.ok(row);
  assert.equal(row.risk, 'LOW');
  assert.equal(row.enabled, true);
});
