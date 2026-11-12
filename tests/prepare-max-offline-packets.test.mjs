import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfflinePackets } from '../scripts/prepare-max-offline-packets.mjs';

test('offline packets include only registry-open objectives, without invented approvals', () => {
  const packets = buildOfflinePackets([
    { id: 'A', title: 'Open', priority: 'P1', status: 'PLANNED', code_paths: ['src/a.js'], test_paths: ['tests/a.test.mjs'], depends_on: ['B'] },
    { id: 'B', title: 'Done', priority: 'P1', status: 'DONE_VERIFIED' },
    { id: 'C', title: 'Blocked', priority: 'P2', status: 'BLOCKED_EXTERNAL' },
  ]);
  assert.deepEqual(packets.map(x => x.roadmap_id), ['A', 'C']);
  assert.deepEqual(packets[0].code_paths, ['src/a.js']);
  assert.deepEqual(packets[0].depends_on, ['B']);
  assert.ok(packets.every(x => x.council_verdict === 'NOT_REQUESTED' && x.candidate_sha === null && x.status === 'PREPARATION_ONLY_NOT_EXECUTED'));
});

test('offline packet preparation rejects duplicate open IDs', () => {
  assert.throws(() => buildOfflinePackets([
    {id:'A',status:'PLANNED'}, {id:'A',status:'PLANNED'}
  ]), /INVALID_OR_DUPLICATE_ROADMAP_ID/);
});

test('empty registry writes an explicit empty manifest', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { writeOfflinePackets } = await import('../scripts/prepare-max-offline-packets.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'max-packets-'));
  try {
    const result = await writeOfflinePackets(dir, []);
    assert.equal(result.count, 0);
    const manifest = JSON.parse(await readFile(result.file, 'utf8'));
    assert.equal(manifest.packet_count, 0);
    assert.deepEqual(manifest.packets, []);
    assert.equal(manifest.scope, 'registry_open_only_not_live_D1');
    assert.equal(manifest.independence, 'NO_MODEL_INFERENCE_NO_GITHUB_WRITE_NO_D1_WRITE');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('closed dependencies remain references, never implied completed missions', () => {
  const packets = buildOfflinePackets([
    { id: 'OPEN', title: 'Needs dependency', status: 'PLANNED', depends_on: ['CLOSED'] },
    { id: 'CLOSED', title: 'Historical proof', status: 'DONE_VERIFIED' },
  ]);
  assert.deepEqual(packets.map(p => p.roadmap_id), ['OPEN']);
  assert.deepEqual(packets[0].depends_on, ['CLOSED']);
  assert.equal(packets[0].production_receipt, null);
  assert.equal(packets[0].teacher_verdict, 'NOT_REQUESTED');
});

test('missing IDs and duplicates reject even when rows are closed', () => {
  assert.throws(() => buildOfflinePackets([{ title: 'No ID', status: 'DONE_VERIFIED' }]), /INVALID_OR_DUPLICATE_ROADMAP_ID/);
  assert.throws(() => buildOfflinePackets([
    { id: 'SAME', status: 'DONE_VERIFIED' },
    { id: 'SAME', status: 'PLANNED' },
  ]), /INVALID_OR_DUPLICATE_ROADMAP_ID/);
});

test('offline packet serialization includes no synthetic Council, Teacher or production proof', async () => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { writeOfflinePackets } = await import('../scripts/prepare-max-offline-packets.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'max-packets-'));
  try {
    const { file, count } = await writeOfflinePackets(dir, [{ id: 'PENDING', title: 'Proof pending', status: 'BLOCKED_EXTERNAL' }]);
    assert.equal(count, 1);
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const packet = manifest.packets[0];
    assert.equal(packet.status, 'PREPARATION_ONLY_NOT_EXECUTED');
    assert.equal(packet.council_verdict, 'NOT_REQUESTED');
    assert.equal(packet.teacher_verdict, 'NOT_REQUESTED');
    assert.equal(packet.candidate_sha, null);
    assert.equal(packet.ci_receipt, null);
    assert.equal(packet.production_receipt, null);
    assert.equal(packet.source, 'canonical_roadmap_registry_not_live_D1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
