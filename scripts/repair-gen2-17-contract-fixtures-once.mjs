import fs from 'node:fs/promises';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, text) { await fs.writeFile(path, text, 'utf8'); }

function replaceExact(text, before, after, label, expected = 1) {
  const count = text.split(before).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} match(es), found ${count}`);
  return text.split(before).join(after);
}

const REQUIRED_ROLES = `required_roles_succeeded: [\n      'ARCHITECTURE_REUSE',\n      'SECURITY_GOVERNANCE',\n      'TESTS_EVIDENCE',\n      'PRODUCT_INTEGRATION',\n    ],`;
const TEST_SHA_DECL = `const TEST_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';\n`;

// 1) Council endpoint is intentionally fail-closed until Teacher approval.
{
  const path = 'tests/council-api.test.mjs';
  let text = await read(path);
  text = replaceExact(text,
    `assert.equal(body.development_allowed, true);`,
    `assert.equal(body.development_allowed, false);`,
    'council-api development gate');
  await write(path, text);
}

// 2) Autonomous Work Loop fixtures now model the complete Council + exact-SHA Teacher contract.
{
  const path = 'tests/autonomous-work-loop.test.mjs';
  let text = await read(path);
  text = replaceExact(text,
    `import { JsonlTeacherChannel, readJsonl } from '../scripts/jsonl-teacher-channel.mjs';\n`,
    `import { JsonlTeacherChannel, readJsonl } from '../scripts/jsonl-teacher-channel.mjs';\n\n${TEST_SHA_DECL}`,
    'autonomous test SHA declaration');
  text = replaceExact(text,
`    council: { responses: [\n      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'A' },\n      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'B' },\n    ] },`,
`    council: {\n      status: 'COMPLETE',\n      phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',\n      all_required_roles_satisfied: true,\n      ${REQUIRED_ROLES}\n      responses: [\n        { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'A' },\n        { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'B' },\n      ],\n      synthesis: { status: 'COMPLETE', text: 'Council synthesis for Teacher review.' },\n      teacher_required: true,\n      development_allowed: false,\n      context: { target_sha: TEST_SHA },\n    },`,
    'autonomous complete Council');
  text = replaceExact(text, `candidateSha: 'abc9876'`, `candidateSha: TEST_SHA`, 'autonomous first candidate SHA');
  text = replaceExact(text, `expectedCandidateSha: 'abc9876'`, `expectedCandidateSha: TEST_SHA`, 'autonomous first expected SHA');
  text = replaceExact(text, `candidateSha: 'fed4321'`, `candidateSha: TEST_SHA`, 'autonomous second candidate SHA');
  text = replaceExact(text, `expectedCandidateSha: 'fed4321'`, `expectedCandidateSha: TEST_SHA`, 'autonomous second expected SHA');
  text = replaceExact(text,
    `await channel.submitReply({ request_id: request.request_id, verdict: 'APPROVE_PLAN', feedback: 'Continue.' });`,
    `await channel.submitReply({ request_id: request.request_id, target_sha: TEST_SHA, verdict: 'APPROVE_PLAN', feedback: 'Continue.' });`,
    'autonomous matching reply');
  text = replaceExact(text,
    `channel.replies.set(request.request_id, { request_id: 'wrong', verdict: 'APPROVE_PLAN' });`,
    `channel.replies.set(request.request_id, { request_id: 'wrong', target_sha: TEST_SHA, verdict: 'APPROVE_PLAN' });`,
    'autonomous mismatched reply');
  await write(path, text);
}

