import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const workflowPath = new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url);
const source = await fs.readFile(workflowPath, 'utf8');
const marker = '      - name: Prepare and prove production autonomy launch evidence';
const start = source.indexOf(marker);
if (start < 0) throw new Error('RELEASE_PROOF_STEP_NOT_FOUND');
// [GPT] Block deployments with wrong ordering: exact-SHA binding and HTTP
// health must be verified before slower post-deployment autonomy probes.
const shaGate = source.indexOf('      - name: Verify owner auth binding and exact deployment immediately');
const httpGate = source.indexOf('      - name: Verify production HTTP');
const downstreamDispatch = source.indexOf('      - name: Dispatch decoupled downstream production proofs');
if (shaGate < 0 || httpGate < 0) throw new Error('RELEASE_PRIMARY_GATES_MISSING');
if (!(shaGate < httpGate && httpGate < downstreamDispatch && downstreamDispatch < start)) {
  throw new Error('RELEASE_PRIMARY_GATES_MUST_PRECEDE_DEEP_PROOFS');
}

const scriptPath = new URL('./release-autonomy-deep-proof.sh', import.meta.url);
const invocation = '          bash scripts/release-autonomy-deep-proof.sh';
const remainder = source.slice(start);
const nextStep = remainder.indexOf('      - name: ', marker.length);
const proofStep = nextStep < 0 ? remainder : remainder.slice(0, nextStep);
if (!proofStep.includes(invocation)) throw new Error('RELEASE_PROOF_ENTRYPOINT_MISSING');
if (!proofStep.includes('        timeout-minutes: 55')) throw new Error('RELEASE_PROOF_TIMEOUT_NOT_PRESERVED');
for (const name of ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','MEL_BACKUP_ENCRYPTION_KEY_B64','MEL_BACKUP_ENCRYPTION_KEY_ID','GITHUB_TOKEN']) {
  if (!proofStep.includes('          ' + name + ':')) throw new Error('RELEASE_PROOF_ENV_MISSING:' + name);
}
if (proofStep.indexOf(invocation) > proofStep.indexOf('        env:')) throw new Error('RELEASE_PROOF_ENTRYPOINT_AFTER_ENV');
// Contract: this script still runs inside the serialized deploy job.
// A future asynchronous split must provide an independent exact-SHA-bound proof
// credential and a durable gate for MAX; never silently skip this check.
if (!proofStep.includes('        shell: bash')) throw new Error('RELEASE_PROOF_SHELL_MISSING');
if (!proofStep.includes('          set -euo pipefail')) throw new Error('RELEASE_PROOF_FAIL_CLOSED_SHELL_MISSING');
const body = await fs.readFile(scriptPath, 'utf8');
if (!body.includes('MEL_RELEASE_EVIDENCE_PHASE=ALL_PROOFS_COMPLETE')) throw new Error('RELEASE_PROOF_END_MARKER_MISSING');
const tmp = path.join(os.tmpdir(), 'mel-release-proof-bash-n.sh');
await fs.writeFile(tmp, body, 'utf8');
const result = spawnSync('bash', ['-n', tmp], { encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || 'bash -n failed\n');
  process.exit(result.status || 1);
}
console.log('Release production proof shell parses cleanly.');
