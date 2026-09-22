import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerPlatformControlCapabilities } from '../../src/capabilities/platform-control-capabilities.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const OWNER = {
  owner: 'adrien',
  permissions: [],
  requestId: 'gen2-36-control-test',
};

function approved(id) {
  return { ...OWNER, approvedCapabilities: [id] };
}

function configuredEnv() {
  return {
    MEL_GITHUB_REPOSITORY: 'owner/repo',
    MEL_GITHUB_TOKEN: 'github-secret',
    MEL_GITHUB_WRITABLE_WORKFLOWS: 'gen2-36-provider-write-smoke.yml',
    CLOUDFLARE_API_TOKEN: 'cf-secret',
    CLOUDFLARE_ACCOUNT_ID: 'account123',
    MEL_CLOUDFLARE_SCRIPT: 'meliturgos',
    VERCEL_TOKEN: 'vercel-secret',
    VERCEL_TEAM_ID: 'team_123',
    MEL_VERCEL_PROJECT_ID: 'prj_123',
    MEL_VERCEL_PROJECT_NAME: 'mel-project',
  };
}

test('GEN2-36 registers only explicit-approval HIGH-risk platform mutation capabilities', () => {
  const bus = new CapabilityBus();
  const ids = registerPlatformControlCapabilities(bus, {
    env: configuredEnv(),
    fetchImpl: async () => json({}),
  });

  assert.deepEqual(ids, [
    'github.actions.workflow.dispatch',
    'cloudflare.deployments.create',
    'vercel.deployments.redeploy',
  ]);

  for (const id of ids) {
    const record = bus.describe(id);
    assert.equal(record.risk, 'HIGH');
    assert.equal(record.approval?.required, true);
    assert.equal(record.approval?.scope, id);
    assert.equal(bus.contract(id).explicit_approval_gate, true);
  }
});

test('GEN2-36 mutation handlers are never reached without exact owner approval', async () => {
  let calls = 0;
  const bus = new CapabilityBus();
  registerPlatformControlCapabilities(bus, {
    env: configuredEnv(),
    fetchImpl: async () => {
      calls += 1;
      return json({});
    },
  });

  const attempts = [
    ['github.actions.workflow.dispatch', { workflow: 'gen2-36-provider-write-smoke.yml', ref: 'main' }],
    ['cloudflare.deployments.create', {
      versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 100 }],
    }],
    ['vercel.deployments.redeploy', { deploymentId: 'dpl_123' }],
  ];

  for (const [id, input] of attempts) {
    await assert.rejects(
      () => bus.execute(id, input, OWNER),
      error => error?.code === 'EXPLICIT_APPROVAL_REQUIRED',
    );
  }
  assert.equal(calls, 0);
});

test('GitHub workflow dispatch is repository-fixed, workflow-allowlisted and body-bounded', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformControlCapabilities(bus, {
    env: configuredEnv(),
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), init });
      return json({
        workflow_run_id: 42,
        run_url: 'https://api.github.com/repos/owner/repo/actions/runs/42',
        html_url: 'https://github.com/owner/repo/actions/runs/42',
      });
    },
  });

  const result = await bus.execute('github.actions.workflow.dispatch', {
    workflow: 'gen2-36-provider-write-smoke.yml',
    ref: 'candidate/gen2-36-platform-write-control',
    inputs: { smoke: true, count: 1, mode: 'bounded' },
  }, approved('github.actions.workflow.dispatch'));

  assert.equal(result.accepted, true);
  assert.equal(result.workflow_run_id, 42);
  assert.equal(seen.length, 1);
  assert.equal(
    seen[0].url,
    'https://api.github.com/repos/owner/repo/actions/workflows/gen2-36-provider-write-smoke.yml/dispatches',
  );
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.redirect, 'error');
  assert.equal(seen[0].init.headers.authorization, 'Bearer github-secret');
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    ref: 'candidate/gen2-36-platform-write-control',
    inputs: { smoke: true, count: 1, mode: 'bounded' },
  });
  assert.equal(JSON.stringify(result).includes('github-secret'), false);

  await assert.rejects(
    () => bus.execute('github.actions.workflow.dispatch', {
      workflow: 'deploy-cloudflare-release.yml',
      ref: 'main',
    }, approved('github.actions.workflow.dispatch')),
    error => error?.code === 'GITHUB_WORKFLOW_NOT_ALLOWED',
  );

  await assert.rejects(
    () => bus.execute('github.actions.workflow.dispatch', {
      workflow: '../unsafe.yml',
      ref: 'main',
    }, approved('github.actions.workflow.dispatch')),
    error => error?.code === 'GITHUB_WORKFLOW_INVALID',
  );
});

