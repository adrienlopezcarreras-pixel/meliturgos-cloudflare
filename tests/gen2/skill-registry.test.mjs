import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SKILL_STATUSES,
  createInMemorySkillRegistryAdapter,
  createSkillRegistry,
  listSkillsRequest,
  resolveSkillRequest,
  skillDefinition,
} from '../../src/skills/skill-registry.js';

const skill = (version = '1.0.0', overrides = {}) => ({
  skill_id: 'mel.document.summarize',
  version,
  name: 'Document summarization',
  description: 'Summarize long documents with provenance.',
  capabilities: ['documents.summarize', 'documents.read'],
  tags: ['documents', 'verified-learning'],
  provenance: {
    type: 'module-lab',
    ref: `evolution:${version}`,
    commit: 'abc123',
  },
  evidence: [],
  created_at: 1_000,
  metadata: { owner: 'mel' },
  ...overrides,
});

const evidence = (ref = 'benchmark:1', observed_at = 1_100) => ({
  kind: 'benchmark',
  ref,
  observed_at,
  score: 0.97,
});

test('skill definitions are canonical, defensive and provider-neutral', () => {
  const input = skill('1.0.0', {
    skill_id: ' mel.document.summarize ',
    name: ' Document summarization ',
    capabilities: [' documents.summarize ', 'documents.read'],
    tags: [' verified-learning ', 'documents'],
  });

  const normalized = skillDefinition(input);
  assert.equal(normalized.skill_id, 'mel.document.summarize');
  assert.equal(normalized.name, 'Document summarization');
  assert.deepEqual(normalized.capabilities, ['documents.read', 'documents.summarize']);
  assert.deepEqual(normalized.tags, ['documents', 'verified-learning']);
  assert.notEqual(normalized.metadata, input.metadata);

  input.metadata.owner = 'outside-change';
  assert.equal(normalized.metadata.owner, 'mel');
  assert.throws(() => skillDefinition(skill('v1')), { code: 'SKILL_VERSION_INVALID' });
  assert.throws(() => skillDefinition(skill('1.0.0', { capabilities: [] })), { code: 'SKILL_CAPABILITIES_INVALID' });
});

test('skill registry port fails closed without an adapter', async () => {
  const registry = createSkillRegistry();
  await assert.rejects(() => registry.register(skill()), { code: 'NOT_IMPLEMENTED:skill_registry.register' });
});

test('registration is idempotent for an identical version and rejects conflicting reuse', async () => {
  const registry = createSkillRegistry(createInMemorySkillRegistryAdapter());

  const first = await registry.register(skill());
  const duplicate = await registry.register(skill());
  assert.equal(first.deduplicated, false);
  assert.equal(duplicate.deduplicated, true);
  assert.equal((await registry.list()).length, 1);

  await assert.rejects(
    () => registry.register(skill('1.0.0', { name: 'Different implementation' })),
    { code: 'SKILL_VERSION_CONFLICT', status: 409 },
  );
});

test('only evidenced and verified skills can become active', async () => {
  const registry = createSkillRegistry(createInMemorySkillRegistryAdapter());
  await registry.register(skill());

  await assert.rejects(
    () => registry.activate({ skill_id: 'mel.document.summarize', version: '1.0.0', activated_at: 1_200 }),
    { code: 'SKILL_NOT_VERIFIED', status: 409 },
  );
  await assert.rejects(
    () => registry.verify({ skill_id: 'mel.document.summarize', version: '1.0.0', verified_at: 1_100 }),
    { code: 'SKILL_VERIFICATION_EVIDENCE_REQUIRED' },
  );

  const verified = await registry.verify({
    skill_id: 'mel.document.summarize',
    version: '1.0.0',
    verified_at: 1_100,
    evidence: [evidence()],
  });
  assert.equal(verified.status, SKILL_STATUSES.VERIFIED);
  assert.equal(verified.definition.evidence.length, 1);

  const active = await registry.activate({
    skill_id: 'mel.document.summarize',
    version: '1.0.0',
    activated_at: 1_200,
  });
  assert.equal(active.status, SKILL_STATUSES.ACTIVE);
  assert.equal(active.activated_at, 1_200);
});

