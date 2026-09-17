#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

async function cfJson(url, init) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    const message = data?.errors?.map?.((x) => x?.message).filter(Boolean).join('; ')
      || data?.error
      || `HTTP_${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function uploadAsset({ accountId, token, finetuneId, dir, filename }) {
  const bytes = await readFile(path.join(dir, filename));
  const form = new FormData();
  form.append('file_name', filename);
  form.append('file', new Blob([bytes]), filename);
  await cfJson(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/finetunes/${encodeURIComponent(finetuneId)}/finetune-assets/`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  );
}

async function main() {
  const args = argsMap(process.argv.slice(2));
  const dir = path.resolve(args.get('--dir') || '');
  if (!args.get('--dir')) throw new Error('USAGE: upload-cloudflare-lora.mjs --dir <trained-adapter-dir> [--name mel-lora-smoke]');
  const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
  if (!accountId || !token) throw new Error('CLOUDFLARE_ACCOUNT_ID_AND_API_TOKEN_REQUIRED');

  const artifactPath = path.join(dir, 'artifact-evidence.json');
  const trainingPath = path.join(dir, 'training-evidence.json');
  const artifact = JSON.parse(await readFile(artifactPath, 'utf8'));
  const training = JSON.parse(await readFile(trainingPath, 'utf8'));
  const name = args.get('--name') || `mel-${String(training.plan_id || 'lora').slice(0, 48)}`;

  const created = await cfJson(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/finetunes`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: training.runtime_model,
        name,
        description: `MEL LoRA ${training.plan_id || ''} ${training.training_manifest_digest || ''}`.slice(0, 240),
      }),
    },
  );
  const result = Array.isArray(created?.result) ? created.result[0] : created?.result;
  const finetuneId = String(result?.id || result?.name || '').trim();
  if (!finetuneId) throw new Error('CLOUDFLARE_FINETUNE_ID_MISSING');

  await uploadAsset({ accountId, token, finetuneId, dir, filename: 'adapter_model.safetensors' });
  await uploadAsset({ accountId, token, finetuneId, dir, filename: 'adapter_config.json' });

  const updated = {
    ...artifact,
    finetune_id: finetuneId,
    uri: `cloudflare-finetune:${finetuneId}`,
  };
  await writeFile(artifactPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  process.stdout.write(JSON.stringify({
    status: 'UPLOADED_UNBENCHMARKED',
    finetune_id: finetuneId,
    runtime_model: training.runtime_model,
    artifact_digest: updated.digest,
    training_manifest_digest: updated.training_manifest_digest,
    dataset_digest: updated.dataset_digest,
    artifact_evidence: artifactPath,
  }, null, 2) + '\n');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
