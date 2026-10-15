#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// A preview error payload may include request details or provider messages.
// Emit only bounded machine-readable code and HTTP status; never raw text.
const safeCode = value => {
  const text = String(value ?? '');
  return /^[A-Z][A-Z0-9_:-]{0,95}$/.test(text) ? text : 'UNCLASSIFIED';
};
export function sanitizedPreviewWatchFailure(body, httpCode) {
  const http = Number(httpCode);
  return {
    ok: false,
    code: 'GEN2_42_PREVIEW_WATCH_HTTP_FAILED',
    http_status: Number.isInteger(http) && http >= 0 && http <= 599 ? http : 0,
    provider_code: safeCode(body?.code ?? body?.error?.code ?? body?.status ?? body?.error),
  };
}
export async function printPreviewWatchFailure(filename, httpCode) {
  let body = {};
  try { body = JSON.parse(await readFile(filename, 'utf8')); } catch {}
  console.error(JSON.stringify(sanitizedPreviewWatchFailure(body, httpCode)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  printPreviewWatchFailure(process.argv[2], process.env.WATCH_HTTP_CODE).catch(() => {
    console.error(JSON.stringify({ ok: false, code: 'GEN2_42_PREVIEW_WATCH_DIAGNOSTIC_FAILED' }));
    process.exitCode = 1;
  });
}