test('Cloudflare deployment control is locked to configured Worker, existing UUID versions and exact 100 percent traffic', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformControlCapabilities(bus, {
    env: configuredEnv(),
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), init });
      return json({
        success: true,
        result: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          created_on: '2026-09-22T10:00:00Z',
          source: 'api',
          strategy: 'percentage',
          versions: [
            { version_id: '11111111-1111-4111-8111-111111111111', percentage: 90 },
            { version_id: '22222222-2222-4222-8222-222222222222', percentage: 10 },
          ],
        },
      });
    },
  });

  const result = await bus.execute('cloudflare.deployments.create', {
    versions: [
      { version_id: '11111111-1111-4111-8111-111111111111', percentage: 90 },
      { version_id: '22222222-2222-4222-8222-222222222222', percentage: 10 },
    ],
    message: 'approved staged deployment',
  }, approved('cloudflare.deployments.create'));

  assert.equal(result.script, 'meliturgos');
  assert.equal(result.deployment.versions.length, 2);
  assert.equal(
    seen[0].url,
    'https://api.cloudflare.com/client/v4/accounts/account123/workers/scripts/meliturgos/deployments',
  );
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.strategy, 'percentage');
  assert.equal(body.versions.reduce((sum, row) => sum + row.percentage, 0), 100);
  assert.equal(body.annotations['workers/triggered_by'], 'meliturgos-gen2-36');
  assert.equal('force' in body, false);
  assert.equal(JSON.stringify(result).includes('cf-secret'), false);

  await assert.rejects(
    () => bus.execute('cloudflare.deployments.create', {
      versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 99 }],
    }, approved('cloudflare.deployments.create')),
    error => error?.code === 'CLOUDFLARE_PERCENTAGE_TOTAL_INVALID',
  );

  await assert.rejects(
    () => bus.execute('cloudflare.deployments.create', {
      versions: [{ version_id: '../bad', percentage: 100 }],
    }, approved('cloudflare.deployments.create')),
    error => error?.code === 'CLOUDFLARE_VERSION_ID_INVALID',
  );
});

test('Vercel redeploy is locked to configured project and cannot upload arbitrary files or project settings', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformControlCapabilities(bus, {
    env: configuredEnv(),
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), init });
      return json({
        uid: 'dpl_new',
        name: 'mel-project',
        url: 'mel-project-preview.vercel.app',
        readyState: 'QUEUED',
        target: null,
        createdAt: 123,
      });
    },
  });

  const result = await bus.execute('vercel.deployments.redeploy', {
    deploymentId: 'dpl_existing',
    target: 'preview',
  }, approved('vercel.deployments.redeploy'));

  assert.equal(result.project_id, 'prj_123');
  assert.equal(result.project_name, 'mel-project');
  assert.equal(result.requested_target, 'preview');
  assert.match(seen[0].url, /^https:\/\/api\.vercel\.com\/v13\/deployments\?/);
  assert.match(seen[0].url, /teamId=team_123/);
  assert.deepEqual(JSON.parse(seen[0].init.body), {
    name: 'mel-project',
    project: 'prj_123',
    deploymentId: 'dpl_existing',
  });
  assert.equal(JSON.stringify(result).includes('vercel-secret'), false);

  await bus.execute('vercel.deployments.redeploy', {
    deploymentId: 'dpl_existing',
    target: 'production',
  }, approved('vercel.deployments.redeploy'));
  assert.equal(JSON.parse(seen[1].init.body).target, 'production');

  await assert.rejects(
    () => bus.execute('vercel.deployments.redeploy', {
      deploymentId: '../other-project',
    }, approved('vercel.deployments.redeploy')),
    error => error?.code === 'VERCEL_DEPLOYMENT_ID_INVALID',
  );
});

test('GEN2-36 control capabilities fail closed when server-side credentials or target configuration are missing', async () => {
  const bus = new CapabilityBus();
  registerPlatformControlCapabilities(bus, {
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo' },
    fetchImpl: async () => json({}),
  });

  for (const [id, input] of [
    ['github.actions.workflow.dispatch', { workflow: 'gen2-36-provider-write-smoke.yml', ref: 'main' }],
    ['cloudflare.deployments.create', {
      versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 100 }],
    }],
    ['vercel.deployments.redeploy', { deploymentId: 'dpl_123' }],
  ]) {
    await assert.rejects(
      () => bus.execute(id, input, approved(id)),
      error => error?.code === 'CAPABILITY_UNAVAILABLE',
    );
  }
});

test('upstream mutation errors never echo response bodies or credentials', async () => {
  const bus = new CapabilityBus();
  registerPlatformControlCapabilities(bus, {
    env: configuredEnv(),
    fetchImpl: async () => json({
      error: 'sensitive upstream detail github-secret cf-secret vercel-secret',
    }, 403),
  });

  for (const [id, input, expected] of [
    ['github.actions.workflow.dispatch', { workflow: 'gen2-36-provider-write-smoke.yml', ref: 'main' }, 'GITHUB_WORKFLOW_DISPATCH_FAILED_AUTH'],
    ['cloudflare.deployments.create', {
      versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 100 }],
    }, 'CLOUDFLARE_DEPLOYMENT_CREATE_FAILED_AUTH'],
    ['vercel.deployments.redeploy', { deploymentId: 'dpl_123' }, 'VERCEL_REDEPLOY_FAILED_AUTH'],
  ]) {
    let caught;
    try {
      await bus.execute(id, input, approved(id));
    } catch (error) {
      caught = error;
    }
    assert.ok(caught);
    assert.equal(caught.code, expected);
    assert.equal(String(caught.message).includes('sensitive upstream detail'), false);
    assert.equal(String(caught.message).includes('secret'), false);
  }
});
