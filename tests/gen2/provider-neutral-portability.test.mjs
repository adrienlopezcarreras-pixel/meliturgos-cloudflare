import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PORTABILITY_SCHEMA,
  createProviderNeutralManifest,
  portabilitySummary,
  validateProviderNeutralManifest,
} from '../../src/portability/provider-neutral-manifest.js';

test('GEN2-49 builds a deterministic provider-neutral manifest', () => {
  const manifest = createProviderNeutralManifest({
    generated_at: '2026-09-15T18:00:00.000Z',
    source: { branch: 'candidate/mel-clean-autonomy', commit: 'abc123' },
    contracts: [
      { id: 'memory.export', version: '2', description: 'Portable memory export' },
      { id: 'capability.bus', version: '1' },
    ],
    artifacts: [
      { id: 'memory', contract_id: 'memory.export', format: 'jsonl', ref: 'bundle/memory.jsonl', checksum: 'sha256:1' },
      { id: 'capabilities', contract_id: 'capability.bus', format: 'json', ref: 'bundle/capabilities.json', checksum: 'sha256:2' },
    ],
    adapters: [
      { id: 'storage.r2', contract_id: 'memory.export', provider: 'cloudflare', optional: true },
      { id: 'storage.local', contract_id: 'memory.export', provider: 'local', optional: true },
    ],
  });

  assert.equal(manifest.schema, PORTABILITY_SCHEMA);
  assert.deepEqual(manifest.contracts.map(row => row.id), ['capability.bus', 'memory.export']);
  assert.deepEqual(manifest.artifacts.map(row => row.id), ['capabilities', 'memory']);
  assert.deepEqual(manifest.adapters.map(row => row.id), ['storage.local', 'storage.r2']);

  const validation = validateProviderNeutralManifest(manifest);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));

  assert.deepEqual(portabilitySummary(manifest), {
    ok: true,
    schema: PORTABILITY_SCHEMA,
    contracts: 2,
    required_contracts: 2,
    artifacts: 2,
    optional_adapters: 2,
    providers: ['cloudflare', 'local'],
    issues: [],
  });
});

test('GEN2-49 rejects provider locks in portable contracts and artifacts', () => {
  const manifest = createProviderNeutralManifest({
    generated_at: '2026-09-15T18:00:00.000Z',
    contracts: [{ id: 'memory.export' }],
    artifacts: [{ id: 'memory', contract_id: 'memory.export', format: 'json', ref: 'memory.json' }],
  });

  manifest.contracts[0].required_provider = 'cloudflare';
  manifest.artifacts[0].vendor = 'cloudflare';

  const validation = validateProviderNeutralManifest(manifest);
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.filter(issue => issue.type === 'PROVIDER_LOCK_FORBIDDEN').length, 2);
});

test('GEN2-49 forbids secrets and mandatory provider adapters', () => {
  const manifest = createProviderNeutralManifest({
    generated_at: '2026-09-15T18:00:00.000Z',
    contracts: [{ id: 'model.inference' }],
    adapters: [{ id: 'model.remote', contract_id: 'model.inference', provider: 'example', optional: false }],
    metadata: { api_token: 'must-never-be-exported' },
  });

  const validation = validateProviderNeutralManifest(manifest);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(issue => issue.type === 'SECRET_FIELD_FORBIDDEN'));
  assert.ok(validation.issues.some(issue => issue.type === 'PROVIDER_ADAPTER_MUST_BE_OPTIONAL'));
});

test('GEN2-49 validates referential integrity and duplicate ids', () => {
  const manifest = createProviderNeutralManifest({
    generated_at: 'not-a-date',
    contracts: [{ id: 'memory.export' }, { id: 'memory.export' }],
    artifacts: [
      { id: 'same', contract_id: 'missing.contract', format: '', ref: '' },
      { id: 'same', contract_id: 'memory.export', format: 'json', ref: 'memory.json' },
    ],
    adapters: [{ id: 'adapter', contract_id: 'missing.contract', provider: 'local', optional: true }],
  });

  const validation = validateProviderNeutralManifest(manifest);
  assert.equal(validation.ok, false);
  const types = new Set(validation.issues.map(issue => issue.type));
  for (const expected of [
    'INVALID_GENERATED_AT',
    'DUPLICATE_CONTRACT_ID',
    'DUPLICATE_ARTIFACT_ID',
    'UNKNOWN_ARTIFACT_CONTRACT',
    'EMPTY_ARTIFACT_FORMAT',
    'EMPTY_ARTIFACT_REF',
    'UNKNOWN_ADAPTER_CONTRACT',
  ]) {
    assert.ok(types.has(expected), `missing ${expected}`);
  }
});
