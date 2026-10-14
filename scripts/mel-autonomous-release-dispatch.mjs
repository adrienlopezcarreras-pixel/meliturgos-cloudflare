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

export async function requestAutonomousRelease({ token, fetchImpl = fetch, repo = REPO, requireProtectedRefs = false, completedReleaseSha = '', skipPreviouslyCompletedSha = false, sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
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
  // workflow_run events arrive after the release has finished. Only catch up
  // when main advanced during that release. A failing unchanged release must
  // never trigger an infinite chain of identical deployments.
  const completedSha = String(completedReleaseSha || '').trim();
  if (completedSha && !SHA40.test(completedSha)) throw new Error('COMPLETED_RELEASE_SHA_INVALID');
  if (completedSha && completedSha === mainSha) {
    return { accepted:false, reason:'NO_NEW_MAIN_SINCE_COMPLETED_RELEASE', main_sha:mainSha, release_branch:RELEASE_BRANCH };
  }
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
  const releaseRuns = (await api(activeRunsRoute))?.workflow_runs;
  // A push while a release is already running is an expected deferral, not
  // a deployment failure. The completed-release event performs catch-up.
  // Keep the separate second check fail-closed for a race after ref promotion.
  try {
    assertNoActiveDeploy(releaseRuns);
  } catch (error) {
    if (error?.message !== 'PRODUCTION_DEPLOY_ALREADY_ACTIVE') throw error;
    return { accepted: false, reason: 'PRODUCTION_DEPLOY_ALREADY_ACTIVE', main_sha: mainSha, release_branch: RELEASE_BRANCH };
  }
  // A previous completed attempt for the latest SHA means a catch-up event
  // must not schedule a duplicate after that SHA failed. A manual dispatch
  // remains possible for an intentional, supervised retry.
  if ((completedSha || skipPreviouslyCompletedSha) && releaseRuns.some(row =>
    row?.name === 'deploy-cloudflare-release' && row?.head_sha === mainSha &&
    row?.status === 'completed'
  )) {
    return { accepted:false, reason:'LATEST_MAIN_ALREADY_ATTEMPTED', main_sha:mainSha, release_branch:RELEASE_BRANCH };
  }
  // The release ref alone is not proof of a completed production deployment.
  // A prior pointer update can succeed while the subsequent confirmation or
  // workflow dispatch fails. Only a successful exact-SHA release is current.
  const alreadyReleased = releaseRuns.some(row =>
    row?.name === 'deploy-cloudflare-release' &&
    row?.head_sha === mainSha &&
    row?.status === 'completed' && row?.conclusion === 'success'
  );
  if (releaseSha === mainSha && alreadyReleased) {
    return { accepted: false, reason: 'ALREADY_CURRENT', main_sha: mainSha, release_branch: RELEASE_BRANCH };
  }
  if (releaseSha !== mainSha) {
    // Never force-push a release pointer or dispatch an unverified SHA.
    await api('/git/refs/heads/' + RELEASE_BRANCH, {
      method: 'PATCH', payload: { sha: mainSha, force: false },
    });
    let confirmed = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const updated = await api('/branches/' + RELEASE_BRANCH);
      if (updated?.commit?.sha === mainSha) { confirmed = true; break; }
      if (attempt < 5) await sleepImpl(750 * (attempt + 1));
    }
    if (!confirmed) throw new Error('RELEASE_POINTER_NOT_VERIFIED');
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
    completedReleaseSha: process.env.MEL_CATCHUP_COMPLETED_SHA || '',
    skipPreviouslyCompletedSha: process.env.MEL_SKIP_ALREADY_ATTEMPTED_SHA === 'true',
  })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
