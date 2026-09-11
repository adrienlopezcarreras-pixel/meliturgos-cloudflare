import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';
import { auditRuntimeCapabilities } from '../src/diagnostics/capability-truth-audit.js';

test('deep truth audit proves bounded zero-cost local capabilities without touching providers or persistence', async () => {
  const runtime = createGen2Runtime({ env: {} });
  const samples = {
    echo: { value: 'local-smoke-proof' },
    'roadmap.read': {},
    'system.bindings': {},
    'chatgpt.archive.preview': { archive: { conversations: [] } },
    'capability.audit': { deep: false },
    'evolution.module.propose': {
      goal: 'prévisualiser une capacité locale de diagnostic sans écrire ni activer de code',
      threshold: 2,
    },
    'device.policy.preview': {
      deviceId: 'local-smoke-proof',
      capabilities: ['status.read'],
      action: 'status.read',
      ownerApproved: false,
      ownerShutdown: false,
      adapter: 'audit-preview',
    },
  };

  const report = await auditRuntimeCapabilities(runtime, { deep: true, samples });
  const byId = new Map(report.capabilities.map(row => [row.id, row]));

  for (const id of Object.keys(samples)) {
    const row = byId.get(id);
    assert.ok(row, `missing audited capability ${id}`);
    assert.equal(row.risk, 'LOW', `${id} must remain LOW risk for automatic smoke proof`);
    assert.equal(row.tested_now, true, `${id} was not executed by the bounded audit`);
    assert.equal(row.auto_execution_blocked, null, `${id} unexpectedly blocked`);
    assert.equal(row.execution?.ok, true, `${id} did not execute successfully`);
    assert.equal(row.truth_status, 'EXISTANT_ET_TESTE', `${id} was not promoted by real execution proof`);
  }

  for (const id of ['augmentio.fanout', 'council.state-of-play', 'evolution.preflight', 'web.research']) {
    const row = byId.get(id);
    assert.ok(row, `missing provider-sensitive capability ${id}`);
    assert.equal(row.tested_now, false, `${id} must not execute in the zero-provider smoke proof`);
  }

  const enqueue = byId.get('evolution.enqueue');
  assert.ok(enqueue, 'missing evolution.enqueue');
  assert.equal(enqueue.tested_now, false);
  assert.equal(enqueue.auto_execution_blocked, 'RISK_NOT_LOW');
});
