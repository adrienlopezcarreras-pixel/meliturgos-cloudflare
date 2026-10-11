import { pathToFileURL } from 'node:url';

export const RELEASE_BRANCH = 'release/mel-hardware-v0.1.0';
export const REPO = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const SHA40 = /^[0-9a-f]{40}$/i;

export function assertNoActiveDeploy(runs) {
  if (!Array.isArray(runs)) throw new Error('RELEASE_RUN_LIST_MISSING');
  if (runs.some(row => row?.name === 'deploy-cloudflare-release' && ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(row?.status))) {
    throw new Error('PRODUCTION_DEPLOY_ALREADY_ACTIVE');
  }
}

export async function requestAutonomousRelease({ token, fetchImpl = fetch, repo = REPO, requireProtectedRefs = false } = {}) {
  if (repo !== REPO) throw new Error('UNEXPECTED_RELEASE_REPOSITORY');
  if (typeof token !== 'string' || !token) throw new Error('GH_TOKEN_REQUIRED');
  const base = 'https://api.github.com/repos/' + repo;
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  async function api(route, { method = 'GET', payload } = {}) {
    const response = await fetchImpl(base + route, {
      method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (!response.ok) throw new Error('GITHUB_API_' + method + '_FAILED_' + response.status + ':' + route.split('?')[0]);
    return response.status === 204 ? null : await response.json();
  }
  const main = await api('/branches/main');
  const mainSha = String(main?.commit?.sha || '');
  if (!SHA40.test(mainSha)) throw new Error('CANONICAL_MAIN_SHA_INVALID');
  const release = await api('/branches/' + RELEASE_BRANCH);
  const releaseSha = String(release?.commit?.sha || '');
  if (!SHA40.test(releaseSha)) throw new Error('RELEASE_SHA_INVALID');
  // Push-initiated unattended production promotions need real GitHub branch
  // safeguards, not just a green commit or a repository-variable toggle.
  if (requireProtectedRefs && (main?.protected !== true || release?.protected !== true)) {
    throw new Error('PROTECTED_MAIN_AND_RELEASE_BRANCHES_REQUIRED');
  }

  // Workflow_dispatch runs use head_branch=main, while push runs use the
  // release branch. Scan recent runs across both events, not only release pushes.
  const activeRunsRoute = '/actions/workflows/deploy-cloudflare-release.yml/runs?per_page=100';
  assertNoActiveDeploy((await api(activeRunsRoute))?.workflow_runs);
  // A successful release must not recursively re-dispatch itself when
  // production and canonical main already have the same release pointer.
  if (releaseSha === mainSha) {
    return { accepted: false, reason: 'ALREADY_CURRENT', main_sha: mainSha, release_branch: RELEASE_BRANCH };
  }
  if (releaseSha !== mainSha) {
    // A non-force update rejects diverged refs; never rewrite deployed history.
    await api('/git/refs/heads/' + RELEASE_BRANCH, {
      method: 'PATCH', payload: { sha: mainSha, force: false },
    });
    const updated = await api('/branches/' + RELEASE_BRANCH);
    if (updated?.commit?.sha !== mainSha) throw new Error('RELEASE_POINTER_NOT_VERIFIED');
  }
  // GITHUB_TOKEN pushes do not start downstream workflows. An explicit
  // workflow_dispatch is necessary for autonomous releases from MEL Actions.
  assertNoActiveDeploy((await api(activeRunsRoute))?.workflow_runs);
  await api('/actions/workflows/deploy-cloudflare-release.yml/dispatches', {
    method: 'POST',
    payload: {
      ref: 'main',
      inputs: {
        release_branch: RELEASE_BRANCH,
        expected_sha: mainSha,
        approval: 'AUTONOMOUS_POLICY',
        autonomous_release: 'true',
        owner_max_autorelease: 'false',
      },
    },
  });
  return { accepted: true, main_sha: mainSha, release_branch: RELEASE_BRANCH };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  requestAutonomousRelease({
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    requireProtectedRefs: process.env.MEL_REQUIRE_PROTECTED_REFS === 'true',
  })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
