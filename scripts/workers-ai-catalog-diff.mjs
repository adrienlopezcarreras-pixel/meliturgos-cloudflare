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

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalog = JSON.parse(await readFile(process.argv[2], 'utf8'));
  process.stdout.write(JSON.stringify(newCatalogModels(catalog, standardRegistry.list().map(m => m.id))) + '\n');
}
