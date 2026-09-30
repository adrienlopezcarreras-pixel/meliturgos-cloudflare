import test from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import { registerPlatformReadCapabilities } from '../../src/capabilities/platform-read-capabilities.js';

const owner = { owner: 'adrien', permissions: [], requestId: 'gen2-36-test' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('GEN2-36 registers bounded read-only GitHub Cloudflare and Vercel capabilities', () => {
  const bus = new CapabilityBus();
  const ids = registerPlatformReadCapabilities(bus, {
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      CLOUDFLARE_API_TOKEN: 'cf-secret',
      CLOUDFLARE_ACCOUNT_ID: 'abc123',
      VERCEL_TOKEN: 'vercel-secret',
    },
    fetchImpl: async () => json({}),
  });

  assert.deepEqual(ids, [
    'github.repository.read',
    'github.actions.runs.read',
    'cloudflare.workers.read',
    'cloudflare.deployments.read',
    'vercel.projects.read',
    'vercel.deployments.read',
  ]);

  for (const id of ids) {
    const record = bus.describe(id);
    assert.equal(record.risk, 'LOW');
    assert.deepEqual(record.permissions, []);
    assert.equal(record.approval, undefined);
    assert.equal(record.enabled, true);
  }
});

test('GitHub metadata and Actions runs are limited to the configured repository', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo', MEL_GITHUB_TOKEN: 'github-secret' },
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), authorization: init.headers.authorization });
      if (String(url).includes('/actions/runs')) {
        return json({ workflow_runs: Array.from({ length: 8 }, (_, i) => ({
          id: i + 1, name: 'ci', status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40)
        })) });
      }
      return json({
        id: 42, name: 'repo', full_name: 'owner/repo', private: true,
        archived: false, disabled: false, visibility: 'private', default_branch: 'main'
      });
    },
  });

  const repo = await bus.execute('github.repository.read', {}, owner);
  const runs = await bus.execute('github.actions.runs.read', { limit: 3 }, owner);

  assert.equal(repo.full_name, 'owner/repo');
  assert.equal(runs.count, 3);
  assert.equal(runs.runs.length, 3);
  assert.equal(seen.some(call => call.url === 'https://api.github.com/repos/owner/repo'), true);
  assert.equal(seen.some(call => call.url === 'https://api.github.com/repos/owner/repo/actions/runs?per_page=1'), true);
  assert.equal(seen.some(call => call.url === 'https://api.github.com/repos/owner/repo/actions/runs?per_page=3'), true);
  assert.equal(seen.every(call => call.authorization === 'Bearer github-secret'), true);
  assert.equal(JSON.stringify({ repo, runs }).includes('github-secret'), false);
});

test('Cloudflare Workers inventory comes from the fresh relay snapshot while deployments stay direct for now', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { CLOUDFLARE_API_TOKEN: 'cf-secret', CLOUDFLARE_ACCOUNT_ID: 'account123' },
    resolveCloudflareWorkersSnapshot: async () => ({
      fresh: true,
      collected_at: 1790797000000,
      source_run_id: 12345,
      workers: [
        { id: 'meliturgos', modified_on: '2026-09-22T00:00:00Z', compatibility_date: '2026-09-04' },
        { id: 'other' },
      ],
    }),
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), authorization: init.headers.authorization });
      return json({ success: true, result: [
        { id: 'd1', created_on: '2026-09-22T00:00:00Z', source: 'api', strategy: 'percentage', versions: [{ version_id: 'v1', percentage: 100 }] },
        { id: 'd2' },
      ] });
    },
  });

  const workers = await bus.execute('cloudflare.workers.read', { limit: 1 }, owner);

  assert.equal(workers.count, 1);
  assert.equal(workers.scripts[0].id, 'meliturgos');
  assert.equal(workers.transport, 'github-actions-relay-snapshot');
  assert.equal(workers.source_run_id, 12345);
  assert.equal(seen.length, 0, 'workers.read must not make a direct Cloudflare subrequest');

  const deployments = await bus.execute('cloudflare.deployments.read', { script: 'meliturgos', limit: 1 }, owner);
  assert.equal(deployments.count, 1);
  assert.equal(deployments.deployments[0].id, 'd1');
  assert.equal(seen.some(call => call.url === 'https://api.cloudflare.com/client/v4/accounts/account123/workers/scripts'), true);
  assert.equal(seen.some(call => call.url === 'https://api.cloudflare.com/client/v4/accounts/account123/workers/scripts/meliturgos/deployments'), true);
  assert.equal(seen.every(call => call.authorization === 'Bearer cf-secret'), true);
  assert.equal(JSON.stringify({ workers, deployments }).includes('cf-secret'), false);
  await assert.rejects(
    () => bus.execute('cloudflare.deployments.read', { script: '../secrets' }, owner),
    /CLOUDFLARE_SCRIPT_INVALID/
  );
});

test('Cloudflare Workers relay fails closed on stale snapshots', async () => {
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: {},
    resolveCloudflareWorkersSnapshot: async () => ({
      fresh: false,
      collected_at: 1,
      workers: [{ id: 'meliturgos' }],
    }),
  });
  await assert.rejects(
    () => bus.execute('cloudflare.workers.read', { limit: 1 }, owner),
    /CLOUDFLARE_WORKERS_RELAY_SNAPSHOT_STALE/
  );
});

