#!/usr/bin/env node
// Read-only backlog: a declared DONE_VERIFIED status is never itself a proof.
// Running this command does not write a receipt or upgrade any roadmap item.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';

export function buildRoadmapProofBacklog(items = flattenRoadmap(), sources = ROADMAP_PROOF_SOURCES) {
  const remaining = items.filter(item => item.status === 'DONE_VERIFIED' &&
    !Object.hasOwn(sources, item.id)).map(({ id, title, next, priority }) => ({
      id, title, priority, next,
      proof_status: 'DECLARED',
      // Guidance is not evidence. Code receipts and runtime results are evaluated elsewhere.
      next_action: 'Inspect existing execution receipts, runtime capability coverage or exact-SHA acceptance before making any mapping',
    }));
  return { schema: 'mel.roadmap-proof-backlog/v1', generated_at: new Date().toISOString(),
    source: 'master-roadmap + roadmap-truth', remaining_count: remaining.length, items: remaining };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(JSON.stringify(buildRoadmapProofBacklog(), null, 2) + '\n');
}
