#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const EXPECTED_PREVIEW_BRANCH = 'reconcile/mel-candidate-20261014';

// A deployed exact SHA is not a sufficient proof: the same deployment can
// fail its isolated D1/ShardVault/autonomy validation after Worker upload.
export function assessLoraPreviewWorkflowRun(body, expectedSha) {
  const sha = String(expectedSha || '').toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) return { ok: false, code: 'LORA_PREVIEW_EXPECTED_SHA_INVALID' };
  if (!Array.isArray(body?.workflow_runs)) return { ok: false, code: 'LORA_PREVIEW_WORKFLOW_EVIDENCE_INVALID' };
  const matching = body.workflow_runs.filter(run =>
    run?.name === 'deploy-candidate-preview'
    && run?.head_sha === sha
    && run?.head_branch === EXPECTED_PREVIEW_BRANCH
    && (run?.event === 'push' || run?.event === 'workflow_dispatch')
    && Number.isSafeInteger(run?.id) && run.id > 0
  );
  if (!matching.length) return { ok: false, code: 'LORA_PREVIEW_WORKFLOW_NOT_FOUND' };
  // Always select the newest run, including any failed or active reattempt.
  // An old SUCCESS must never mask a newer FAILED or IN_PROGRESS attempt.
  matching.sort((a,b) => b.id - a.id);
  const latest = matching[0];
  if (latest.status !== 'completed' || latest.conclusion !== 'success') {
    return { ok: false, code: 'LORA_PREVIEW_WORKFLOW_NOT_SUCCESSFUL', run_id: latest.id };
  }
  return { ok: true, code: 'LORA_PREVIEW_WORKFLOW_SUCCESS_VERIFIED', run_id: latest.id, sha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const body = JSON.parse(await readFile(process.argv[2], 'utf8'));
    const result = assessLoraPreviewWorkflowRun(body, process.argv[3]);
    // Only non-sensitive verdict metadata; never print API response body.
    console.log(JSON.stringify(result));
    if (!result.ok) process.exitCode = 2;
  } catch {
    console.error(JSON.stringify({ ok: false, code: 'LORA_PREVIEW_WORKFLOW_PROOF_READ_FAILED' }));
    process.exitCode = 2;
  }
}
