#!/usr/bin/env node
// Read-only, exhaustive ledger: source mappings are NOT runtime certifications.
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function createCompleteEvidenceLedger(items = flattenRoadmap(), sources = ROADMAP_PROOF_SOURCES) {
  const seen = new Set();
  const rows = items.map(item => {
    if (seen.has(item.id)) throw new Error('DUPLICATE_ROADMAP_ID: '+item.id);
    seen.add(item.id);
    const mapped = Object.hasOwn(sources, item.id);
    const source = mapped ? sources[item.id] : null;
    const hasRuntimeMapping = Boolean(source && ((source.capabilities?.length || 0) + (source.computerActions?.length || 0)) > 0);
    return {
      id: item.id,
      title: item.title,
      declared_status: item.status,
      priority: item.priority,
      source_mapping: hasRuntimeMapping ? 'MAPPED_NOT_CERTIFIED' : 'NO_SOURCE',
      required_runtime_capabilities: [...(source?.capabilities || [])],
      required_computer_actions: [...(source?.computerActions || [])],
      production_verification: 'NOT_EVALUATED',
      production_receipt: null,
      verified_live: false,
    };
  });
  const orphanMappings = Object.keys(sources).filter(id => !seen.has(id)).sort();
  return {
    schema:'mel.complete-roadmap-evidence-ledger/v1',
    generated_at:new Date().toISOString(),
    disclaimer:'Declared DONE_VERIFIED and source mappings do not prove live execution. No D1 audit logs or production receipts were evaluated.',
    summary:{
      total:rows.length,
      mapped_not_certified:rows.filter(x=>x.source_mapping==='MAPPED_NOT_CERTIFIED').length,
      without_source:rows.filter(x=>x.source_mapping==='NO_SOURCE').length,
      verified_live:0,
      production_not_evaluated:rows.length,
      orphan_mapping_count:orphanMappings.length,
    },
    orphan_mappings:orphanMappings,
    items:rows,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(JSON.stringify(createCompleteEvidenceLedger(),null,2)+'\n');
}
