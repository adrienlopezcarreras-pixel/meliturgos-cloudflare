#!/usr/bin/env node
// MEL-AUDIT-06: Workers AI text models offered by Cloudflare that MEL's
// ModelRegistry does not use yet. Each becomes a discovery for the mentor.
// Usage: node scripts/workers-ai-catalog-diff.mjs catalog.json > new-models.json
import { readFile } from 'node:fs/promises';
import { standardRegistry } from '../src/models/ModelRegistry.js';

export function newCatalogModels(catalog, registered) {
  const known = new Set(registered);
  const rows = Array.isArray(catalog?.result) ? catalog.result : [];
  const deprecated = row => (row?.properties || []).some(p => /deprecat/i.test(String(p?.property_id || '')));
  return rows
    .filter(row => /text generation/i.test(String(row?.task?.name || '')) && !deprecated(row))
    .map(row => String(row.name || ''))
    .filter(name => name.startsWith('@cf/') && !known.has(name))
    .sort();
}

// A model is paid when the catalog prices it above zero; MEL stays at 0 €.
function isPaid(row) {
  return (row?.properties || []).some(p => /^price$/i.test(String(p?.property_id || ''))
    && (Array.isArray(p?.value) ? p.value : [p?.value]).some(v => Number(v?.price ?? v) > 0));
}

// MEL-AUDIT-06: one idempotent benchmark proposal per new, free, live model.
// `registered` (the ModelRegistry ids) and `measured` (models already
// benchmarked) are explicit inputs: the registry is never an implicit global.
export function benchmarkProposals(catalog, { registered = [], measured = [] } = {}) {
  const rows = Array.isArray(catalog?.result) ? catalog.result : [];
  const paid = new Set(rows.filter(isPaid).map(row => String(row.name || '')));
  const excluded = [...registered, ...measured];
  return [...new Set(newCatalogModels(catalog, excluded))]
    .filter(name => !paid.has(name))
    .map(model => ({ id: `benchmark:${model}`, kind: 'BENCHMARK_PROPOSAL', model, status: 'PROPOSED' }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalog = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const registered = standardRegistry.list().map(m => m.id);
  const measured = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : [];
  process.stdout.write(JSON.stringify(process.argv.includes('--proposals')
    ? benchmarkProposals(catalog, { registered, measured })
    : newCatalogModels(catalog, registered)) + '\n');
}
