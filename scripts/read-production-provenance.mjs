// Codex: read-only identity of the Worker actually serving production.
// GitHub success history is not authority after a cancelled post-deploy run.
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/i;
const VERSION = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PRODUCTION = 'https://meliturgos.adrien-lopezcarreras.workers.dev';
const fail = code => Object.assign(new Error(code), { code });

export function servedProductionSha(httpStatus, body) {
  if (body?.proof_source !== 'internal-exact-sha-cache') throw fail('PRODUCTION_IDENTITY_UNAVAILABLE');
  let sha;
  if (httpStatus === 200 && body?.ok === true && ['GO_FOR_SUPERVISED_AUTONOMY', 'NO_GO'].includes(body.status)) sha = body.candidate_sha;
  // These existing server responses expose the compiled runtime SHA only
  // after comparing it to the cached SHA. A stale GO is never a launch grant.
  if (httpStatus === 503 && body?.ok === false) {
    if (body.status === 'PUBLIC_LAUNCH_READINESS_CACHE_SHA_MISMATCH') sha = body.expected_sha;
    if (body.status === 'PUBLIC_LAUNCH_READINESS_CACHE_STALE') sha = body.candidate_sha;
  }
  if (!SHA.test(String(sha || ''))) throw fail('PRODUCTION_IDENTITY_UNAVAILABLE');
  return sha.toLowerCase();
}

export function stableProductionVersionId(body) {
  if (body?.success === false) throw fail('PRODUCTION_VERSION_READ_FAILED');
  const root = body?.result ?? body;
  const rows = Array.isArray(root) ? root : root?.deployments;
  const versions = rows?.[0]?.versions;
  if (!Array.isArray(versions) || versions.length !== 1 || Number(versions[0]?.percentage) !== 100
      || !VERSION.test(String(versions[0]?.version_id || ''))) throw fail('PRODUCTION_VERSION_NOT_STABLE');
  return versions[0].version_id;
}

export async function observeProductionProvenance({ accountId, apiToken, fetchImpl = fetch } = {}) {
  if (!/^[0-9a-f]{32}$/i.test(String(accountId || '')) || !apiToken) throw fail('PRODUCTION_OBSERVATION_CREDENTIALS_MISSING');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/meliturgos/deployments`;
  async function read(target, headers = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetchImpl(target, { method: 'GET', headers, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000) });
        return { status: response.status, body: await response.json() };
      } catch { /* bounded transport retry; no error payload is disclosed */ }
    }
    throw fail('PRODUCTION_OBSERVATION_TRANSPORT_FAILED');
  }
  async function version() {
    const result = await read(url, { authorization: `Bearer ${apiToken}` });
    if (result.status !== 200) throw fail('PRODUCTION_VERSION_READ_FAILED');
    return stableProductionVersionId(result.body);
  }
  async function identity() {
    const result = await read(PRODUCTION + '/api/teacher/launch-readiness');
    return servedProductionSha(result.status, result.body);
  }
  const beforeVersion = await version();
  const beforeSha = await identity();
  const afterSha = await identity();
  const afterVersion = await version();
  if (beforeSha !== afterSha || beforeVersion !== afterVersion) throw fail('PRODUCTION_OBSERVATION_CHANGED');
  return { deployed_sha: beforeSha, cloudflare_version_id: beforeVersion, proof_source: 'live-worker-and-cloudflare-deployment', observed_at: new Date().toISOString(), launch_approval_granted: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const proof = await observeProductionProvenance({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiToken: process.env.CLOUDFLARE_API_TOKEN });
    process.stdout.write(JSON.stringify(proof, null, 2) + '\n');
  } catch (error) {
    console.error(error?.code || 'PRODUCTION_OBSERVATION_FAILED');
    process.exitCode = 1;
  }
}
