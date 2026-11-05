import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';

// Diagnostic only: omit dependency source/prompts and never grant approval.
export function councilObjectionReceipt(body, expectedHead, expectedBase) {
  const valid = /^[a-f0-9]{40}$/.test(expectedHead || '')
    && /^[a-f0-9]{40}$/.test(expectedBase || '')
    && body?.head === expectedHead && body?.base === expectedBase;
  return {
    schema: 'mel.council-objections/v1', diagnostic_only: true, release_authorized: false,
    head: expectedHead, base: expectedBase,
    decision: valid && /^[A-Z0-9_]{1,80}$/.test(body?.decision || '') ? body.decision : 'UNAVAILABLE',
    reviews: valid ? (Array.isArray(body.reviews) ? body.reviews : []).slice(0, 8).map(row => ({
      model: String(row?.model || '').slice(0, 160),
      verdict: ['APPROVE', 'REJECT'].includes(row?.verdict) ? row.verdict : null,
      error_code: /^[A-Z0-9_]{1,80}$/.test(String(row?.error || '')) ? row.error : null,
      blocking: (Array.isArray(row?.blocking) ? row.blocking : [])
        .filter(value => typeof value === 'string').slice(0, 8).map(value => value.slice(0, 300)),
    })) : [],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!isAbsolute(process.argv[4] || '')) throw Error('COUNCIL_RECEIPT_ABSOLUTE_OUTPUT_REQUIRED');
  let body = {};
  try { body = JSON.parse(readFileSync(0, 'utf8')); } catch {}
  writeFileSync(process.argv[4], JSON.stringify(
    councilObjectionReceipt(body, process.argv[2], process.argv[3]), null, 2) + '\n');
}
