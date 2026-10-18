#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { evaluateCouncilReleaseProof } from '../src/models/model-council-evidence.js';
export { evaluateCouncilReleaseProof } from '../src/models/model-council-evidence.js';

export async function checkCouncilReleaseFile(path) {
  const body = JSON.parse(await readFile(path, 'utf8'));
  const result = evaluateCouncilReleaseProof(body);
  const writer = result.ok ? console.log : console.error;
  writer(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkCouncilReleaseFile(process.argv[2]).catch(() => {
    // Never print raw provider response or exception messages into release logs.
    console.error(JSON.stringify({ ok: false, code: 'MEL_COUNCIL_02_PROOF_READ_FAILED' }));
    process.exitCode = 1;
  });
}
