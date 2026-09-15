import test from 'node:test';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';

process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';

const CANDIDATE_HEAD_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

test('diagnostic: first autonomy heartbeat exposes sanitized runtime failure', async () => {
  let replies = '';
  let completions = '';
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response(replies, { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response(completions, { status: 200 });
    if (target.includes('/commits/candidate%2Fmel-clean-autonomy')) return Response.json({ sha: CANDIDATE_HEAD_SHA });
    if (target.includes('/actions/runs/4242')) {
      return Response.json({
        name: 'full-candidate-ci',
        head_sha: CANDIDATE_HEAD_SHA,
        head_branch: 'candidate/mel-clean-autonomy',
        status: 'completed',
        conclusion: 'success',
      });
    }
    if (target.startsWith('https://api.github.com/')) return new Response('rate-limited fixture', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) return new Response('export const fixture = true;\n// candidate technical source\n', { status: 200, headers: { etag: 'fixture-etag' } });
    return new Response('not found', { status: 404 });
  };
  const env = {
    MELITURGOS_USER: 'test',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_BRANCH: 'candidate/mel-clean-autonomy',
    MEL_TEACHER_BRANCH: 'candidate/mel-clean-autonomy',
    AI: {
      async run(model) {
        return { response: `FICHIERS: src/evolution/autonomy-runtime.js\nCHANGEMENTS: proposition bornee de ${model}\nREUTILISATION: composants existants\nTESTS: npm test\nRISQUES: faibles\nROLLBACK: revert candidate\nCRITERES_DE_FIN: CI complete verte` };
      },
    },
  };

  const result = await runAutonomyRuntimeTick(env, { fetchImpl, repository });
  const jobs = await repository.list();
  console.log('MEL_AUTONOMY_DIAGNOSTIC', JSON.stringify({
    ok: result?.ok,
    status: result?.status,
    runtime_error: result?.runtime_error,
    retry: result?.retry,
    ensured: result?.ensured,
    pre_ensure: result?.pre_ensure,
    job: result?.job,
    jobs: jobs.map((job) => ({ id: job.id, status: job.status, error: job.error, roadmap_id: job?.optional_context?.roadmap_id || null })),
  }));
});
