import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MemorySkillRegistryStore,
  SKILL_REGISTRY_SCHEMA,
  SkillRegistry
} from '../../src/evolution/skill-registry.js';

const verifiedEvidence = id => [{ id, status: 'verified', source: 'benchmark' }];

test('verified skills can be activated, resolved, filtered and rolled back', () => {
  const registry = new SkillRegistry();
  registry.register({
    skillId: 'research.web',
    name: 'Web research',
    version: '1.0.0',
    capabilities: ['web.search', 'source.cite'],
    state: 'verified',
    evidence: verifiedEvidence('bench-1')
  });
  registry.register({
    skillId: 'research.web',
    name: 'Web research',
    version: '1.1.0',
    capabilities: ['source.cite', 'web.search', 'web.search'],
    state: 'verified',
    evidence: verifiedEvidence('bench-2')
  });

  registry.activate('research.web', '1.0.0');
  registry.activate('research.web', '1.1.0');

  assert.equal(registry.resolve('research.web').version, '1.1.0');
  assert.deepEqual(registry.resolve('research.web').capabilities, ['source.cite', 'web.search']);
  assert.deepEqual(registry.history('research.web').map(row => row.version), ['1.0.0', '1.1.0']);
  assert.deepEqual(registry.list({ capability: 'web.search', activeOnly: true }).map(row => row.version), ['1.1.0']);
  assert.equal(registry.rollback('research.web').active, '1.0.0');
  assert.equal(registry.resolve('research.web').version, '1.0.0');
});

test('candidate or unproven skill versions fail closed on activation', () => {
  const registry = new SkillRegistry();
  registry.register({
    skillId: 'code.patch',
    name: 'Patch code',
    version: 'candidate-1',
    capabilities: ['code.write'],
    state: 'candidate',
    evidence: []
  });
  registry.register({
    skillId: 'code.patch',
    name: 'Patch code',
    version: 'candidate-2',
    capabilities: ['code.write'],
    state: 'verified',
    evidence: [{ id: 'bench-failed', status: 'failed' }]
  });

  assert.throws(() => registry.activate('code.patch', 'candidate-1'), /SKILL_REGISTRY_VERSION_NOT_VERIFIED/);
  assert.throws(() => registry.activate('code.patch', 'candidate-2'), /SKILL_REGISTRY_VERSION_NOT_VERIFIED/);
  assert.throws(() => registry.resolve('code.patch'), /SKILL_REGISTRY_NO_ACTIVE_VERSION/);
});

test('same version is idempotent but conflicting replacement is rejected', () => {
  const registry = new SkillRegistry();
  const definition = {
    skillId: 'memory.compile',
    name: 'Memory compiler',
    version: '2026.09',
    capabilities: ['memory.compile'],
    state: 'verified',
    evidence: verifiedEvidence('proof-1'),
    metadata: { source: 'module-lab' }
  };

  const first = registry.register(definition);
  const replay = registry.register(definition);
  assert.deepEqual(replay, first);
  assert.equal(registry.history('memory.compile').length, 1);

  assert.throws(() => registry.register({ ...definition, name: 'Different implementation' }), /SKILL_REGISTRY_VERSION_CONFLICT/);
});

test('portable snapshot round-trip preserves activation history', () => {
  const source = new SkillRegistry();
  source.register({
    skillId: 'document.parse',
    name: 'Document parsing',
    version: 'v1',
    capabilities: ['document.read'],
    state: 'verified',
    evidence: verifiedEvidence('doc-v1')
  });
  source.register({
    skillId: 'document.parse',
    name: 'Document parsing',
    version: 'v2',
    capabilities: ['document.read', 'document.structure'],
    state: 'verified',
    evidence: verifiedEvidence('doc-v2')
  });
  source.activate('document.parse', 'v1');
  source.activate('document.parse', 'v2');

  const snapshot = source.exportSnapshot();
  assert.equal(snapshot.schema, SKILL_REGISTRY_SCHEMA);

  const restored = new SkillRegistry({ snapshot });
  assert.equal(restored.resolve('document.parse').version, 'v2');
  assert.equal(restored.rollback('document.parse').active, 'v1');
});

test('store adapter persists and restores the registry without provider coupling', async () => {
  const store = new MemorySkillRegistryStore();
  const registry = new SkillRegistry({ store });
  registry.register({
    skillId: 'voice.transcribe',
    name: 'Voice transcription',
    version: 'v1',
    capabilities: ['audio.transcribe'],
    state: 'verified',
    evidence: verifiedEvidence('voice-proof'),
    metadata: { implementation: 'replaceable-adapter' }
  });
  registry.activate('voice.transcribe', 'v1');
  await registry.persist();

  const restored = await SkillRegistry.restore(store);
  assert.equal(restored.resolve('voice.transcribe').version, 'v1');
  assert.deepEqual(restored.resolve('voice.transcribe').metadata, { implementation: 'replaceable-adapter' });
});

test('invalid snapshots and malformed records are rejected', () => {
  assert.throws(() => new SkillRegistry({ snapshot: { schema: 'wrong', entries: [] } }), /SKILL_REGISTRY_SNAPSHOT_INVALID/);

  const registry = new SkillRegistry();
  assert.throws(() => registry.register({
    skillId: 'bad',
    name: 'Bad',
    version: 'v1',
    capabilities: [],
    state: 'verified',
    evidence: verifiedEvidence('x')
  }), /SKILL_REGISTRY_CAPABILITIES_REQUIRED/);
});
