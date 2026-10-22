import { pathToFileURL } from 'node:url';

export function earlierSuccessfulDeployRuns(runs, { runId, sha }) {
  return (Array.isArray(runs) ? runs : [])
    .filter(run => run?.name === 'deploy-cloudflare-release'
      && run?.head_sha === sha
      && Number.isSafeInteger(run?.id)
      && run.id < runId);
}

export async function assertNotDuplicateRelease({ token, repository, runId, sha, fetchImpl = fetch }) {
  if (!token || !/^[a-z\d_.-]+\/[a-z\d_.-]+$/i.test(repository || '')
      || !Number.isSafeInteger(runId) || runId <= 0 || !/^[a-f\d]{40}$/i.test(sha || '')) {
    throw new Error('RELEASE_DUPLICATE_GATE_INVALID_CONTEXT');
  }
  const base = 'https://api.github.com/repos/' + repository;
  const headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28' };
  async function get(path) {
    const response = await fetchImpl(base + path, { headers });
    if (!response.ok) throw new Error('RELEASE_DUPLICATE_GATE_GITHUB_' + response.status);
    return response.json();
  }
  const runs = (await get('/actions/workflows/deploy-cloudflare-release.yml/runs?per_page=100')).workflow_runs;
  if (!Array.isArray(runs)) throw new Error('RELEASE_DUPLICATE_GATE_RUNS_UNAVAILABLE');
  // Only a successful deploy job counts: failed or cancelled previous attempts remain retryable.
  for (const prior of earlierSuccessfulDeployRuns(runs, { runId, sha })) {
    const jobs = (await get('/actions/runs/' + prior.id + '/jobs?per_page=100')).jobs;
    if (!Array.isArray(jobs)) throw new Error('RELEASE_DUPLICATE_GATE_JOBS_UNAVAILABLE');
    if (jobs.some(job => job.name === 'deploy' && job.status === 'completed' && job.conclusion === 'success')) {
      throw new Error('RELEASE_SHA_ALREADY_DEPLOYED_IN_RUN_' + prior.id);
    }
  }
  return { duplicate: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertNotDuplicateRelease({
    token: process.env.GH_TOKEN,
    repository: process.env.GITHUB_REPOSITORY,
    runId: Number(process.env.GITHUB_RUN_ID),
    sha: process.env.EXPECTED_SHA,
  }).catch(error => {
    console.error('::error title=Duplicate release protection::' + error.message);
    process.exitCode = 1;
  });
}
