import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, text) { await fs.writeFile(path, text, 'utf8'); }

function replaceExact(text, before, after, label, expected = 1) {
  const count = text.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} match(es), found ${count}`);
  return text.split(before).join(after);
}

// Council API: mocked Workers AI is explicitly proven zero-added-cost only in Node tests.
{
  const path = 'tests/council-api.test.mjs';
  let text = await read(path);
  text = replaceExact(
    text,
    `import worker from '../src/index.js';\n\nconst auth`,
    `import worker from '../src/index.js';\n\nprocess.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';\n\nconst auth`,
    'council-api zero-cost test proof',
  );
  text = replaceExact(
    text,
    `assert.equal(body.development_allowed, true);`,
    `assert.equal(body.development_allowed, false);`,
    'council-api fail-closed development gate',
  );
  await write(path, text);
}

// Runtime tests use the same Node-only proof and every Teacher reply echoes the reviewed SHA.
{
  const path = 'tests/autonomy-runtime.test.mjs';
  let text = await read(path);
  text = replaceExact(
    text,
    `import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';\n\nconst CANDIDATE_HEAD_SHA`,
    `import { runAutonomyRuntimeTick } from '../src/evolution/autonomy-runtime.js';\n\nprocess.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '1';\n\nconst CANDIDATE_HEAD_SHA`,
    'autonomy runtime zero-cost test proof',
  );
  const replyPattern = /(request_id: (?:first\.teacher\.request_id|firstRequestId|requestId),\n)(\s+verdict:)/g;
  const matches = [...text.matchAll(replyPattern)].length;
  if (matches !== 6) throw new Error(`autonomy runtime exact-SHA replies: expected 6, found ${matches}`);
  text = text.replace(replyPattern, `$1    target_sha: CANDIDATE_HEAD_SHA,\n$2`);
  await write(path, text);
}

// Public Teacher feed test now creates a valid strict Council request while still testing redaction only.
{
  const path = 'tests/public-teacher-api.test.mjs';
  let text = await read(path);
  text = replaceExact(
    text,
    `import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';\n`,
    `import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';\nimport { completeTeacherCouncil, TEST_CANDIDATE_BRANCH, TEST_CANDIDATE_SHA } from './helpers/teacher-review-fixtures.mjs';\n`,
    'public Teacher strict helper import',
  );
  text = replaceExact(
    text,
`    council: { responses: [\n      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL' },\n      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL 2' },\n    ] },`,
`    council: completeTeacherCouncil(),`,
    'public Teacher strict Council',
  );
  text = replaceExact(
    text,
    `candidate: { branch: 'candidate/augmentio-core', sha: 'abc1234' },`,
    `candidate: { branch: TEST_CANDIDATE_BRANCH, sha: TEST_CANDIDATE_SHA },`,
    'public Teacher exact candidate binding',
  );
  await write(path, text);
}

// Work DAG Teacher test binds DAG, review request and reply to one exact SHA.
{
  const path = 'tests/work-dag-resume.test.mjs';
  let text = await read(path);
  text = replaceExact(
    text,
    `} from '../src/work/work-dag.js';\n`,
    `} from '../src/work/work-dag.js';\nimport { completeTeacherCouncil, TEST_CANDIDATE_SHA } from './helpers/teacher-review-fixtures.mjs';\n`,
    'Work DAG strict helper import',
  );
  text = replaceExact(
    text,
`function council() {\n  return {\n    responses: [\n      { provider: 'workers-ai', model: 'zero-a', zero_added_cost: true, summary: 'A' },\n      { provider: 'workers-ai', model: 'zero-b', zero_added_cost: true, summary: 'B' },\n    ],\n  };\n}`,
`function council() {\n  return completeTeacherCouncil();\n}`,
    'Work DAG strict Council',
  );
  text = replaceExact(text, `candidateSha: 'abc1234'`, `candidateSha: TEST_CANDIDATE_SHA`, 'Work DAG exact candidate SHA');
  text = replaceExact(text, `expectedCandidateSha: 'abc1234'`, `expectedCandidateSha: TEST_CANDIDATE_SHA`, 'Work DAG exact expected SHA', 2);
  text = replaceExact(
    text,
    `{ request_id: 'wrong', verdict: 'APPROVE_PLAN' }`,
    `{ request_id: 'wrong', target_sha: TEST_CANDIDATE_SHA, verdict: 'APPROVE_PLAN' }`,
    'Work DAG mismatched exact-SHA reply',
  );
  text = replaceExact(
    text,
    `request_id: request.request_id,\n    verdict: 'APPROVE_PLAN',`,
    `request_id: request.request_id,\n    target_sha: TEST_CANDIDATE_SHA,\n    verdict: 'APPROVE_PLAN',`,
    'Work DAG matching exact-SHA reply',
  );
  await write(path, text);
}

console.log('Current GEN2-17 fixtures repaired without weakening production guards.');
