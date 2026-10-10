import { D1CloudflareApiRelayStore } from '../platform/cloudflare-api-relay.js';
import { D1GitHubActionRelayStore } from '../platform/github-action-relay.js';
const GITHUB_API = 'https://api.github.com';
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const VERCEL_API = 'https://api.vercel.com';
const USER_AGENT = 'meliturgos-platform-control';
const MAX_LIST = 100;
const MAX_TEXT = 500;

function capabilityError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function required(value, code, maxLength = MAX_TEXT) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) throw capabilityError(code, 400);
  return normalized;
}

function limit(value, fallback = 20) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_LIST, Math.trunc(parsed)));
}

function repositoryPath(repository) {
  const normalized = required(repository, 'PLATFORM_REPOSITORY_REQUIRED', 200);
  const parts = normalized.split('/');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw capabilityError('PLATFORM_REPOSITORY_INVALID', 400);
  }
  return parts.map(encodeURIComponent).join('/');
}

function safeResource(value, code, maxLength = 200) {
  const normalized = required(value, code, maxLength);
  if (!/^[A-Za-z0-9_.:@/-]+$/.test(normalized) || normalized.includes('..')) {
    throw capabilityError(code, 400);
  }
  return normalized;
}

function bearer(token) {
  return {
    accept: 'application/json',
    authorization: 'Bearer ' + token,
    'user-agent': USER_AGENT,
  };
}

function createRequestTimeout(ms = 8000) {
  const Controller = globalThis?.AbortController;
  if (typeof Controller !== 'function') return { signal:null, cleanup:()=>{} };
  const controller = new Controller();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

async function requestJson(fetchImpl, url, { token = '', code = 'PLATFORM_READ_FAILED' } = {}) {
  const headers = token ? bearer(token) : { accept: 'application/json', 'user-agent': USER_AGENT };
  const timeout = createRequestTimeout(8000);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      headers,
      redirect: 'error',
      ...(timeout.signal ? { signal:timeout.signal } : {}),
    });
  } catch (error) {
    const name = String(error?.name || 'FETCH_FAILED').replace(/[^A-Za-z0-9_]/g, '_').toUpperCase().slice(0, 40);
    throw capabilityError(code + '_FETCH_' + name, 503);
  } finally {
    timeout.cleanup();
  }

  let parsed = null;
  try {
    parsed = await response.clone().json();
  } catch {}

  if (!response?.ok) {
    const cfCodes = Array.isArray(parsed?.errors)
      ? parsed.errors.map(row => Number(row?.code || 0)).filter(Boolean).slice(0, 4)
      : [];
    const detail = '_HTTP_' + String(Number(response?.status || 0) || 0)
      + (cfCodes.length ? '_CF_' + cfCodes.join('_') : '');
    if (response?.status === 401 || response?.status === 403) throw capabilityError(code + '_AUTH' + detail, 403);
    if (response?.status === 429) throw capabilityError(code + '_RATE_LIMITED' + detail, 503);
    throw capabilityError(code + detail, response?.status >= 400 && response?.status < 600 ? response.status : 502);
  }

  if (parsed) return parsed;
  try {
    return await response.json();
  } catch {
    throw capabilityError(code + '_INVALID_RESPONSE', 502);
  }
}

function configured(env, ...keys) {
  return keys.every(key => Boolean(String(env?.[key] || '').trim()));
}

function healthFailure(error) {
  const code = String(error?.code || error?.message || 'PROVIDER_HEALTHCHECK_FAILED').slice(0, 200);
  const status = Number(error?.status || 0);
  return {
    status: status === 401 || status === 403 || /AUTH_REQUIRED|NOT_CONFIGURED/.test(code) ? 'UNAVAILABLE' : 'DEGRADED',
    reason: code,
  };
}

async function probeHealth(task, unavailableReason = '') {
  if (unavailableReason) return { status: 'UNAVAILABLE', reason: unavailableReason };
  try {
    await task();
    return { status: 'HEALTHY' };
  } catch (error) {
    return healthFailure(error);
  }
}

function projectRow(row = {}) {
  return {
    id: String(row.id || ''),
    name: String(row.name || ''),
    framework: String(row.framework || ''),
    updated_at: Number(row.updatedAt || 0),
    created_at: Number(row.createdAt || 0),
  };
}

