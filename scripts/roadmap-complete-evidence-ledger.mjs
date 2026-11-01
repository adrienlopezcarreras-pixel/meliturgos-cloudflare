#!/usr/bin/env node
// Read-only, exhaustive ledger: source mappings are NOT runtime certifications.
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function createCompleteEvidenceLedger(items = flattenRoadmap(), sources = ROADMAP_PROOF_SOURCES, runtimeTruth = null) {
  const runtimeAvailable = runtimeTruth?.available === true;
  if (runtimeAvailable && runtimeTruth.total !== items.length) throw new Error('ROADMAP_RUNTIME_TOTAL_MISMATCH');
  const seen = new Set();
  const rows = items.map(item => {
    if (seen.has(item.id)) throw new Error('DUPLICATE_ROADMAP_ID: '+item.id);
    seen.add(item.id);
    const mapped = Object.hasOwn(sources, item.id);
    const source = mapped ? sources[item.id] : null;
    const hasRuntimeMapping = Boolean(source && ((source.capabilities?.length || 0) + (source.computerActions?.length || 0)) > 0);
    const runtime = runtimeAvailable ? runtimeTruth.items?.[item.id] : null;
    if (runtimeAvailable && !runtime) throw new Error('ROADMAP_RUNTIME_ITEM_MISSING: '+item.id);
    return {
      id: item.id,
      title: item.title,
      declared_status: item.status,
      priority: item.priority,
      source_mapping: hasRuntimeMapping ? 'MAPPED_NOT_CERTIFIED' : 'NO_SOURCE',
      required_runtime_capabilities: [...(source?.capabilities || [])],
      required_computer_actions: [...(source?.computerActions || [])],
      production_verification: runtime?.truth || 'NOT_EVALUATED',
      production_receipt: runtime?.truth === 'VERIFIED_LIVE' ? { last_proof_at:runtime.last_proof_at || null, proofs:runtime.proofs || [] } : null,
      verified_live: runtime?.truth === 'VERIFIED_LIVE',
    };
  });
  const orphanMappings = Object.keys(sources).filter(id => !seen.has(id)).sort();
  return {
    schema:'mel.complete-roadmap-evidence-ledger/v1',
    generated_at:new Date().toISOString(),
    disclaimer:runtimeAvailable ? 'Runtime proof reflects supplied D1 audit evidence; source mappings and historical declared statuses alone never certify production.' : 'Declared DONE_VERIFIED and source mappings do not prove live execution. No D1 audit logs or production receipts were evaluated.',
    summary:{
      total:rows.length,
      mapped_not_certified:rows.filter(x=>x.source_mapping==='MAPPED_NOT_CERTIFIED').length,
      without_source:rows.filter(x=>x.source_mapping==='NO_SOURCE').length,
      verified_live:rows.filter(x=>x.verified_live).length,
      production_not_evaluated:rows.filter(x=>x.production_verification==='NOT_EVALUATED').length,
      orphan_mapping_count:orphanMappings.length,
    },
    orphan_mappings:orphanMappings,
    items:rows,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(JSON.stringify(createCompleteEvidenceLedger(),null,2)+'\n');
}