// 3) Development coordinator tests use a valid Council when testing downstream inspection/Teacher behavior.
{
  const path = 'tests/development-coordinator.test.mjs';
  let text = await read(path);
  text = replaceExact(text,
    `import { createDevelopmentJob, advanceDevelopmentJob, DEVELOPMENT_STATES } from '../src/evolution/development-coordinator.js';\n`,
    `import { createDevelopmentJob, advanceDevelopmentJob, DEVELOPMENT_STATES } from '../src/evolution/development-coordinator.js';\n\n${TEST_SHA_DECL}`,
    'development test SHA declaration');
  text = replaceExact(text,
`const councilResponses = [\n  { provider: 'mock-zero-a', model: 'a1', zero_added_cost: true, summary: 'Reuse existing coordinator and fail closed.' },\n  { provider: 'mock-zero-b', model: 'b1', zero_added_cost: true, summary: 'Require code inspection and complete validation evidence.' },\n];`,
`const councilResponses = [\n  { provider: 'mock-zero-a', model: 'a1', zero_added_cost: true, summary: 'Reuse existing coordinator and fail closed.' },\n  { provider: 'mock-zero-b', model: 'b1', zero_added_cost: true, summary: 'Require code inspection and complete validation evidence.' },\n];\n\nfunction strictCouncil() {\n  return {\n    status: 'COMPLETE',\n    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',\n    all_required_roles_satisfied: true,\n    ${REQUIRED_ROLES}\n    responses: councilResponses,\n    synthesis: { status: 'COMPLETE', text: 'Council synthesis for Teacher review.' },\n    teacher_required: true,\n    development_allowed: false,\n    context: { target_sha: TEST_SHA },\n  };\n}`,
    'development strict Council helper');
  text = replaceExact(text,
    `assert.throws(() => createTeacherReviewRequest({ goal: 'x', council: {}, inspection: { status: 'PARTIAL', evidence: [] } }), /TEACHER_INSPECTION_INCOMPLETE/);`,
    `assert.throws(() => createTeacherReviewRequest({ goal: 'x', council: strictCouncil(), inspection: { status: 'PARTIAL', evidence: [] } }), /TEACHER_INSPECTION_INCOMPLETE/);`,
    'development inspection test');
  text = replaceExact(text, `council: { responses: councilResponses },`, `council: strictCouncil(),`, 'development Teacher Council');
  text = replaceExact(text, `spec: { purpose: 'test' },`, `spec: { purpose: 'test' },\n    candidate: { sha: TEST_SHA },`, 'development candidate binding');
  text = replaceExact(text,
    `applyTeacherReview(request, { request_id: 'wrong', verdict: 'APPROVE_PLAN' })`,
    `applyTeacherReview(request, { request_id: 'wrong', target_sha: TEST_SHA, verdict: 'APPROVE_PLAN' })`,
    'development wrong request');
  text = replaceExact(text,
    `applyTeacherReview(request, { request_id: request.request_id, verdict: 'APPROVE_PLAN', feedback: 'ok' })`,
    `applyTeacherReview(request, { request_id: request.request_id, target_sha: TEST_SHA, verdict: 'APPROVE_PLAN', feedback: 'ok' })`,
    'development matching request');
  await write(path, text);
}

// 4) GitHub reconciler fixture carries exact reviewed SHA in both request and canonical reply.
{
  const path = 'tests/github-reply-reconciler.test.mjs';
  let text = await read(path);
  text = replaceExact(text,
    `} from '../src/teachers/github-reply-reconciler.js';\n`,
    `} from '../src/teachers/github-reply-reconciler.js';\n\n${TEST_SHA_DECL}`,
    'reconciler test SHA declaration');
  text = replaceExact(text,
`    council: { responses: [\n      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'A' },\n      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'B' },\n    ] },`,
`    council: {\n      status: 'COMPLETE',\n      phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',\n      all_required_roles_satisfied: true,\n      ${REQUIRED_ROLES}\n      responses: [\n        { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'A' },\n        { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'B' },\n      ],\n      synthesis: { status: 'COMPLETE', text: 'Council synthesis for Teacher review.' },\n      teacher_required: true,\n      development_allowed: false,\n      context: { target_sha: TEST_SHA },\n    },`,
    'reconciler complete Council');
  text = replaceExact(text, `spec: { candidate_only: true },`, `spec: { candidate_only: true },\n    candidate: { sha: TEST_SHA },`, 'reconciler candidate binding');
  text = replaceExact(text,
    `JSON.stringify({ request_id: request.request_id, verdict: 'APPROVE_PLAN', feedback: 'matching reply' }),`,
    `JSON.stringify({ request_id: request.request_id, target_sha: TEST_SHA, verdict: 'APPROVE_PLAN', feedback: 'matching reply' }),`,
    'reconciler matching reply');
  await write(path, text);
}

