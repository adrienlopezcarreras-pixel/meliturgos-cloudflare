import test from 'node:test';
import assert from 'node:assert/strict';
import { MentorEngine } from '../src/learning/mentor-engine.js';
import { TOP_MODELS } from '../src/models/ModelRegistry.js';
// This file exercises production authorization, not the suite's optional
// Node-only free-provider shortcut. No external AI calls are made.
const shortcut = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
test.after(() => {
  if (shortcut === undefined) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = shortcut;
});
const [primary, secondary] = TOP_MODELS;
const source = 'export const answer = 1;\n';
const valid = JSON.stringify({ summary: 'Answer', edits: [{ path: 'src/answer.js', find: 'export const answer = 1;', replace: 'export const answer = 2;' }] });
function fixture(reply, models = [primary, secondary]) {
  const calls = [], now = Date.now(), issued = now - 60_000;
  const proof = { schema: 'mel.workers-ai.zero-cost-proof/v1', provider: 'workers-ai', account_plan: 'WORKERS_FREE',
    billing_path: 'direct-workers-ai-binding', pricing_policy: 'cloudflare-workers-ai-pricing-2026-10-01',
    free_allocation_neurons_per_day: 10_000, free_overage_behavior: 'FAIL_NOT_BILL',
    plan_evidence: { source: 'cloudflare-account-entitlements-api', account_type: 'standard',
      entitlement_key: 'workers.static_assets.manifest_limit_file_count', entitlement_value: 20_000, workers_free_reference_value: 20_000 },
    models, verified_at: new Date(issued).toISOString(), expires_at: new Date(issued + 3600_000).toISOString() };
  const env = { MEL_WORKERS_AI_ZERO_COST_PROOF_JSON: JSON.stringify(proof),
    AI: { async run(model, input) { calls.push(model); return { response: reply(model, input) }; } } };
  return { env, calls };
}
const request = { goal: 'Change answer', inspectedFiles: [{ path: 'src/answer.js', content: source }] };

test('real pool retains both authorized top CODE models, including the non-specialist', async () => {
  const { env } = fixture(() => valid);
  const selected = await new MentorEngine()._providers(env, { codeCouncil: true, escalate: true });
  assert.deepEqual(selected.map(p => p.modelId), [primary, secondary]);
});

test('a successful primary coder does not spend a second model call', async () => {
  const { env, calls } = fixture(() => valid);
  const result = await new MentorEngine().propose({ ...request, env });
  assert.deepEqual(calls, [primary]);
  assert.equal(result.proposal.provenance.model, primary);
});

test('after refused code and its refused repair, the second eligible top model can deliver', async () => {
  const { env, calls } = fixture(model => model === primary ? 'not a code proposal' : valid);
  const result = await new MentorEngine().propose({ ...request, env });
  assert.deepEqual(calls, [primary, primary, secondary]);
  assert.equal(result.proposal.provenance.model, secondary);
  assert.match(result.proposal.changes[0].content, /answer = 2/);
});

test('a second model without an authoritative zero-cost proof remains excluded', async () => {
  const { env, calls } = fixture(() => 'not a code proposal', [primary]);
  await assert.rejects(new MentorEngine().propose({ ...request, env }), e => e.code === 'MENTOR_NO_VALID_CODE_PROPOSAL');
  assert.ok(calls.length > 0);
  assert.ok(calls.every(model => model === primary));
});

test('the configured top-model order remains authoritative', async () => {
  const { env } = fixture(() => valid);
  env.MEL_TOP_MODELS = `${secondary},${primary}`;
  const selected = await new MentorEngine()._providers(env, { codeCouncil: true });
  assert.deepEqual(selected.map(p => p.modelId), [secondary, primary]);
});


test('a difficult repair still compares both independent eligible top coders', async () => {
  const { env, calls } = fixture(() => valid);
  const result = await new MentorEngine().propose({ ...request, env, mode: 'repair' });
  assert.deepEqual(calls, [primary, secondary]);
  assert.equal(result.code_council.valid_proposals, 2);
});

test('expired authorization cannot become fallback eligibility', async () => {
  const { env, calls } = fixture(() => valid);
  const proof = JSON.parse(env.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON);
  proof.verified_at = new Date(Date.now() - 7200_000).toISOString();
  proof.expires_at = new Date(Date.now() - 3600_000).toISOString();
  env.MEL_WORKERS_AI_ZERO_COST_PROOF_JSON = JSON.stringify(proof);
  await assert.rejects(new MentorEngine().propose({ ...request, env }), e => e.code === 'MENTOR_NO_ZERO_COST_CODE_PROVIDER');
  assert.equal(calls.length, 0);
});
