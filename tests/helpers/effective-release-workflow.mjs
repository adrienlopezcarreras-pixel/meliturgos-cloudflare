import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

// Single canonical test view of the deployed release script and its YAML entrypoint.
// Tests must fail closed if the workflow stops executing the extracted proof.
export async function readEffectiveReleaseWorkflow() {
  const workflow = await readFile(new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const proof = await readFile(new URL('../../scripts/release-autonomy-deep-proof.sh', import.meta.url), 'utf8');
  const entry = '          bash scripts/release-autonomy-deep-proof.sh';
  if (workflow.split(entry).length !== 2) throw new Error('RELEASE_PROOF_ENTRYPOINT_UNIQUE_REQUIRED');
  return workflow.replace(entry, proof.split('\n').map(line => '          ' + line).join('\n'));
}

// Keep synchronous top-level contract suites on the same canonical source.
export function readEffectiveReleaseWorkflowSync() {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  const proof = readFileSync(new URL('../../scripts/release-autonomy-deep-proof.sh', import.meta.url), 'utf8');
  const entry = '          bash scripts/release-autonomy-deep-proof.sh';
  if (workflow.split(entry).length !== 2) throw new Error('RELEASE_PROOF_ENTRYPOINT_UNIQUE_REQUIRED');
  return workflow.replace(entry, proof.split('\n').map(line => '          ' + line).join('\n'));
}
