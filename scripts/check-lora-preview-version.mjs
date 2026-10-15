#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// A successful preview authentication response is not proof that the Worker
// serves the exact collector SHA. Do not expose any code.read content in logs.
export function assessLoraPreviewVersion(body, expectedSha) {
  const expected = String(expectedSha || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expected)) return { ok:false, code:'LORA_PREVIEW_EXPECTED_SHA_INVALID' };
  if (body?.ok !== true || body?.capability !== 'code.read') {
    return { ok:false, code:'LORA_PREVIEW_CODE_PROOF_MISSING' };
  }
  const proof = body.result;
  if (proof?.exact_deployment_identity_known !== true || proof?.deployed_branch !== 'reconcile/mel-candidate-20261014') {
    return { ok:false, code:'LORA_PREVIEW_IDENTITY_UNVERIFIED' };
  }
  if (String(proof?.deployed_sha || '').toLowerCase() !== expected) {
    return { ok:false, code:'LORA_PREVIEW_SHA_MISMATCH' };
  }
  return { ok:true, code:'LORA_PREVIEW_EXACT_SHA_VERIFIED', sha:expected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expected = process.argv[3];
  try {
    const body = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = assessLoraPreviewVersion(body, expected);
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 2;
  } catch {
    console.error(JSON.stringify({ ok:false, code:'LORA_PREVIEW_VERSION_PROOF_INVALID' }));
    process.exitCode = 2;
  }
}
