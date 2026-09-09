import test from 'node:test';
import assert from 'node:assert/strict';
import { GitHubTeacherBridge, MemoryTeacherBridgeState, parseJsonLines } from '../../src/teachers/github-teacher-bridge.js';

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
    writes.push({ path, text });
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
