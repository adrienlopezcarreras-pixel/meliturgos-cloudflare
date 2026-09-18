import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getSystemReadiness } from '../src/diagnostics/system-readiness.js';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import worker from '../src/index.js';

const noNetwork = async () => new Response('', { status: 503 });

function minimalDb() {
  return {
    prepare() {
      return {
        bind() { return this; },
        async run() { return { success: true }; },
        async all() { return { results: [] }; },
        async first() { return null; },
      };
    },
  };
}

async function withoutVerifiedZeroCostTestFixture(run) {
  const previous = process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
  process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = '0';
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS;
    else process.env.MEL_TEST_VERIFIED_ZERO_COST_PROVIDERS = previous;
  }
}

test('readiness report covers complete Gen2 runtime and explicit zero-cost models', async () => {
  const report = await getSystemReadiness({
    env: { MELITURGOS_USER: 'adrien', AI: {}, DB: minimalDb(), MEDIA_BUCKET: {} },
    fetchImpl: noNetwork
  });
  assert.equal(report.ok, true);
  assert.ok(report.capabilities.total >= 18);
  assert.ok(report.models.explicit_zero_cost >= 2);
  assert.ok(report.models.unknown_or_nonzero_cost.includes('ninjachat-default'));
  assert.equal(report.invariants.unknown_cost_is_not_free, true);
  assert.equal(report.invariants.catalog_zero_cost_is_not_runtime_authorization, true);
  assert.equal(report.invariants.ai_council_before_development, true);
  assert.equal(report.invariants.owner_shutdown_wins, true);
  assert.equal(report.invariants.production_activation_requires_human_approval, true);
  assert.equal(report.bindings.github_branch, 'candidate/mel-clean-autonomy');
  assert.equal(report.self_code.branch, null);
  assert.equal(report.self_code.commit, null);
  assert.equal(report.self_code.exact_identity_known, false);
  assert.equal(report.self_code.source, 'unavailable');
  assert.equal(report.critical.code_integrity_registered, true);
  assert.equal(report.critical.module_proposal_registered, true);
  assert.equal(report.critical.persistent_work_registered, true);
  assert.equal(JSON.stringify(report).includes('password'), false);
  assert.equal(JSON.stringify(report).includes('token'), false);
});

test('catalog cost=0 never becomes runtime zero-euro authorization by itself', async () => {
  await withoutVerifiedZeroCostTestFixture(async () => {
    const env = {
      MELITURGOS_USER: 'adrien',
      AI: { async run() { return { response: 'ok' }; } },
      DB: minimalDb(),
      MEDIA_BUCKET: {},
    };
    const report = await getSystemReadiness({ env, fetchImpl: noNetwork });
    assert.ok(report.models.explicit_zero_cost_catalog >= 2);
    assert.equal(report.models.runtime_zero_cost.authorized_zero_cost_count, 0);
    assert.equal(report.models.runtime_zero_cost.status, 'SAFE_IDLE');
    assert.equal(report.models.runtime_zero_cost.reason, 'ZERO_EURO_POLICY_PROTECTED');
    assert.equal(report.critical.multi_ai_zero_cost_catalog_candidates, true);
    assert.equal(report.critical.multi_ai_zero_cost_runtime_quorum, false);
  });
});

test('CapabilityBus executes inline .augmentio zero-cost healthcheck', async () => {
  await withoutVerifiedZeroCostTestFixture(async () => {
    const bus = createDefaultCapabilityBus({
      env: {
        MELITURGOS_USER: 'adrien',
        AI: { async run() { return { response: 'ok' }; } },
        DB: minimalDb(),
      },
      fetchImpl: noNetwork,
    });
    const before = bus.describe('augmentio.fanout');
    assert.equal(before.health, 'DEGRADED');
    const after = await bus.refreshHealth('augmentio.fanout');
    assert.equal(after.health, 'PROTECTED');
    assert.equal(Object.hasOwn(after, 'healthcheck'), false);
  });
});

test('readiness exposes a deployment identity only from explicit deployment metadata', async () => {
  const sha = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
  const report = await getSystemReadiness({
    env: {
      MELITURGOS_USER: 'adrien',
      MEL_GITHUB_REPOSITORY: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
      MEL_DEPLOYED_GIT_BRANCH: 'release/mel-test',
      MEL_DEPLOYED_GIT_SHA: sha,
    },
    fetchImpl: noNetwork,
  });

  assert.deepEqual(report.self_code, {
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: 'release/mel-test',
    commit: sha.toLowerCase(),
    branch_known: true,
    commit_known: true,
    exact_identity_known: true,
    commit_format_valid: true,
    source: 'runtime_env',
  });
});

test('readiness never reports a malformed deployment SHA as a known commit', async () => {
  const report = await getSystemReadiness({
    env: {
      MEL_DEPLOYED_GIT_BRANCH: 'release/mel-test',
      MEL_DEPLOYED_GIT_SHA: 'not-a-git-sha',
    },
    fetchImpl: noNetwork,
  });

  assert.equal(report.self_code.branch, 'release/mel-test');
  assert.equal(report.self_code.commit, null);
  assert.equal(report.self_code.commit_known, false);
  assert.equal(report.self_code.exact_identity_known, false);
  assert.equal(report.self_code.commit_format_valid, false);
});

test('production deploy requires explicit approval and exact canonical release identity', async () => {
  const workflow = await readFile(new URL('../.github/workflows/deploy-cloudflare-release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /DEPLOY_APPROVED/);
  assert.match(workflow, /EXPECTED_SHA/);
  assert.match(workflow, /RELEASE_BRANCH/);
  assert.match(workflow, /candidate\/mel-clean-autonomy/);
  assert.match(workflow, /MEL_DEPLOYED_GIT_SHA/);
  assert.match(workflow, /MEL_DEPLOYED_GIT_BRANCH/);
  assert.match(workflow, /--define/);
});

test('readiness endpoint requires auth and returns a bounded snapshot', async () => {
  const auth = 'Basic ' + Buffer.from('adrien:test').toString('base64');
  const env = { MELITURGOS_USER: 'adrien', MELITURGOS_PASSWORD: 'test', AI: {}, DB: minimalDb(), MEDIA_BUCKET: {} };
  const request = new Request('https://mel.test/api/gen2/readiness', { headers: { authorization: auth } });
  const response = await worker.fetch(request, env, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(body.readiness.percent >= 70);
  assert.ok(body.capabilities.ids.includes('code.read'));
  assert.ok(body.capabilities.ids.includes('code.integrity'));
  assert.ok(body.capabilities.ids.includes('work.open'));
});
