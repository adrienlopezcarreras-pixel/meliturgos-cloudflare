import test from 'node:test';
import assert from 'node:assert/strict';
import { D1DevJobRepository } from '../src/dev/d1-dev-job-repository.js';
import { maybeHandleAutonomyApi } from '../src/evolution/autonomy-api.js';

const auth = `Basic ${Buffer.from('test:pw').toString('base64')}`;

function fixture() {
  const repository = new D1DevJobRepository(null, { memoryStore: new Map() });
  const env = {
    MELITURGOS_USER: 'test',
    MELITURGOS_PASSWORD: 'pw',
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_BRANCH: 'release/test',
    MEL_TEACHER_BRANCH: 'candidate/augmentio-core',
    AI: { async run(model) { return { response: `ack:${model}` }; } },
  };
  const fetchImpl = async (url) => {
    const target = String(url);
    if (target.includes('teacher-bridge/replies.jsonl')) return new Response('', { status: 200 });
    if (target.includes('teacher-bridge/completions.jsonl')) return new Response('', { status: 200 });
    if (target.startsWith('https://api.github.com/')) return new Response('fixture rate limit', { status: 403 });
    if (target.startsWith('https://raw.githubusercontent.com/')) return new Response('export const fixture = true;\n', { status: 200, headers: { etag: 'fixture' } });
    return new Response('not found', { status: 404 });
  };
  return { repository, env, fetchImpl };
}

test('/api/gen2/autonomy/status is an authenticated alias with evidence-based readiness', async () => {
  const f = fixture();
  const response = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/status', { headers: { authorization: auth } }),
    f.env,
    { repository: f.repository, fetchImpl: f.fetchImpl },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.readiness.self_development_ready, false);
  assert.equal(body.readiness.status, 'BUILDING_AUTONOMY');
  assert.ok(body.readiness.blockers.includes('LIVE_COUNCIL_ZERO_COST_NOT_PROVEN'));
});

test('manual tick records the one-time Work DAG runtime proof and reports that gate as verified', async () => {
  const f = fixture();
  const response = await maybeHandleAutonomyApi(
    new Request('http://mel/api/gen2/autonomy/tick', { method: 'POST', headers: { authorization: auth } }),
    f.env,
    { repository: f.repository, fetchImpl: f.fetchImpl },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tick.runtime_proof.status, 'VERIFIED');
  assert.equal(body.tick.runtime_proof.recovered_interrupted_node, true);
  assert.ok(body.tick.runtime_proof.providers_attempted >= 2);
  assert.equal(body.state.readiness.gates.runtime_work_dag_resume, true);
  assert.equal(body.state.readiness.gates.live_council_zero_cost, true);
  assert.equal(body.state.readiness.gates.runtime_teacher_round_trip, false);
});
