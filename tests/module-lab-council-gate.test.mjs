import test from 'node:test';
import assert from 'node:assert/strict';
import { createGen2Runtime } from '../src/core/orchestrator/gen2-runtime.js';

const manifest = {
  id: 'sample.module',
  name: 'Sample Module',
  version: '1.0.0',
  description: 'test',
  author: 'mel',
  capabilities: ['sample'],
  permissions: [],
  secrets_required: [],
  dependencies: [],
  entrypoint: 'src/modules/sample.mjs',
  risk: 'LOW'
};

const councilReport = {
  status: 'COMPLETE',
  phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
  development_allowed: true,
  responses: [{ member: 'a', answer: 'x' }, { member: 'b', answer: 'y' }]
};

test('Module Lab refuses generation without completed state-of-play council', async () => {
  const runtime = createGen2Runtime();
  await assert.rejects(
    () => runtime.moduleLab.prove(manifest, async input => input),
    e => e.code === 'AI_STATE_OF_PLAY_REQUIRED_BEFORE_DEVELOPMENT'
  );
});

test('Module Lab can prove and activate after council gate is satisfied', async () => {
  const runtime = createGen2Runtime();
  const result = await runtime.moduleLab.prove(manifest, async input => ({ ok: true, input }), { councilReport });
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.council.phase, 'STATE_OF_PLAY_BEFORE_DEVELOPMENT');
  assert.equal(result.council.responses, 2);
  assert.equal(result.result.ok, true);
});
