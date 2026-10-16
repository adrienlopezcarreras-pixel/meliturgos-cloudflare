import { pathToFileURL } from 'node:url';
import { appendFileSync } from 'node:fs';

export const RELEASE_BRANCH = 'release/mel-hardware-v0.1.0';
export const REPO = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const SHA40 = /^[0-9a-f]{40}$/i;
const STALE_PENDING_STATUSES = new Set(['queued', 'pending', 'waiting', 'requested']);

export function findStaleQueuedDeploys(runs, mainSha) {
  if (!Array.isArray(runs)) throw new Error('RELEASE_RUN_LIST_MISSING');
  if (!SHA40.test(String(mainSha || ''))) throw new Error('CANONICAL_MAIN_SHA_INVALID');
  return runs.filter(row =>
    row?.name === 'deploy-cloudflare-release' &&
    row?.head_branch === RELEASE_BRANCH &&
    STALE_PENDING_STATUSES.has(String(row?.status || '').toLowerCase()) &&
    SHA40.test(String(row?.head_sha || '')) &&
    row.head_sha !== mainSha &&
    Number.isSafeInteger(row?.id) && row.id > 0
  );
}


export function assertNoActiveDeploy(runs) {
  if (!Array.isArray(runs)) throw new Error('RELEASE_RUN_LIST_MISSING');
  if (runs.some(row => row?.name === 'deploy-cloudflare-release' && String(row?.status || '').toLowerCase() !== 'completed')) {
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
    return response.status === 204 || response.status === 202 ? null : await response.json();
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
  let releaseRuns = (await api(activeRunsRoute))?.workflow_runs;
  if (!Array.isArray(releaseRuns)) assertNoActiveDeploy(releaseRuns);

  // A concurrency-queued release can become stale when main advances while
  // an older deployment is active. Cancel only known stale runs that are still
  // queued, after re-reading each run immediately before cancellation. Never
  // cancel an in-progress production deployment.
  const cancelledStaleQueuedRunIds = [];
  for (const candidate of findStaleQueuedDeploys(releaseRuns, mainSha)) {
    const latest = await api('/actions/runs/' + candidate.id);
    const latestStatus = String(latest?.status || '').toLowerCase();
    const latestSha = String(latest?.head_sha || '');
    if (!STALE_PENDING_STATUSES.has(latestStatus) || !SHA40.test(latestSha) || latestSha === mainSha ||
        latest?.name !== 'deploy-cloudflare-release' || latest?.head_branch !== RELEASE_BRANCH) continue;
    await api('/actions/runs/' + candidate.id + '/cancel', { method: 'POST' });
    cancelledStaleQueuedRunIds.push(candidate.id);
  }
  if (cancelledStaleQueuedRunIds.length) {
    releaseRuns = (await api(activeRunsRoute))?.workflow_runs;
  }

  // An active production deployment still owns the lock. Defer and let its
  // workflow_run completion trigger catch-up; stale queued releases are not
  // allowed to consume the next slot with an outdated SHA.
  try {
    assertNoActiveDeploy(releaseRuns);
  } catch (error) {
    if (error?.message !== 'PRODUCTION_DEPLOY_ALREADY_ACTIVE') throw error;
    const active = releaseRuns.find(row => row?.name === 'deploy-cloudflare-release' && String(row?.status || '').toLowerCase() !== 'completed');
    return { accepted: false, reason: 'PRODUCTION_DEPLOY_ALREADY_ACTIVE', main_sha: mainSha, release_branch: RELEASE_BRANCH,
      blocking_run_id: Number.isSafeInteger(active?.id) ? active.id : null,
      blocking_run_sha: SHA40.test(String(active?.head_sha || '')) ? active.head_sha : null,
      blocking_run_status: ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(String(active?.status || '').toLowerCase()) ? String(active.status).toLowerCase() : 'unknown',
      ...(cancelledStaleQueuedRunIds.length ? { cancelled_stale_queued_run_ids: cancelledStaleQueuedRunIds } : {}) };
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
  // Main may advance while the release pointer is being verified. Do not
  // dispatch a stale SHA; the next reconciliation will promote newer main.
  const latestMainSha = String((await api('/branches/main'))?.commit?.sha || '');
  if (!SHA40.test(latestMainSha) || latestMainSha !== mainSha) {
    throw new Error('CANONICAL_MAIN_CHANGED_BEFORE_DISPATCH');
  }
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
    .then(result => {
      console.log(JSON.stringify(result));
      const outcome = result.accepted ? 'DISPATCHED' : 'DEFERRED';
      console.log('::notice title=MEL production release decision::' + outcome + ': ' + String(result.reason || 'ACCEPTED'));
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '## MEL release decision\n\n- Outcome: **' + outcome + '**\n- Reason: ' + String(result.reason || 'ACCEPTED') + '\n- SHA: ' + String(result.main_sha || '') + '\n\nWorkflow success is not production deployment proof.\n');
    })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
