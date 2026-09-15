import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMORY_EXPORT_FORMAT,
  MEMORY_EXPORT_SCHEMA_VERSION,
  createPortableMemoryExport,
  parsePortableMemoryExport,
  serializePortableMemoryExport,
  verifyPortableMemoryExport,
} from '../../src/memory/portable-export.js';

const memories = [
  { id: 'm2', kind: 'preference', content: 'Réponses concises', confidence: 0.8, metadata: { source: 'chat' } },
  { id: 'm1', kind: 'fact', content: 'Projet MEL', confidence: 1, created_at: 1700000000000 },
];

test('portable export is versioned, sorted and readable', async () => {
  const bundle = await createPortableMemoryExport(memories, { generatedAt: '2026-09-15T18:00:00.000Z' });
  assert.equal(bundle.manifest.format, MEMORY_EXPORT_FORMAT);
  assert.equal(bundle.manifest.schema_version, MEMORY_EXPORT_SCHEMA_VERSION);
  assert.equal(bundle.manifest.record_count, 2);
  assert.deepEqual(bundle.records.map((entry) => entry.memory.id), ['m1', 'm2']);
  assert.match(bundle.manifest.payload_sha256, /^[a-f0-9]{64}$/);
  assert.match(serializePortableMemoryExport(bundle), /"schema_version": "1\.0\.0"/);
});

test('same payload produces the same checksums despite input order', async () => {
  const first = await createPortableMemoryExport(memories, { generatedAt: '2026-09-15T18:00:00.000Z' });
  const second = await createPortableMemoryExport([...memories].reverse(), { generatedAt: '2026-09-15T19:00:00.000Z' });
  assert.equal(first.manifest.payload_sha256, second.manifest.payload_sha256);
  assert.deepEqual(first.records.map((x) => x.checksum.value), second.records.map((x) => x.checksum.value));
});

test('verification detects record tampering', async () => {
  const bundle = await createPortableMemoryExport(memories);
  const tampered = JSON.parse(JSON.stringify(bundle));
  tampered.records[0].memory.content = 'modifié';
  const result = await verifyPortableMemoryExport(tampered);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((item) => item.includes('CHECKSUM_MISMATCH')));
  assert.ok(result.failures.includes('PAYLOAD_CHECKSUM_MISMATCH'));
});

test('verification detects missing records', async () => {
  const bundle = await createPortableMemoryExport(memories);
  const truncated = JSON.parse(JSON.stringify(bundle));
  truncated.records.pop();
  const result = await verifyPortableMemoryExport(truncated);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('RECORD_COUNT_MISMATCH'));
  assert.ok(result.failures.includes('PAYLOAD_CHECKSUM_MISMATCH'));
});

test('serialize and parse round-trip preserves a verified export', async () => {
  const bundle = await createPortableMemoryExport(memories);
  const text = serializePortableMemoryExport(bundle);
  const parsed = await parsePortableMemoryExport(text);
  assert.equal(parsed.manifest.payload_sha256, bundle.manifest.payload_sha256);
  assert.equal((await verifyPortableMemoryExport(parsed)).ok, true);
});

test('invalid or non JSON-safe records fail closed', async () => {
  await assert.rejects(createPortableMemoryExport([{ id: '', content: 'x' }]), /MEMORY_EXPORT_RECORD_ID_REQUIRED/);
  await assert.rejects(createPortableMemoryExport([{ id: 'x', content: 'x', invalid: 1n }]), /MEMORY_EXPORT_UNSUPPORTED_VALUE/);
});
