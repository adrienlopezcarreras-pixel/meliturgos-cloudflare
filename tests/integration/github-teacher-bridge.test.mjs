import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubTeacherBridge, MemoryTeacherBridgeState, parseJsonLines } from '../../src/teachers/github-teacher-bridge.js';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerTeacherCapabilities } from '../../src/capabilities/teacher-capabilities.js';

function base64(text) { return Buffer.from(text, 'utf8').toString('base64'); }
function decode(body) { return Buffer.from(JSON.parse(body).content, 'base64').toString('utf8'); }

function fakeGitHub({ requests = '', replies = '', readStatus = 200 } = {}) {
  const files = new Map([
    ['teacher-bridge/requests.jsonl', { text: requests, sha: 'req-sha' }],
    ['teacher-bridge/replies.jsonl', { text: replies, sha: 'rep-sha' }]
  ]);
  const writes = [];
  const fetchImpl = async (url, options = {}) => {
    const path = decodeURIComponent(url.match(/\/contents\/(.+?)(?:\?ref=|$)/)?.[1] || '');
    if ((options.method || 'GET') === 'GET') {
      if (readStatus !== 200) return new Response('{}', { status: readStatus });
      const file = files.get(path);
      return new Response(JSON.stringify({ content: base64(file?.text || ''), sha: file?.sha || 'sha' }), { status: 200 });
    }
    const text = decode(options.body);
    writes.push({ path, text, authorization: options.headers?.authorization || '' });
    files.set(path, { text, sha: `sha-${writes.length}` });
    return new Response(JSON.stringify({ content: { sha: `sha-${writes.length}` } }), { status: 200 });
  };
  return { fetchImpl, writes, files };
}

function bridge(fake, state = new MemoryTeacherBridgeState()) {
  return new GitHubTeacherBridge({
    repository: 'owner/repo', branch: 'mel-current', token: 'test-only', fetchImpl: fake.fetchImpl, state,
    now: () => '2026-09-09T15:00:00.000Z', uuid: () => 'req-1'
  });
}

test('parseJsonLines ignores malformed rows safely', () => {
  assert.deepEqual(parseJsonLines('{"a":1}\nnot-json\n{"b":2}\n'), [{ a: 1 }, { b: 2 }]);
});

test('ask appends one structured MEL_REQUEST and prevents duplicate request ids', async () => {
  const fake = fakeGitHub(); const state = new MemoryTeacherBridgeState(); const client = bridge(fake, state);
  const first = await client.ask({ goal: 'Finish tool loop', blocker_or_question: 'What next?', evidence: 'tests pending' });
  const second = await client.ask({ request_id: 'req-1', goal: 'Finish tool loop', blocker_or_question: 'What next?' });
  assert.equal(first.status, 'WAITING_TEACHER'); assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true); assert.equal(fake.writes.length, 1);
  const [row] = parseJsonLines(fake.writes[0].text);
  assert.equal(row.type, 'MEL_REQUEST'); assert.equal(row.request_id, 'req-1'); assert.equal(row.safety.candidate_branch_only, true);
});

test('ask deduplication survives a new bridge instance', async () => {
  const fake = fakeGitHub();
  const first = bridge(fake, new MemoryTeacherBridgeState());
  await first.ask({ request_id: 'persisted-1', goal: 'Persist once', blocker_or_question: 'Can I proceed?' });
  assert.equal(fake.writes.length, 1);
  const restarted = bridge(fake, new MemoryTeacherBridgeState());
  const duplicate = await restarted.ask({ request_id: 'persisted-1', goal: 'Persist once', blocker_or_question: 'Can I proceed?' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.status, 'WAITING_TEACHER');
  assert.equal(fake.writes.length, 1);
});

test('poll matches a reply once and then marks it consumed', async () => {
  const reply = JSON.stringify({ type: 'TEACHER_REPLY', request_id: 'req-1', status: 'ANSWERED', instruction: 'continue' });
  const fake = fakeGitHub({ replies: `${reply}\n` }); const client = bridge(fake);
  const first = await client.poll('req-1'); const second = await client.poll('req-1');
  assert.equal(first.status, 'ANSWERED'); assert.equal(first.reply.instruction, 'continue'); assert.equal(second.status, 'ALREADY_CONSUMED');
});

test('poll returns WAITING_TEACHER when reply is missing', async () => {
  const fake = fakeGitHub(); const client = bridge(fake);
  assert.equal((await client.poll('missing')).status, 'WAITING_TEACHER');
});

test('health distinguishes online, auth failure, and transient failure', async () => {
  assert.equal(await bridge(fakeGitHub()).health(), 'ONLINE');
  assert.equal(await bridge(fakeGitHub({ readStatus: 403 })).health(), 'OFFLINE');
  assert.equal(await bridge(fakeGitHub({ readStatus: 500 })).health(), 'DEGRADED');
});

test('MEL can ask and receive teacher feedback through CapabilityBus without Professor UI', async () => {
  const fake = fakeGitHub();
  const bus = new CapabilityBus();
  registerTeacherCapabilities(bus, { repository: 'owner/repo', branch: 'mel-current', token: 'test-only', fetchImpl: fake.fetchImpl, now: () => '2026-09-09T15:00:00.000Z', uuid: () => 'req-cap' });
  const ctx = { owner: 'mel', permissions: [], requestId: 'capability-flow' };
  const asked = await bus.execute('teacher.ask', { goal: 'Improve code navigation', blocker_or_question: 'Review my next step' }, ctx);
  assert.equal(asked.request_id, 'req-cap');
  assert.equal(asked.status, 'WAITING_TEACHER');
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.writes[0].authorization, 'Bearer test-only');
  assert.ok(!fake.writes[0].text.includes('test-only'));
  fake.files.set('teacher-bridge/replies.jsonl', { text: `${JSON.stringify({ type: 'TEACHER_REPLY', request_id: 'req-cap', instruction: 'add a regression test' })}\n`, sha: 'reply-new' });
  const polled = await bus.execute('teacher.poll', { request_id: 'req-cap' }, ctx);
  assert.equal(polled.status, 'ANSWERED');
  assert.equal(polled.reply.instruction, 'add a regression test');
});

