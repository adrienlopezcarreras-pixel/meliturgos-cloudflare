#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const codeOnly = value => {
  const code = String(value ?? '');
  return /^[A-Z][A-Z0-9_:-]{0,95}$/.test(code) ? code : 'PROVIDER_FAILURE_REDACTED';
};
const count = value => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
const publicModelIdentity = value => {
  const identity = String(value ?? '').trim();
  // Public provider/model IDs are useful for routing diagnostics, but never
  // print arbitrary text obtained from a provider error or request payload.
  return identity.includes('::') && /^[A-Za-z0-9@._:/+\\-]{1,160}$/.test(identity)
    ? identity : 'MODEL_ID_REDACTED';
};


// A release Council must have two independent zero-cost critiques and a real
// synthesis. Failed proofs expose bounded codes and counts, never prompt text.
export function evaluateCouncilReleaseProof(body) {
  const r = body?.result && typeof body.result === 'object' ? body.result : {};
  const critiques = Array.isArray(r.critiques) ? r.critiques : [];
  const identityPairs = critiques.map(c => [
    String(c?.provenance?.provider || '').trim(),
    String(c?.provenance?.model || '').trim(),
  ]);
  const uniquePairs = new Set(identityPairs.filter(pair => pair[0] && pair[1]).map(pair => pair.join('::'))).size;
  const summary = {
    critique_count: critiques.length,
    reported_independent_count: count(r.independent_response_count),
    reported_unique_model_count: count(r.unique_model_count),
    independently_identified_pairs: uniquePairs,
    provider_failure_count: count(r.provider_failure_count),
    failure_codes: (Array.isArray(r.failures) ? r.failures : []).slice(0, 8)
      .map(row => codeOnly(row?.code || row?.error_code)),
    failed_provider_models: (Array.isArray(r.failures) ? r.failures : []).slice(0, 8)
      .map(row => ({
        identity: publicModelIdentity(row?.identity),
        code: codeOnly(row?.code || row?.error_code),
      })),
    successful_provider_models: critiques.slice(0, 8)
      .map(row => publicModelIdentity(row?.identity)),
    rejection_codes: (Array.isArray(r.rejections) ? r.rejections : []).slice(0, 8)
      .map(row => codeOnly(row?.code)),
  };
  const verdict = code => ({ ok: code === 'MEL_COUNCIL_02_VERIFIED', code, summary });
  if (body?.ok !== true || body?.capability !== 'model.council') return verdict('MEL_COUNCIL_02_CAPABILITY_NOT_OK');
  if (critiques.length < 2) return verdict('MEL_COUNCIL_02_INDEPENDENT_CRITIQUES_MISSING');
  if (critiques.some(c => !c?.identity || !c?.provenance?.provider || !c?.provenance?.model))
    return verdict('MEL_COUNCIL_02_PROVENANCE_MISSING');
  if (summary.reported_independent_count < 2 || summary.reported_unique_model_count < 2 || uniquePairs < 2)
    return verdict('MEL_COUNCIL_02_UNIQUENESS_FAILED');
  if (r?.synthesis?.status !== 'COMPLETE' || !String(r?.synthesis?.text || '').trim())
    return verdict('MEL_COUNCIL_02_SYNTHESIS_FAILED');
  for (const c of critiques) {
    if (c?.cost?.allowed !== true || c?.cost?.policy !== 'MEL_ZERO_EURO_V1')
      return verdict('MEL_COUNCIL_02_ZERO_COST_PROOF_FAILED');
  }
  return verdict('MEL_COUNCIL_02_VERIFIED');
}

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
