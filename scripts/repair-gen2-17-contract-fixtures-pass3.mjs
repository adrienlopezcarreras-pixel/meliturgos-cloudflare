// Re-run after the production GitHub Teacher bridge target-SHA propagation fix.
import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, text) { await fs.writeFile(path, text, 'utf8'); }

function replaceIfPresent(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count > 1) throw new Error(`${label}: expected at most 1 match, found ${count}`);
  return count === 1 ? text.replace(before, after) : text;
}

const helperImport = `import { completeTeacherCouncil, teacherReply, TEST_CANDIDATE_BRANCH, TEST_CANDIDATE_SHA } from './helpers/teacher-review-fixtures.mjs';`;

// Public Teacher test: keep the privacy assertions, but bind the request to the
// same complete Council + exact-SHA contract used by runtime.
{
  const path = 'tests/public-teacher-api.test.mjs';
  let text = await read(path);
  text = replaceIfPresent(
    text,
    `import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';`,
    `import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';\n${helperImport}`,
    'public Teacher helper import',
  );
  const legacyCouncil = `    council: { responses: [\n      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL' },\n      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL 2' },\n    ] },`;
  text = replaceIfPresent(text, legacyCouncil, `    council: completeTeacherCouncil(),`, 'public Teacher Council');
  text = replaceIfPresent(
    text,
    `candidate: { branch: 'candidate/augmentio-core', sha: 'abc1234' },`,
    `candidate: { branch: TEST_CANDIDATE_BRANCH, sha: TEST_CANDIDATE_SHA },`,
    'public Teacher candidate binding',
  );
  await write(path, text);
}

// Work DAG test: strict Teacher contract and one canonical candidate branch.
{
  const path = 'tests/work-dag-resume.test.mjs';
  let text = await read(path);
  text = replaceIfPresent(
    text,
    `} from '../src/work/work-dag.js';`,
    `} from '../src/work/work-dag.js';\n${helperImport}`,
    'work DAG helper import',
  );
  const legacyCouncil = `function council() {\n  return {\n    responses: [\n      { provider: 'workers-ai', model: 'zero-a', zero_added_cost: true, summary: 'A' },\n      { provider: 'workers-ai', model: 'zero-b', zero_added_cost: true, summary: 'B' },\n    ],\n  };\n}`;
  text = replaceIfPresent(text, legacyCouncil, `function council() { return completeTeacherCouncil(); }`, 'work DAG Council');
  text = text.replaceAll(`candidate/augmentio-core`, `candidate/mel-clean-autonomy`);
  text = replaceIfPresent(text, `candidateSha: 'abc1234'`, `candidateSha: TEST_CANDIDATE_SHA`, 'work DAG reviewed candidate SHA');
  text = text.replaceAll(`expectedCandidateSha: 'abc1234'`, `expectedCandidateSha: TEST_CANDIDATE_SHA`);
  text = replaceIfPresent(
    text,
    `{ request_id: 'wrong', verdict: 'APPROVE_PLAN' }`,
    `teacherReply('wrong')`,
    'work DAG wrong reply',
  );
  const matching = `    request_id: request.request_id,\n    verdict: 'APPROVE_PLAN',\n    feedback: 'Proceed with bounded implementation.',`;
  text = replaceIfPresent(text, matching, `    ...teacherReply(request.request_id, { feedback: 'Proceed with bounded implementation.' }),`, 'work DAG matching reply');
  await write(path, text);
}

// Council API is intentionally preflight/fail-closed and mocked providers are
// explicitly marked zero added cost only inside Node tests.
{
  const path = 'tests/council-api.test.mjs';
  let text = await read(path);
  text = replaceIfPresent(
    text,
    `import worker from '../src/index.js';\n\nconst auth`,
    `import worker from '../src/index.js';\n\nprocess.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';\n\nconst auth`,
    'council API zero-cost proof',
  );
  text = replaceIfPresent(text, `assert.equal(body.state_of_play.council.mel_synthesis.development_allowed, true);`, `assert.equal(body.state_of_play.council.mel_synthesis.development_allowed, false);`, 'council API fail-closed expectation');
  text = replaceIfPresent(text, `assert.equal(body.development_allowed, true);`, `assert.equal(body.development_allowed, false);`, 'council API fail-closed top-level expectation');
  await write(path, text);
}

// Runtime fixture must prove zero added cost, use the canonical candidate, and
// echo the exact reviewed SHA in every structured Teacher reply.
{
  const path = 'tests/autonomy-runtime.test.mjs';
  let text = await read(path);
  text = replaceIfPresent(
    text,
    `import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';\n\nconst CANDIDATE_HEAD_SHA`,
    `import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';\n\nprocess.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';\n\nconst CANDIDATE_HEAD_SHA`,
    'autonomy runtime zero-cost proof',
  );
  text = text.replaceAll(`candidate/augmentio-core`, `candidate/mel-clean-autonomy`);
  text = text.replaceAll(`candidate%2Faugmentio-core`, `candidate%2Fmel-clean-autonomy`);
  text = text.replace(
    /(kind: 'TEACHER_REPLY',\n\s+request_id: [^\n]+,\n)(?!\s+target_sha:)/g,
    `$1    target_sha: CANDIDATE_HEAD_SHA,\n`,
  );
  await write(path, text);
}

// Our direct reconciler repair already uses a shared canonical fixture. Make
// only the in-memory repository isolation idempotent if it is still missing.
{
  const path = 'tests/github-reply-reconciler.test.mjs';
  let text = await read(path);
  text = text.replaceAll(`const repo = new D1DevJobRepository(null);`, `const repo = new D1DevJobRepository(null, { memoryStore: new Map() });`);
  await write(path, text);
}

console.log('GEN2-17 fixture repair pass 3 applied.');
