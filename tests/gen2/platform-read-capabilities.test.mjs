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

test('GEN2-36 registers bounded read-only GitHub and Cloudflare capabilities', () => {
  const bus = new CapabilityBus();
  const ids = registerPlatformReadCapabilities(bus, {
    env: {
      MEL_GITHUB_REPOSITORY: 'owner/repo',
      CLOUDFLARE_API_TOKEN: 'cf-secret',
      CLOUDFLARE_ACCOUNT_ID: 'abc123',
    },
    fetchImpl: async () => json({}),
  });

  assert.deepEqual(ids, [
    'github.repository.read',
    'github.actions.runs.read',
    'cloudflare.workers.read',
    'cloudflare.deployments.read',
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

test('Cloudflare reads only Workers inventory and deployment metadata, never source or secrets', async () => {
  const seen = [];
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { CLOUDFLARE_API_TOKEN: 'cf-secret', CLOUDFLARE_ACCOUNT_ID: 'account123' },
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), authorization: init.headers.authorization });
      if (String(url).endsWith('/deployments')) {
        return json({ success: true, result: { deployments: [
          { id: 'd1', created_on: '2026-09-22T00:00:00Z', source: 'api', strategy: 'percentage', versions: [{ version_id: 'v1', percentage: 100 }] },
          { id: 'd2' },
        ] } });
      }
      return json({ success: true, result: [
        { id: 'meliturgos', modified_on: '2026-09-22T00:00:00Z', compatibility_date: '2026-09-04' },
        { id: 'other' },
      ] });
    },
  });

  const workers = await bus.execute('cloudflare.workers.read', { limit: 1 }, owner);
  const deployments = await bus.execute('cloudflare.deployments.read', { script: 'meliturgos', limit: 1 }, owner);

  assert.equal(workers.count, 1);
  assert.equal(workers.scripts[0].id, 'meliturgos');
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

test('Cloudflare failures expose only sanitized HTTP and Cloudflare numeric error codes', async () => {
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: { CLOUDFLARE_API_TOKEN: 'cf-secret', CLOUDFLARE_ACCOUNT_ID: 'account123' },
    fetchImpl: async () => json({ errors: [{ code: 10000, message: 'secret upstream message' }] }, 503),
  });

  let caught;
  try {
    await bus.execute('cloudflare.workers.read', { limit: 1 }, owner);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.match(caught.code, /CLOUDFLARE_WORKERS_READ_FAILED_HTTP_503_CF_10000/);
  assert.equal(String(caught.code).includes('secret upstream message'), false);
  assert.equal(String(caught.code).includes('cf-secret'), false);
});

test('Cloudflare workers read uses durable relay enqueue and readback without direct Cloudflare fetch', async () => {
  const jobs = new Map();
  const relay = {
    transport: 'd1-cloudflare-api-relay',
    health: async () => ({ online:true, status:'ONLINE' }),
    enqueue: async ({ operation, input }) => {
      assert.equal(operation, 'workers.list');
      const job = { id:'cf-relay-test-1', status:'QUEUED', operation, input };
      jobs.set(job.id, job);
      return job;
    },
    get: async id => jobs.get(id) || null,
  };
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: {},
    cloudflareRelayStore: relay,
    fetchImpl: async () => { throw new Error('DIRECT_FETCH_MUST_NOT_RUN'); },
  });

  const queued = await bus.execute('cloudflare.workers.read', { limit:2 }, owner);
  assert.equal(queued.pending, true);
  assert.equal(queued.relay_job_id, 'cf-relay-test-1');
  jobs.set('cf-relay-test-1', {
    ...jobs.get('cf-relay-test-1'),
    status:'COMPLETE',
    result:{ provider:'cloudflare', transport:'github-actions-relay', scripts:[{id:'meliturgos'}], count:1 },
  });
  const completed = await bus.execute('cloudflare.workers.read', { relay_job_id:'cf-relay-test-1' }, owner);
  assert.equal(completed.count, 1);
  assert.equal(completed.scripts[0].id, 'meliturgos');
  assert.equal(completed.transport, 'github-actions-relay');
});

test('Cloudflare deployments read uses durable relay enqueue and readback', async () => {
  const jobs = new Map();
  const relay = {
    transport: 'd1-cloudflare-api-relay',
    health: async () => ({ online:true, status:'ONLINE' }),
    enqueue: async ({ operation, input }) => {
      assert.equal(operation, 'deployments.list');
      assert.equal(input.script, 'meliturgos');
      const job = { id:'cf-relay-deployments-1', status:'QUEUED', operation, input };
      jobs.set(job.id, job);
      return job;
    },
    get: async id => jobs.get(id) || null,
  };
  const bus = new CapabilityBus();
  registerPlatformReadCapabilities(bus, {
    env: {},
    cloudflareRelayStore: relay,
    fetchImpl: async () => { throw new Error('DIRECT_FETCH_MUST_NOT_RUN'); },
  });
  const queued = await bus.execute('cloudflare.deployments.read', { script:'meliturgos', limit:2 }, owner);
  assert.equal(queued.pending, true);
  jobs.set('cf-relay-deployments-1', {
    ...jobs.get('cf-relay-deployments-1'),
    status:'COMPLETE',
    result:{ provider:'cloudflare', transport:'github-actions-relay', script:'meliturgos', deployments:[{id:'dep-1'}], count:1 },
  });
  const completed = await bus.execute('cloudflare.deployments.read', { relay_job_id:'cf-relay-deployments-1' }, owner);
  assert.equal(completed.count, 1);
  assert.equal(completed.deployments[0].id, 'dep-1');
  assert.equal(completed.transport, 'github-actions-relay');
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

  assert.equal(github.health, 'HEALTHY');
  assert.equal(githubRuns.health, 'HEALTHY');
  assert.equal(cloudflare.health, 'UNAVAILABLE');
  assert.equal(cloudflare.health_detail, 'CLOUDFLARE_RUNTIME_CREDENTIALS_NOT_CONFIGURED');
});


