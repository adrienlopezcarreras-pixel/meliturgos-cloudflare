#!/usr/bin/env node
// Offline, read-only preparation of MAX roadmap work packets.
// This is NOT execution, a Teacher/Council verdict, a D1 queue, or delivery proof.
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { flattenRoadmap, ROADMAP_REGISTRY_REVISION, isClosedRoadmapStatus } from '../src/roadmap/master-roadmap.js';

export function buildOfflinePackets(rows = flattenRoadmap()) {
  const ids = new Set();
  return rows.filter(row => {
    if (!row?.id || ids.has(row.id)) throw new Error('INVALID_OR_DUPLICATE_ROADMAP_ID');
    ids.add(row.id);
    return !isClosedRoadmapStatus(row.status);
  }).map(row => ({
    schema: 'mel.offline-roadmap-work-packet/v1',
    roadmap_id: row.id,
    title: row.title,
    priority: row.priority,
    registry_status: row.status,
    registry_revision: ROADMAP_REGISTRY_REVISION,
    source: 'canonical_roadmap_registry_not_live_D1',
    depends_on: row.depends_on || [],
    mode: row.mode || (row.code_paths?.length ? 'IMPLEMENT' : 'RESEARCH_AND_PROVE'),
    code_paths: row.code_paths || [],
    test_paths: row.test_paths || [],
    acceptance: row.acceptance || [],
    description: row.next || '',
    proof_required: row.required_proof || 'REAL_RUNTIME_EVIDENCE_REQUIRED',
    status: 'PREPARATION_ONLY_NOT_EXECUTED',
    council_verdict: 'NOT_REQUESTED',
    teacher_verdict: 'NOT_REQUESTED',
    candidate_sha: null,
    ci_receipt: null,
    production_receipt: null,
    notes: 'Inspect current exact-SHA files before editing; do not assume open registry status equals an active D1 job or the live set of 53 unverified objectives.'
  }));
}

export async function writeOfflinePackets(destination, rows = flattenRoadmap()) {
  const packets = buildOfflinePackets(rows);
  const outputDir = resolve(destination);
  await mkdir(outputDir, { recursive: true });
  const manifest = {
    schema: 'mel.offline-roadmap-work-packets/v1',
    registry_revision: ROADMAP_REGISTRY_REVISION,
    scope: 'registry_open_only_not_live_D1',
    packet_count: packets.length,
    independence: 'NO_MODEL_INFERENCE_NO_GITHUB_WRITE_NO_D1_WRITE',
    warning: 'Live roadmap progress and active jobs must be reconciled with production D1 before selecting any packet. These are plans, not code diffs or approvals.',
    packets
  };
  const file = join(outputDir, 'max-offline-packets.json');
  await writeFile(file, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { file, count: packets.length };
}

if (process.argv[1] && import.meta.url === new URL('file://' + resolve(process.argv[1])).href) {
  const out = process.argv[2] || 'artifacts/max-offline-packets';
  const result = await writeOfflinePackets(out);
  process.stdout.write(JSON.stringify(result) + '\n');
}