test('activating a newer version demotes the previous active version and resolve returns the active skill', async () => {
  const registry = createSkillRegistry(createInMemorySkillRegistryAdapter());

  for (const [version, baseTime] of [['1.0.0', 1_000], ['1.1.0', 2_000]]) {
    await registry.register(skill(version, { created_at: baseTime }));
    await registry.verify({
      skill_id: 'mel.document.summarize',
      version,
      verified_at: baseTime + 10,
      evidence: [evidence(`benchmark:${version}`, baseTime + 5)],
    });
    await registry.activate({
      skill_id: 'mel.document.summarize',
      version,
      activated_at: baseTime + 20,
    });
  }

  const oldVersion = await registry.get({ skill_id: 'mel.document.summarize', version: '1.0.0' });
  const newVersion = await registry.get({ skill_id: 'mel.document.summarize', version: '1.1.0' });
  assert.equal(oldVersion.status, SKILL_STATUSES.VERIFIED);
  assert.equal(newVersion.status, SKILL_STATUSES.ACTIVE);

  const resolved = await registry.resolve({ capability: 'documents.summarize' });
  assert.equal(resolved.definition.version, '1.1.0');
  assert.equal(await registry.resolve({ capability: 'unknown.capability' }), null);
});

test('deprecation removes a skill from resolution while preserving its history', async () => {
  const registry = createSkillRegistry(createInMemorySkillRegistryAdapter());
  await registry.register(skill());
  await registry.verify({
    skill_id: 'mel.document.summarize', version: '1.0.0', verified_at: 1_100, evidence: [evidence()],
  });
  await registry.activate({ skill_id: 'mel.document.summarize', version: '1.0.0', activated_at: 1_200 });

  const deprecated = await registry.deprecate({
    skill_id: 'mel.document.summarize',
    version: '1.0.0',
    deprecated_at: 1_300,
    reason: 'superseded',
  });
  assert.equal(deprecated.status, SKILL_STATUSES.DEPRECATED);
  assert.equal(deprecated.deprecation_reason, 'superseded');
  assert.equal(await registry.resolve({ capability: 'documents.summarize' }), null);
});

test('snapshot export/import is portable, deterministic and validates before mutation', async () => {
  const source = createSkillRegistry(createInMemorySkillRegistryAdapter());
  await source.register(skill());
  await source.verify({
    skill_id: 'mel.document.summarize', version: '1.0.0', verified_at: 1_100, evidence: [evidence()],
  });
  await source.activate({ skill_id: 'mel.document.summarize', version: '1.0.0', activated_at: 1_200 });

  const snapshot = await source.exportSnapshot();
  assert.equal(snapshot.schema, 'mel.skill-registry.v1');
  assert.equal(snapshot.records.length, 1);

  const target = createSkillRegistry(createInMemorySkillRegistryAdapter());
  assert.deepEqual(await target.importSnapshot(snapshot), { imported: 1, total: 1 });
  assert.deepEqual(await target.importSnapshot(snapshot), { imported: 0, total: 1 });
  assert.deepEqual(await target.exportSnapshot(), snapshot);

  const invalid = structuredClone(snapshot);
  invalid.records.push(structuredClone(snapshot.records[0]));
  await assert.rejects(() => target.importSnapshot(invalid), { code: 'SKILL_SNAPSHOT_DUPLICATE_VERSION', status: 409 });
  assert.equal((await target.list()).length, 1);
});

test('read models are filterable and defensive; validators reject unsafe queries', async () => {
  const registry = createSkillRegistry(createInMemorySkillRegistryAdapter());
  await registry.register(skill());

  const rows = await registry.list({ capability: 'documents.read', status: SKILL_STATUSES.CANDIDATE });
  assert.equal(rows.length, 1);
  rows[0].definition.metadata.owner = 'mutated';
  assert.equal((await registry.get({ skill_id: 'mel.document.summarize', version: '1.0.0' })).definition.metadata.owner, 'mel');

  assert.deepEqual(listSkillsRequest({ limit: 5 }), { limit: 5 });
  assert.deepEqual(resolveSkillRequest({ capability: ' x.y ' }), { capability: 'x.y' });
  assert.throws(() => listSkillsRequest({ status: 'UNKNOWN' }), { code: 'SKILL_LIST_STATUS_INVALID' });
  assert.throws(() => listSkillsRequest({ limit: 0 }), { code: 'SKILL_LIST_LIMIT_INVALID' });
  assert.throws(() => resolveSkillRequest({ capability: ' ' }), { code: 'SKILL_RESOLVE_CAPABILITY_INVALID' });
});
