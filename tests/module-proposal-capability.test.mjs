import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeModuleDraft, enterModuleLabForGap } from '../src/capabilities/module-proposal-capability.js';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { createModuleLab } from '../src/modules/module-lab.js';

const councilReport = {
  status: 'COMPLETE',
  phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
  development_allowed: false,
  responses: [
    { member: 'zero-a', answer: 'reuse first, then bounded need' },
    { member: 'zero-b', answer: 'keep code generation behind Teacher' },
  ],
};

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

test('real capability gap enters the existing Module Lab at need only after Council gate', async () => {
  const calls = [];
  const moduleLab = createModuleLab({
    async need(input, context) {
      calls.push({ input, context });
      return { status: 'NEED_CAPTURED', module_id: input.manifest.id };
    },
  });

  const result = await enterModuleLabForGap({
    goal: 'analyser automatiquement un format stellaire totalement nouveau',
    capabilities: [],
    councilReport,
    moduleLab,
    context: { owner: 'mel-autonomy', requestId: 'mel-evol-02-test' },
  });

  assert.equal(result.decision, 'MODULE_LAB_NEED');
  assert.equal(result.module_lab_entered, true);
  assert.equal(result.module_lab_stage, 'need');
  assert.equal(result.module_lab_need.status, 'NEED_CAPTURED');
  assert.equal(result.council_gate.authorized, true);
  assert.equal(result.council_gate.responses, 2);
  assert.equal(result.code_generation_allowed, false);
  assert.equal(result.activation_allowed, false);
  assert.equal(result.teacher_required, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.gap.classification, 'POSSIBLE_GAP');
  assert.equal(calls[0].input.proposal_only, true);
  assert.equal(calls[0].input.activation_allowed, false);
});

test('gap to Module Lab bridge fails closed without completed Council', async () => {
  let calls = 0;
  const moduleLab = createModuleLab({ need: async () => { calls += 1; return { status: 'UNEXPECTED' }; } });
  await assert.rejects(
    () => enterModuleLabForGap({
      goal: 'analyser automatiquement un format stellaire totalement nouveau',
      capabilities: [],
      councilReport: null,
      moduleLab,
    }),
    error => error?.code === 'AI_STATE_OF_PLAY_REQUIRED_BEFORE_DEVELOPMENT',
  );
  assert.equal(calls, 0);
});

test('existing healthy capability never enters Module Lab and needs no Council', async () => {
  let calls = 0;
  const moduleLab = createModuleLab({ need: async () => { calls += 1; return { status: 'UNEXPECTED' }; } });
  const result = await enterModuleLabForGap({
    goal: 'recherche web',
    capabilities: [{ id: 'web.research', name: 'Recherche web', category: 'web', description: 'research search web', health: 'HEALTHY', enabled: true }],
    threshold: 1,
    councilReport: null,
    moduleLab,
  });
  assert.equal(result.decision, 'REUSE_EXISTING');
  assert.equal(result.module_lab_entered, false);
  assert.equal(result.module_lab_stage, null);
  assert.equal(result.code_generation_allowed, false);
  assert.equal(calls, 0);
});

test('real gap fails closed when Module Lab need adapter is unavailable', async () => {
  await assert.rejects(
    () => enterModuleLabForGap({
      goal: 'analyser automatiquement un format stellaire totalement nouveau',
      capabilities: [],
      councilReport,
      moduleLab: null,
    }),
    error => error?.code === 'MODULE_LAB_NEED_ADAPTER_REQUIRED',
  );
});

test('Gen2 runtime exposes evolution.module.propose as low risk', () => {
  const runtime = createGen2Runtime({ env: { MEL_GITHUB_FETCH: async () => new Response('{}', { status: 500 }) } });
  const row = runtime.bus.list().find(item => item.id === 'evolution.module.propose');
  assert.ok(row);
  assert.equal(row.risk, 'LOW');
  assert.equal(row.enabled, true);
});