const deployEvidence = {
  candidate_branch: 'candidate/review-me',
  candidate_commit: 'abcdef1234567890abcdef1234567890abcdef12',
  change_summary: 'bounded candidate change',
  files_components_affected: 'src/example.js',
  user_visible_impact: 'none until approved',
  tests_ci_results: 'CI green',
  benchmark_regression_results: 'no regression observed',
  security_privacy_impact: 'no new data access',
  secrets_permissions_impact: 'no new secret or permission',
  data_schema_migration_impact: 'none',
  compatibility_risks: 'low',
  dependency_licensing_impact: 'none',
  rollout_plan: 'promote exact commit only after approval',
  health_checks: 'smoke check routes and bridge health',
  rollback_plan: 'restore last known-good release',
  known_unknowns_blockers: 'none known'
};

test('deployment request requires a candidate branch and a complete evidence packet', async () => {
  const fake = fakeGitHub(); const client = bridge(fake);
  const requested = await client.requestDeployment({ request_id: 'deploy-1', ...deployEvidence });
  assert.equal(requested.status, 'WAITING_DEPLOY_REVIEW');
  const [row] = parseJsonLines(fake.writes[0].text);
  assert.equal(row.type, 'DEPLOYMENT_REQUEST');
  assert.equal(row.candidate_commit, deployEvidence.candidate_commit);
  assert.equal(row.boundaries.exact_commit_only, true);
  await assert.rejects(() => client.requestDeployment({ request_id: 'deploy-bad', ...deployEvidence, candidate_branch: 'main' }), /DEPLOYMENT_CANDIDATE_BRANCH_REQUIRED/);
});

test('deployment approval authorizes only the exact reviewed branch and commit', async () => {
  const review = { type: 'DEPLOYMENT_REVIEW', request_id: 'deploy-1', decision: 'DEPLOY_APPROVED', candidate_branch: deployEvidence.candidate_branch, candidate_commit: deployEvidence.candidate_commit, reasons: 'independent review passed' };
  const fake = fakeGitHub({ replies: `${JSON.stringify(review)}\n` }); const client = bridge(fake);
  const exact = await client.pollDeployment('deploy-1', deployEvidence.candidate_branch, deployEvidence.candidate_commit);
  assert.equal(exact.authorized, true);
  assert.equal(exact.status, 'DEPLOY_APPROVED');
  const laterCommit = await client.pollDeployment('deploy-1', deployEvidence.candidate_branch, '1111111234567890abcdef1234567890abcdef12');
  assert.equal(laterCommit.authorized, false);
  assert.equal(laterCommit.exact_commit_match, false);
});

test('deployment rejection or needs-changes can never authorize production', async () => {
  for (const decision of ['DEPLOY_REJECTED', 'DEPLOY_NEEDS_CHANGES']) {
    const review = { type: 'DEPLOYMENT_REVIEW', request_id: `deploy-${decision}`, decision, candidate_branch: deployEvidence.candidate_branch, candidate_commit: deployEvidence.candidate_commit };
    const fake = fakeGitHub({ replies: `${JSON.stringify(review)}\n` });
    const result = await bridge(fake).pollDeployment(review.request_id, deployEvidence.candidate_branch, deployEvidence.candidate_commit);
    assert.equal(result.authorized, false);
    assert.equal(result.status, decision);
  }
});