// 5) Public Teacher API fixture uses the same strict contract and exact SHA.
{
  const path = 'tests/public-teacher-api.test.mjs';
  let text = await read(path);
  text = replaceExact(text,
    `import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';\n`,
    `import { maybeHandlePublicTeacherBridge, summarizeAutonomyJobs } from '../src/teachers/public-teacher-api.js';\n\n${TEST_SHA_DECL}`,
    'public Teacher SHA declaration');
  text = replaceExact(text,
`    council: { responses: [\n      { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL' },\n      { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL 2' },\n    ] },`,
`    council: {\n      status: 'COMPLETE',\n      phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',\n      all_required_roles_satisfied: true,\n      ${REQUIRED_ROLES}\n      responses: [\n        { provider: 'workers-ai', model: 'a', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL' },\n        { provider: 'workers-ai', model: 'b', zero_added_cost: true, summary: 'PRIVATE COUNCIL DETAIL 2' },\n      ],\n      synthesis: { status: 'COMPLETE', text: 'PRIVATE SYNTHESIS MUST NOT LEAK' },\n      teacher_required: true,\n      development_allowed: false,\n      context: { target_sha: TEST_SHA },\n    },`,
    'public Teacher complete Council');
  text = replaceExact(text,
    `candidate: { branch: 'candidate/augmentio-core', sha: 'abc1234' },`,
    `candidate: { branch: 'candidate/augmentio-core', sha: TEST_SHA },`,
    'public Teacher candidate SHA');
  await write(path, text);
}

// 6) Work DAG Teacher fixture binds request/DAG/reply to the same exact SHA.
{
  const path = 'tests/work-dag-resume.test.mjs';
  let text = await read(path);
  text = replaceExact(text,
    `} from '../src/work/work-dag.js';\n`,
    `} from '../src/work/work-dag.js';\n\n${TEST_SHA_DECL}`,
    'work DAG SHA declaration');
  text = replaceExact(text,
`function council() {\n  return {\n    responses: [\n      { provider: 'workers-ai', model: 'zero-a', zero_added_cost: true, summary: 'A' },\n      { provider: 'workers-ai', model: 'zero-b', zero_added_cost: true, summary: 'B' },\n    ],\n  };\n}`,
`function council() {\n  return {\n    status: 'COMPLETE',\n    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',\n    all_required_roles_satisfied: true,\n    ${REQUIRED_ROLES}\n    responses: [\n      { provider: 'workers-ai', model: 'zero-a', zero_added_cost: true, summary: 'A' },\n      { provider: 'workers-ai', model: 'zero-b', zero_added_cost: true, summary: 'B' },\n    ],\n    synthesis: { status: 'COMPLETE', text: 'Council synthesis for Teacher review.' },\n    teacher_required: true,\n    development_allowed: false,\n    context: { target_sha: TEST_SHA },\n  };\n}`,
    'work DAG complete Council');
  text = replaceExact(text, `candidateSha: 'abc1234'`, `candidateSha: TEST_SHA`, 'work DAG candidate SHA');
  text = replaceExact(text, `expectedCandidateSha: 'abc1234'`, `expectedCandidateSha: TEST_SHA`, 'work DAG expected SHA', 2);
  text = replaceExact(text,
    `{ request_id: 'wrong', verdict: 'APPROVE_PLAN' }`,
    `{ request_id: 'wrong', target_sha: TEST_SHA, verdict: 'APPROVE_PLAN' }`,
    'work DAG mismatched reply');
  text = replaceExact(text,
    `request_id: request.request_id,\n    verdict: 'APPROVE_PLAN',`,
    `request_id: request.request_id,\n    target_sha: TEST_SHA,\n    verdict: 'APPROVE_PLAN',`,
    'work DAG matching reply');
  await write(path, text);
}

// 7) Runtime GitHub Teacher replies must echo the exact SHA reviewed by Teacher.
{
  const path = 'tests/autonomy-runtime.test.mjs';
  let text = await read(path);
  const pattern = /(request_id: (?:first\.teacher\.request_id|firstRequestId|requestId),\n)(\s+verdict:)/g;
  const matches = [...text.matchAll(pattern)].length;
  if (matches !== 6) throw new Error(`autonomy runtime target_sha: expected 6 reply fixtures, found ${matches}`);
  text = text.replace(pattern, `$1    target_sha: CANDIDATE_HEAD_SHA,\n$2`);
  await write(path, text);
}

console.log('GEN2-17 strict contract fixtures updated.');