function deploymentRow(row = {}) {
  return {
    id: String(row.uid || row.id || ''),
    name: String(row.name || ''),
    url: String(row.url || ''),
    state: String(row.state || row.readyState || ''),
    target: String(row.target || ''),
    created_at: Number(row.createdAt || row.created || 0),
  };
}

export function registerPlatformReadCapabilities(bus, { env = {}, fetchImpl = fetch, repository = '', resolveVercelConfig = null, cloudflareRelayStore = null, githubRelayStore = null, includeVercel = true } = {}) {
  const githubRepository = repository || env.MEL_GITHUB_REPOSITORY || '';
  const githubToken = String(env.MEL_GITHUB_TOKEN || '').trim();
  const cloudflareToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  const cloudflareAccountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cloudflareRelay = cloudflareRelayStore || (env?.DB && typeof env.DB.prepare === 'function'
    ? new D1CloudflareApiRelayStore(env.DB)
    : null);
  const githubRelay = githubRelayStore || (env?.DB && typeof env.DB.prepare === 'function'
    ? new D1GitHubActionRelayStore(env.DB)
    : null);
  const staticVercelToken = String(env.VERCEL_TOKEN || '').trim();
  const staticVercelTeamId = String(env.VERCEL_TEAM_ID || '').trim();
  const getVercelConfig = async () => {
    const dynamic = typeof resolveVercelConfig === 'function' ? await resolveVercelConfig() : null;
    return {
      token: String(dynamic?.token || staticVercelToken || '').trim(),
      teamId: String(dynamic?.team_id || staticVercelTeamId || '').trim(),
    };
  };
  const githubRelaySnapshot = async () => {
    if (!githubRelay) return null;
    const health = await githubRelay.health();
    const metadata = health?.metadata && typeof health.metadata === 'object' ? health.metadata : {};
    const sameRepository = String(metadata.repository || '') === githubRepository;
    if (!health?.online || !sameRepository) return null;
    return {
      repository: metadata.repository_metadata && typeof metadata.repository_metadata === 'object'
        ? metadata.repository_metadata
        : null,
      runs: Array.isArray(metadata.actions_runs) ? metadata.actions_runs : null,
      snapshot_at: String(metadata.snapshot_at || ''),
      transport: githubRelay.transport || 'd1-github-actions-relay',
    };
  };

  const githubRepositoryBody = async () => {
    if (!githubToken && githubRelay) {
      const snapshot = await githubRelaySnapshot().catch(() => null);
      if (snapshot?.repository) return { body:snapshot.repository, transport:snapshot.transport, snapshot_at:snapshot.snapshot_at };
    }
    try {
      const body = await requestJson(fetchImpl, `${GITHUB_API}/repos/${repositoryPath(githubRepository)}`, {
        token: githubToken,
        code: 'GITHUB_REPOSITORY_READ_FAILED',
      });
      return { body, transport:'direct-github-api', snapshot_at:null };
    } catch (error) {
      const snapshot = await githubRelaySnapshot().catch(() => null);
      if (snapshot?.repository) return { body:snapshot.repository, transport:snapshot.transport, snapshot_at:snapshot.snapshot_at };
      throw error;
    }
  };

  const githubRunsBody = async (count) => {
    if (!githubToken && githubRelay) {
      const snapshot = await githubRelaySnapshot().catch(() => null);
      if (Array.isArray(snapshot?.runs)) {
        return { body:{ workflow_runs:snapshot.runs.slice(0, count) }, transport:snapshot.transport, snapshot_at:snapshot.snapshot_at };
      }
    }
    try {
      const body = await requestJson(fetchImpl, `${GITHUB_API}/repos/${repositoryPath(githubRepository)}/actions/runs?per_page=${count}`, {
        token: githubToken,
        code: 'GITHUB_ACTIONS_READ_FAILED',
      });
      return { body, transport:'direct-github-api', snapshot_at:null };
    } catch (error) {
      const snapshot = await githubRelaySnapshot().catch(() => null);
      if (Array.isArray(snapshot?.runs)) {
        return { body:{ workflow_runs:snapshot.runs.slice(0, count) }, transport:snapshot.transport, snapshot_at:snapshot.snapshot_at };
      }
      throw error;
    }
  };

  bus.discover({
    id: 'github.repository.read',
    name: 'GitHub repository metadata',
    category: 'development',
    version: '1.0.0',
    provider: 'github',
    description: 'Reads bounded metadata for the single configured MELITURGOS GitHub repository.',
    input_schema: { type: 'object', additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: githubRepository ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
    healthcheck: async () => probeHealth(
      () => githubRepositoryBody(),
      githubRepository ? '' : 'GITHUB_REPOSITORY_NOT_CONFIGURED',
    ),
  }, async () => {
    const { body, transport, snapshot_at } = await githubRepositoryBody();
    return {
      provider: 'github',
      repository: githubRepository,
      transport,
      snapshot_at,
      id: Number(body.id || 0),
      name: String(body.name || ''),
      full_name: String(body.full_name || githubRepository),
      private: Boolean(body.private),
      archived: Boolean(body.archived),
      disabled: Boolean(body.disabled),
      visibility: String(body.visibility || ''),
      default_branch: String(body.default_branch || ''),
      pushed_at: String(body.pushed_at || ''),
      updated_at: String(body.updated_at || ''),
    };
  });

  bus.discover({
    id: 'github.actions.runs.read',
    name: 'GitHub Actions runs',
    category: 'development',
    version: '1.0.0',
    provider: 'github',
    description: 'Reads a bounded list of workflow runs for the single configured MELITURGOS GitHub repository.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_LIST } },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: githubRepository ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
    healthcheck: async () => probeHealth(
      () => githubRunsBody(1),
      githubRepository ? '' : 'GITHUB_REPOSITORY_NOT_CONFIGURED',
    ),
  }, async input => {
    const count = limit(input.limit);
    const { body, transport, snapshot_at } = await githubRunsBody(count);
    const runs = (Array.isArray(body.workflow_runs) ? body.workflow_runs : []).slice(0, count).map(row => ({
      id: Number(row.id || 0),
      name: String(row.name || ''),
      event: String(row.event || ''),
      status: String(row.status || ''),
      conclusion: String(row.conclusion || ''),
      head_branch: String(row.head_branch || ''),
      head_sha: String(row.head_sha || ''),
      run_number: Number(row.run_number || 0),
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || ''),
      html_url: String(row.html_url || ''),
    }));
    return { provider: 'github', repository: githubRepository, transport, snapshot_at, runs, count: runs.length };
  });

  bus.discover({
    id: 'cloudflare.workers.read',
    name: 'Cloudflare Workers list',
    category: 'development',
    version: '1.1.0',
    provider: 'cloudflare',
    description: 'Reads a bounded inventory of Worker scripts. In production it uses the durable GitHub Actions Cloudflare relay because Workers cannot reliably call Cloudflare-owned API IPs directly.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
        relay_job_id: { type: 'string', minLength: 1, maxLength: 200 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: cloudflareRelay || configured(env, 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID') ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
    healthcheck: async () => {
      if (cloudflareRelay) {
        try {
          const health = await cloudflareRelay.health();
          return health.online
            ? { status: 'HEALTHY' }
            : { status: 'DEGRADED', reason: 'CLOUDFLARE_API_RELAY_OFFLINE' };
        } catch (error) {
          return healthFailure(error);
        }
      }
      return probeHealth(
        () => requestJson(fetchImpl, `${CLOUDFLARE_API}/accounts/${encodeURIComponent(safeResource(cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID_INVALID', 64))}/workers/scripts`, {
          token: cloudflareToken,
          code: 'CLOUDFLARE_WORKERS_READ_FAILED',
        }),
        cloudflareToken && cloudflareAccountId ? '' : 'CLOUDFLARE_RUNTIME_CREDENTIALS_NOT_CONFIGURED',
      );
    },
  }, async input => {
    const count = limit(input.limit);
    if (cloudflareRelay) {
      const jobId = String(input.relay_job_id || '').trim();
      if (jobId) {
        if (!/^cf-relay-[A-Za-z0-9-]+$/.test(jobId)) throw capabilityError('CLOUDFLARE_RELAY_JOB_ID_INVALID', 400);
        const job = await cloudflareRelay.get(jobId);
        if (!job) throw capabilityError('CLOUDFLARE_RELAY_JOB_NOT_FOUND', 404);
        if (job.status === 'FAILED') throw capabilityError(job.error || 'CLOUDFLARE_RELAY_JOB_FAILED', 502);
        if (job.status === 'COMPLETE') return job.result || { provider:'cloudflare', scripts:[], count:0 };
        return { provider:'cloudflare', transport:cloudflareRelay.transport, pending:true, relay_job_id:job.id, status:job.status };
      }
      const job = await cloudflareRelay.enqueue({ operation:'workers.list', input:{ limit:count } });
      return { provider:'cloudflare', transport:cloudflareRelay.transport, pending:true, relay_job_id:job.id, status:job.status };
    }
    if (!cloudflareToken || !cloudflareAccountId) throw capabilityError('CLOUDFLARE_AUTH_REQUIRED', 503);
    const accountId = safeResource(cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID_INVALID', 64);
    const body = await requestJson(fetchImpl, `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/workers/scripts`, {
      token: cloudflareToken,
      code: 'CLOUDFLARE_WORKERS_READ_FAILED',
    });
    if (body?.success === false) throw capabilityError('CLOUDFLARE_WORKERS_READ_FAILED', 502);
    const scripts = (Array.isArray(body?.result) ? body.result : []).slice(0, count).map(row => ({
      id: String(row.id || ''),
      created_on: String(row.created_on || ''),
      modified_on: String(row.modified_on || ''),
      compatibility_date: String(row.compatibility_date || ''),
      usage_model: String(row.usage_model || ''),
      last_deployed_from: String(row.last_deployed_from || ''),
    }));
    return { provider: 'cloudflare', scripts, count: scripts.length };
  });

  bus.discover({
    id: 'cloudflare.deployments.read',
    name: 'Cloudflare Worker deployments',
    category: 'development',
    version: '1.1.0',
    provider: 'cloudflare',
    description: 'Reads bounded deployment metadata for one Worker. In production it uses the durable GitHub Actions Cloudflare relay.',
    input_schema: {
      type: 'object',
      properties: {
        script: { type: 'string', minLength: 1, maxLength: 128 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
        relay_job_id: { type: 'string', minLength: 1, maxLength: 200 },
      },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: cloudflareRelay || configured(env, 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID') ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
    healthcheck: async () => {
      if (cloudflareRelay) {
        try {
          const health = await cloudflareRelay.health();
          return health.online
            ? { status: 'HEALTHY' }
            : { status: 'DEGRADED', reason: 'CLOUDFLARE_API_RELAY_OFFLINE' };
        } catch (error) {
          return healthFailure(error);
        }
      }
      return probeHealth(
        () => requestJson(fetchImpl, `${CLOUDFLARE_API}/accounts/${encodeURIComponent(safeResource(cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID_INVALID', 64))}/workers/scripts`, {
          token: cloudflareToken,
          code: 'CLOUDFLARE_WORKERS_READ_FAILED',
        }),
        cloudflareToken && cloudflareAccountId ? '' : 'CLOUDFLARE_RUNTIME_CREDENTIALS_NOT_CONFIGURED',
      );
    },
  }, async input => {
    const count = limit(input.limit);
    if (cloudflareRelay) {
      const jobId = String(input.relay_job_id || '').trim();
      if (jobId) {
        if (!/^cf-relay-[A-Za-z0-9-]+$/.test(jobId)) throw capabilityError('CLOUDFLARE_RELAY_JOB_ID_INVALID', 400);
        const job = await cloudflareRelay.get(jobId);
        if (!job) throw capabilityError('CLOUDFLARE_RELAY_JOB_NOT_FOUND', 404);
        if (job.status === 'FAILED') throw capabilityError(job.error || 'CLOUDFLARE_RELAY_JOB_FAILED', 502);
        if (job.status === 'COMPLETE') return job.result || { provider:'cloudflare', deployments:[], count:0 };
        return { provider:'cloudflare', transport:cloudflareRelay.transport, pending:true, relay_job_id:job.id, status:job.status };
      }
      const script = safeResource(input.script, 'CLOUDFLARE_SCRIPT_INVALID', 128);
      const job = await cloudflareRelay.enqueue({ operation:'deployments.list', input:{ script, limit:count } });
      return { provider:'cloudflare', transport:cloudflareRelay.transport, pending:true, relay_job_id:job.id, status:job.status };
    }
    if (!cloudflareToken || !cloudflareAccountId) throw capabilityError('CLOUDFLARE_AUTH_REQUIRED', 503);
    const accountId = safeResource(cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID_INVALID', 64);
    const script = safeResource(input.script, 'CLOUDFLARE_SCRIPT_INVALID', 128);
    const body = await requestJson(fetchImpl, `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(script)}/deployments`, {
      token: cloudflareToken,
      code: 'CLOUDFLARE_DEPLOYMENTS_READ_FAILED',
    });
    if (body?.success === false) throw capabilityError('CLOUDFLARE_DEPLOYMENTS_READ_FAILED', 502);
    const deployments = (Array.isArray(body?.result?.deployments) ? body.result.deployments : []).slice(0, count).map(row => ({
      id: String(row.id || ''),
      created_on: String(row.created_on || ''),
      source: String(row.source || ''),
      strategy: String(row.strategy || ''),
      versions: Array.isArray(row.versions) ? row.versions.slice(0, 20).map(version => ({
        version_id: String(version.version_id || ''),
        percentage: Number(version.percentage || 0),
      })) : [],
    }));
    return { provider: 'cloudflare', script, deployments, count: deployments.length };
  });

  if (includeVercel) {
  bus.discover({
    id: 'vercel.projects.read',
    name: 'Vercel projects list',
    category: 'development',
    version: '1.0.0',
    provider: 'vercel',
    description: 'Reads a bounded project inventory from the configured Vercel account or team.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: MAX_LIST } },
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: staticVercelToken || typeof resolveVercelConfig === 'function' ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
    healthcheck: async () => {
      const cfg = await getVercelConfig();
      return probeHealth(
        () => requestJson(fetchImpl, `${VERCEL_API}/v2/user`, {
          token: cfg.token,
          code: 'VERCEL_ACCOUNT_HEALTH_FAILED',
        }),
        cfg.token ? '' : 'VERCEL_RUNTIME_CREDENTIALS_NOT_CONFIGURED',
      );
    },
  }, async input => {
    const cfg = await getVercelConfig();
    if (!cfg.token) throw capabilityError('VERCEL_AUTH_REQUIRED', 503);
    const count = limit(input.limit);
    const params = new URLSearchParams({ limit: String(count) });
    if (cfg.teamId) params.set('teamId', cfg.teamId);
    const body = await requestJson(fetchImpl, `${VERCEL_API}/v9/projects?${params.toString()}`, {
      token: cfg.token,
      code: 'VERCEL_PROJECTS_READ_FAILED',
    });
    const projects = (Array.isArray(body?.projects) ? body.projects : []).slice(0, count).map(projectRow);
    return { provider: 'vercel', projects, count: projects.length };
  });

  bus.discover({
    id: 'vercel.deployments.read',
    name: 'Vercel deployments list',
    category: 'development',
    version: '1.0.0',
    provider: 'vercel',
    description: 'Reads bounded deployment metadata for one Vercel project without creating, cancelling or promoting deployments.',
    input_schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', minLength: 1, maxLength: 200 },
        limit: { type: 'integer', minimum: 1, maximum: MAX_LIST },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health: staticVercelToken || typeof resolveVercelConfig === 'function' ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
    healthcheck: async () => {
      const cfg = await getVercelConfig();
      return probeHealth(
        () => requestJson(fetchImpl, `${VERCEL_API}/v2/user`, {
          token: cfg.token,
          code: 'VERCEL_ACCOUNT_HEALTH_FAILED',
        }),
        cfg.token ? '' : 'VERCEL_RUNTIME_CREDENTIALS_NOT_CONFIGURED',
      );
    },
  }, async input => {
    const cfg = await getVercelConfig();
    if (!cfg.token) throw capabilityError('VERCEL_AUTH_REQUIRED', 503);
    const projectId = safeResource(input.projectId, 'VERCEL_PROJECT_ID_INVALID', 200);
    const count = limit(input.limit);
    const params = new URLSearchParams({ projectId, limit: String(count) });
    if (cfg.teamId) params.set('teamId', cfg.teamId);
    const body = await requestJson(fetchImpl, `${VERCEL_API}/v6/deployments?${params.toString()}`, {
      token: cfg.token,
      code: 'VERCEL_DEPLOYMENTS_READ_FAILED',
    });
    const deployments = (Array.isArray(body?.deployments) ? body.deployments : []).slice(0, count).map(deploymentRow);
    return { provider: 'vercel', project_id: projectId, deployments, count: deployments.length };
  });

  }
  return Object.freeze([
    'github.repository.read',
    'github.actions.runs.read',
    'cloudflare.workers.read',
    'cloudflare.deployments.read',
    ...(includeVercel ? ['vercel.projects.read', 'vercel.deployments.read'] : []),
  ]);
}
