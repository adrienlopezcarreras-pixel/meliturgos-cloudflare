#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertAdapterArtifactForPlan } from '../src/learning/lora-plan.js';

function argsMap(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    out.set(key, value);
  }
  return out;
}

async function main() {
  const args = argsMap(process.argv.slice(2));
  const dirArg = args.get('--dir');
  if (!dirArg) throw new Error('USAGE: approve-lora-artifact.mjs --dir <trained-adapter-dir> [--approval-id <id>]');
  const dir = path.resolve(dirArg);

  const [plan, artifact] = await Promise.all([
    readFile(path.join(dir, 'lora-plan.json'), 'utf8').then(JSON.parse),
    readFile(path.join(dir, 'artifact-evidence.json'), 'utf8').then(JSON.parse),
  ]);

  const checked = assertAdapterArtifactForPlan({ plan, artifact });
  const approvalId = String(args.get('--approval-id') || `approval-${checked.digest.slice('sha256:'.length, 'sha256:'.length + 16)}`).trim();
  if (!approvalId) throw new Error('LORA_APPROVAL_ID_REQUIRED');

  const approval = {
    approved: true,
    approval_id: approvalId,
    artifact_id: checked.id,
    artifact_digest: checked.digest,
    finetune_id: checked.finetune_id,
    dataset_digest: checked.dataset_digest,
    training_manifest_digest: checked.training_manifest_digest,
    approved_at: new Date().toISOString(),
  };

  const output = path.join(dir, 'approval-evidence.json');
  await writeFile(output, JSON.stringify(approval, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({
    status: 'ARTIFACT_APPROVED_UNBENCHMARKED',
    approval_id: approval.approval_id,
    artifact_id: approval.artifact_id,
    artifact_digest: approval.artifact_digest,
    finetune_id: approval.finetune_id,
    dataset_digest: approval.dataset_digest,
    training_manifest_digest: approval.training_manifest_digest,
    approval_evidence: output,
  }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