test('Cloudflare direct deployment failures expose only sanitized HTTP and numeric error codes', async () => {
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { CLOUDFLARE_API_TOKEN: 'cf-secret', CLOUDFLARE_ACCOUNT_ID: 'account123' },
    fetchImpl: async () => json({ errors: [{ code: 10000, message: 'secret upstream message' }] }, 503),
  });

  let caught;
  try {
    await bus.execute('cloudflare.deployments.read', { script: 'meliturgos', limit: 1 }, owner);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.match(caught.code, /CLOUDFLARE_DEPLOYMENTS_READ_FAILED_HTTP_503_CF_10000/);
  assert.equal(String(caught.code).includes('secret upstream message'), false);
  assert.equal(String(caught.code).includes('cf-secret'), false);
});

test('Vercel project and deployment reads preserve team scoping and bounded output', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { VERCEL_TOKEN: 'vercel-secret', VERCEL_TEAM_ID: 'team_123' },
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), authorization: init.headers.authorization });
      if (String(url).includes('/v6/deployments')) {
        return json({ deployments: [
          { uid: 'dpl_1', name: 'mel', state: 'READY', target: 'production', url: 'mel.example' },
          { uid: 'dpl_2' },
        ] });
      }
      return json({ projects: [
        { id: 'prj_1', name: 'mel', framework: 'other', updatedAt: 2, createdAt: 1 },
        { id: 'prj_2' },
      ] });
    },
  });

  const projects = await bus.execute('vercel.projects.read', { limit: 1 }, owner);
  const deployments = await bus.execute('vercel.deployments.read', { projectId: 'prj_1', limit: 1 }, owner);

  assert.equal(projects.count, 1);
  assert.equal(deployments.count, 1);
  const projectCalls=seen.filter(call => /^https:\/\/api\.vercel\.com\/v9\/projects\?/.test(call.url));
  const deploymentCall=seen.find(call => /^https:\/\/api\.vercel\.com\/v6\/deployments\?/.test(call.url));
  assert.ok(projectCalls.length >= 2);
  assert.equal(projectCalls.every(call => /teamId=team_123/.test(call.url)), true);
  assert.ok(deploymentCall);
  assert.match(deploymentCall.url, /projectId=prj_1/);
  assert.match(deploymentCall.url, /teamId=team_123/);
  assert.equal(seen.every(call => call.authorization === 'Bearer vercel-secret'), true);
  assert.equal(JSON.stringify({ projects, deployments }).includes('vercel-secret'), false);
});

test('Cloudflare and Vercel fail closed when credentials are absent and upstream errors never echo bodies', async () => {
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo' },
    fetchImpl: async () => json({ error: 'contains-sensitive-upstream-detail' }, 403),
  });

  await assert.rejects(() => bus.execute('cloudflare.workers.read', {}, owner), /CAPABILITY_UNAVAILABLE/);
  await assert.rejects(() => bus.execute('vercel.projects.read', {}, owner), /CAPABILITY_UNAVAILABLE/);

  let caught;
  try {
    await bus.execute('github.repository.read', {}, owner);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.code, 'CAPABILITY_UNAVAILABLE');
  assert.equal(String(caught.message).includes('contains-sensitive-upstream-detail'), false);
});


test('platform read healthchecks turn working GitHub reads healthy and explain unconfigured providers', async () => {
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { MEL_GITHUB_REPOSITORY: 'owner/repo' },
    fetchImpl: async url => {
      if (String(url).includes('api.github.com/repos/owner/repo')) return json({ workflow_runs: [] });
      return json({}, 503);
    },
  });

  const github = await bus.refreshHealth('github.repository.read');
  const githubRuns = await bus.refreshHealth('github.actions.runs.read');
  const cloudflare = await bus.refreshHealth('cloudflare.workers.read');
  const vercel = await bus.refreshHealth('vercel.projects.read');

  assert.equal(github.health, 'HEALTHY');
  assert.equal(githubRuns.health, 'HEALTHY');
  assert.equal(cloudflare.health, 'UNAVAILABLE');
  assert.equal(cloudflare.health_detail, 'CLOUDFLARE_WORKERS_RELAY_NOT_CONFIGURED');
  assert.equal(vercel.health, 'UNAVAILABLE');
  assert.equal(vercel.health_detail, 'VERCEL_RUNTIME_CREDENTIALS_NOT_CONFIGURED');
});


test('Vercel reads accept encrypted runtime resolver when env token is absent', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: {},
    resolveVercelConfig: async () => ({
      token: 'vault-vercel-token',
      team_id: 'team_vault',
      project_id: 'prj_vault',
      project_name: 'mel-vault',
    }),
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), authorization: init.headers.authorization });
      return json({ projects: [{ id: 'prj_vault', name: 'mel-vault' }] });
    },
  });
  const result = await bus.execute('vercel.projects.read', { limit: 1 }, owner);
  assert.equal(result.count, 1);
  assert.equal(result.projects[0].id, 'prj_vault');
  assert.match(seen[0].url, /teamId=team_vault/);
  assert.equal(seen[0].authorization, 'Bearer vault-vercel-token');
  assert.equal(JSON.stringify(result).includes('vault-vercel-token'), false);
});
