import test from 'node:test';
import assert from 'node:assert/strict';
import { getSystemReadiness } from '../src/diagnostics/system-readiness.js';
import worker from '../src/index.js';

const noNetwork = async () => new Response('', { status: 503 });

test('readiness report is non-secret and reports explicit zero-cost models', async () => {
  const report = await getSystemReadiness({
    env: { MELITURGOS_USER: 'adrien', AI: {}, DB: {}, MEDIA_BUCKET: {} },
    fetchImpl: noNetwork
  });
  assert.equal(report.ok, true);
  assert.ok(report.capabilities.total >= 9);
  assert.ok(report.models.explicit_zero_cost >= 2);
  assert.ok(report.models.unknown_or_nonzero_cost.includes('ninjachat-default'));
  assert.equal(report.invariants.unknown_cost_is_not_free, true);
  assert.equal(report.invariants.ai_council_before_development, true);
  assert.equal(report.invariants.owner_shutdown_wins, true);
  assert.equal(JSON.stringify(report).includes('password'), false);
  assert.equal(JSON.stringify(report).includes('token'), false);
});

test('readiness endpoint requires auth and returns a bounded snapshot', async () => {
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test', AI: {}, DB: {}, MEDIA_BUCKET: {} };
  const request = new Request('https://mel.test/api/gen2/readiness', { headers: { authorization: auth } });
  const response = await worker.fetch(request, env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(body.readiness.percent >= 70);
  assert.ok(body.capabilities.ids.includes('code.read'));
});