test('platform reads stay healthy when AbortSignal.timeout is unavailable in the runtime', async () => {
  const descriptor=Object.getOwnPropertyDescriptor(AbortSignal,'timeout');
  Object.defineProperty(AbortSignal,'timeout',{
    configurable:true,
    value:()=>{ throw new TypeError('AbortSignal.timeout unsupported'); },
  });
  try {
    const bus=new CapabilityBus();
    registerPlatformReadCapabilities(bus,{
      env:{ MEL_GITHUB_REPOSITORY:'owner/repo' },
      fetchImpl:async url => {
        if(String(url).includes('/actions/runs')) return json({ workflow_runs:[] });
        return json({ id:42, name:'repo', full_name:'owner/repo', default_branch:'main' });
      },
    });
    const repoHealth=await bus.refreshHealth('github.repository.read');
    const runsHealth=await bus.refreshHealth('github.actions.runs.read');
    assert.equal(repoHealth.health,'HEALTHY');
    assert.equal(runsHealth.health,'HEALTHY');
  } finally {
    if(descriptor) Object.defineProperty(AbortSignal,'timeout',descriptor);
    else delete AbortSignal.timeout;
  }
});


test('GitHub read capabilities use a fresh Actions relay snapshot when direct Worker fetch is unavailable', async () => {
  let directCalls=0;
  const relay={
    transport:'d1-github-actions-relay',
    async health(){
      return {
        online:true,
        status:'ONLINE',
        metadata:{
          repository:'owner/repo',
          snapshot_at:'2026-10-01T07:00:00.000Z',
          repository_metadata:{
            id:42,
            name:'repo',
            full_name:'owner/repo',
            private:true,
            archived:false,
            disabled:false,
            visibility:'private',
            default_branch:'main',
            pushed_at:'2026-10-01T06:59:00Z',
            updated_at:'2026-10-01T06:59:30Z',
          },
          actions_runs:[
            {id:101,name:'ci',event:'push',status:'completed',conclusion:'success',head_branch:'main',head_sha:'a'.repeat(40),run_number:7,created_at:'2026-10-01T06:58:00Z',updated_at:'2026-10-01T06:59:00Z',html_url:'https://github.com/owner/repo/actions/runs/101'},
            {id:102,name:'deploy',event:'push',status:'completed',conclusion:'success',head_branch:'main',head_sha:'b'.repeat(40),run_number:8,created_at:'2026-10-01T06:59:00Z',updated_at:'2026-10-01T07:00:00Z',html_url:'https://github.com/owner/repo/actions/runs/102'},
          ],
        },
      };
    },
  };

  const bus=new CapabilityBus();
  registerPlatformReadCapabilities(bus,{
    env:{ MEL_GITHUB_REPOSITORY:'owner/repo' },
    githubRelayStore:relay,
    fetchImpl:async()=>{directCalls+=1;throw new TypeError('direct Worker GitHub fetch unavailable');},
  });

  const repoHealth=await bus.refreshHealth('github.repository.read');
  const runsHealth=await bus.refreshHealth('github.actions.runs.read');
  assert.equal(repoHealth.health,'HEALTHY');
  assert.equal(runsHealth.health,'HEALTHY');

  const repo=await bus.execute('github.repository.read',{},owner);
  const runs=await bus.execute('github.actions.runs.read',{limit:1},owner);
  assert.equal(repo.full_name,'owner/repo');
  assert.equal(repo.transport,'d1-github-actions-relay');
  assert.equal(repo.snapshot_at,'2026-10-01T07:00:00.000Z');
  assert.equal(runs.count,1);
  assert.equal(runs.runs[0].id,101);
  assert.equal(runs.transport,'d1-github-actions-relay');
  assert.equal(directCalls,0);
});

test('GitHub read relay snapshot is rejected when it belongs to another repository', async () => {
  const relay={
    transport:'d1-github-actions-relay',
    async health(){
      return {
        online:true,
        metadata:{
          repository:'other/repo',
          repository_metadata:{id:1,full_name:'other/repo'},
          actions_runs:[],
        },
      };
    },
  };
  const bus=new CapabilityBus();
  registerPlatformReadCapabilities(bus,{
    env:{ MEL_GITHUB_REPOSITORY:'owner/repo' },
    githubRelayStore:relay,
    fetchImpl:async()=>{throw new TypeError('direct failed');},
  });
  const health=await bus.refreshHealth('github.repository.read');
  assert.equal(health.health,'DEGRADED');
  assert.equal(health.health_detail,'GITHUB_REPOSITORY_READ_FAILED_FETCH_TYPEERROR');
});
