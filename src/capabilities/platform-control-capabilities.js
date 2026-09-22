const GITHUB_API = 'https://api.github.com';
const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';
const VERCEL_API = 'https://api.vercel.com';
const USER_AGENT = 'meliturgos-platform-control';
const MAX_INPUTS = 25;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function capabilityError(code, status = 502) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}

function required(value, code, maxLength = 200) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) throw capabilityError(code, 400);
  return normalized;
}

function configured(env, ...keys) {
  return keys.every(key => Boolean(String(env?.[key] || '').trim()));
}

function safeResource(value, code, maxLength = 200) {
  const normalized = required(value, code, maxLength);
  if (!/^[A-Za-z0-9_.:@/-]+$/.test(normalized) || normalized.includes('..') || normalized.startsWith('/')) {
    throw capabilityError(code, 400);
  }
  return normalized;
}

function safeWorkflow(value) {
  const workflow = required(value, 'GITHUB_WORKFLOW_INVALID', 160);
  if (!/^\d+$/.test(workflow) && !/^[A-Za-z0-9_.-]+\.(?:ya?ml)$/i.test(workflow)) {
    throw capabilityError('GITHUB_WORKFLOW_INVALID', 400);
  }
  return workflow;
}

function safeRef(value) {
  const ref = safeResource(value, 'GITHUB_REF_INVALID', 200);
  if (ref.startsWith('-') || ref.endsWith('/')) throw capabilityError('GITHUB_REF_INVALID', 400);
  return ref;
}

function parseAllowlist(value) {
  return [...new Set(String(value || '').split(',').map(row => row.trim()).filter(Boolean))].slice(0, 64);
}

function normalizeWorkflowInputs(value) {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw capabilityError('GITHUB_INPUTS_INVALID', 400);
  const entries = Object.entries(value);
  if (entries.length > MAX_INPUTS) throw capabilityError('GITHUB_INPUTS_INVALID', 400);
  const output = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(key)) throw capabilityError('GITHUB_INPUT_KEY_INVALID', 400);
    if (!['string', 'number', 'boolean'].includes(typeof item)) throw capabilityError('GITHUB_INPUT_VALUE_INVALID', 400);
    if (typeof item === 'string' && item.length > 1000) throw capabilityError('GITHUB_INPUT_VALUE_INVALID', 400);
    output[key] = item;
  }
  return output;
}

function bearer(token, extra = {}) {
  return {
    accept: 'application/json',
    authorization: 'Bearer ' + token,
    'content-type': 'application/json',
    'user-agent': USER_AGENT,
    ...extra,
  };
}

async function requestJson(fetchImpl, url, { token, method = 'POST', body, code, headers = {} } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: bearer(token, headers),
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw capabilityError(code, 503);
  }

  if (!response?.ok) {
    if (response?.status === 401 || response?.status === 403) throw capabilityError(code + '_AUTH', 403);
    if (response?.status === 429) throw capabilityError(code + '_RATE_LIMITED', 503);
    throw capabilityError(code, response?.status >= 400 && response?.status < 600 ? response.status : 502);
  }

  if (response.status === 204) return {};
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw capabilityError(code + '_INVALID_RESPONSE', 502);
  }
}

function repositoryPath(repository) {
  const normalized = required(repository, 'PLATFORM_REPOSITORY_REQUIRED', 200);
  const parts = normalized.split('/');
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw capabilityError('PLATFORM_REPOSITORY_INVALID', 400);
  }
  return parts.map(encodeURIComponent).join('/');
}

function normalizeVersions(versions) {
  if (!Array.isArray(versions) || versions.length < 1 || versions.length > 2) {
    throw capabilityError('CLOUDFLARE_VERSIONS_INVALID', 400);
  }
  const seen = new Set();
  const normalized = versions.map(row => {
    const versionId = required(row?.version_id, 'CLOUDFLARE_VERSION_ID_INVALID', 64);
    const percentage = Number(row?.percentage);
    if (!UUID.test(versionId) || seen.has(versionId)) throw capabilityError('CLOUDFLARE_VERSION_ID_INVALID', 400);
    if (!Number.isFinite(percentage) || percentage < 0.01 || percentage > 100) {
      throw capabilityError('CLOUDFLARE_PERCENTAGE_INVALID', 400);
    }
    seen.add(versionId);
    return { version_id: versionId, percentage };
  });
  const total = normalized.reduce((sum, row) => sum + row.percentage, 0);
  if (Math.abs(total - 100) > 0.001) throw capabilityError('CLOUDFLARE_PERCENTAGE_TOTAL_INVALID', 400);
  return normalized;
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

export function registerPlatformControlCapabilities(bus, { env = {}, fetchImpl = fetch, repository = '' } = {}) {
  if (!bus || typeof bus.discover !== 'function') throw new TypeError('CAPABILITY_BUS_REQUIRED');

  const githubRepository = repository || env.MEL_GITHUB_REPOSITORY || '';
  const githubToken = String(env.MEL_GITHUB_TOKEN || '').trim();
  const githubWorkflows = parseAllowlist(env.MEL_GITHUB_WRITABLE_WORKFLOWS);

  const cloudflareToken = String(env.CLOUDFLARE_API_TOKEN || '').trim();
  const cloudflareAccountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const cloudflareScript = String(env.MEL_CLOUDFLARE_SCRIPT || '').trim();

  const vercelToken = String(env.VERCEL_TOKEN || '').trim();
  const vercelTeamId = String(env.VERCEL_TEAM_ID || '').trim();
  const vercelProjectId = String(env.MEL_VERCEL_PROJECT_ID || '').trim();
  const vercelProjectName = String(env.MEL_VERCEL_PROJECT_NAME || '').trim();

  bus.discover({
    id: 'github.actions.workflow.dispatch',
    name: 'GitHub workflow dispatch',
    category: 'development',
    version: '1.0.0',
    provider: 'github',
    description: 'Triggers one explicitly allowlisted workflow in the configured MELITURGOS repository. Requires exact owner approval.',
    input_schema: {
      type: 'object',
      properties: {
        workflow: { type: 'string', minLength: 1, maxLength: 160 },
        ref: { type: 'string', minLength: 1, maxLength: 200 },
        inputs: { type: 'object', additionalProperties: true },
      },
      required: ['workflow', 'ref'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [],
    approval: { required: true, scope: 'github.actions.workflow.dispatch', reason: 'GITHUB_WORKFLOW_MUTATION' },
    health: githubRepository && githubToken && githubWorkflows.length ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    if (!githubToken || !githubRepository || !githubWorkflows.length) throw capabilityError('GITHUB_CONTROL_NOT_CONFIGURED', 503);
    const workflow = safeWorkflow(input.workflow);
    if (!githubWorkflows.includes(workflow)) throw capabilityError('GITHUB_WORKFLOW_NOT_ALLOWED', 403);
    const ref = safeRef(input.ref);
    const inputs = normalizeWorkflowInputs(input.inputs);
    const repoPath = repositoryPath(githubRepository);
    const body = await requestJson(
      fetchImpl,
      `${GITHUB_API}/repos/${repoPath}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        token: githubToken,
        body: { ref, inputs },
        code: 'GITHUB_WORKFLOW_DISPATCH_FAILED',
        headers: {
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2026-03-10',
        },
      },
    );
    return {
      provider: 'github',
      repository: githubRepository,
      workflow,
      ref,
      accepted: true,
      workflow_run_id: Number(body?.workflow_run_id || 0),
      run_url: String(body?.run_url || ''),
      html_url: String(body?.html_url || ''),
    };
  });

  bus.discover({
    id: 'cloudflare.deployments.create',
    name: 'Cloudflare Worker deployment control',
    category: 'development',
    version: '1.0.0',
    provider: 'cloudflare',
    description: 'Creates a percentage deployment for the single configured Worker using existing version IDs. No source upload, force rollback, or arbitrary Worker target is allowed.',
    input_schema: {
      type: 'object',
      properties: {
        versions: {
          type: 'array',
          minItems: 1,
          maxItems: 2,
          items: {
            type: 'object',
            properties: {
              version_id: { type: 'string', minLength: 1, maxLength: 64 },
              percentage: { type: 'number', minimum: 0.01, maximum: 100 },
            },
            required: ['version_id', 'percentage'],
            additionalProperties: false,
          },
        },
        message: { type: 'string', minLength: 0, maxLength: 500 },
      },
      required: ['versions'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [],
    approval: { required: true, scope: 'cloudflare.deployments.create', reason: 'CLOUDFLARE_DEPLOYMENT_MUTATION' },
    health: configured(env, 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'MEL_CLOUDFLARE_SCRIPT') ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    if (!cloudflareToken || !cloudflareAccountId || !cloudflareScript) throw capabilityError('CLOUDFLARE_CONTROL_NOT_CONFIGURED', 503);
    const accountId = safeResource(cloudflareAccountId, 'CLOUDFLARE_ACCOUNT_ID_INVALID', 64);
    const script = safeResource(cloudflareScript, 'CLOUDFLARE_SCRIPT_INVALID', 128);
    const versions = normalizeVersions(input.versions);
    const message = String(input.message || '').trim().slice(0, 500);
    const body = await requestJson(
      fetchImpl,
      `${CLOUDFLARE_API}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(script)}/deployments`,
      {
        token: cloudflareToken,
        body: {
          strategy: 'percentage',
          versions,
          annotations: {
            'workers/message': message || 'MELITURGOS approved deployment control',
          },
        },
        code: 'CLOUDFLARE_DEPLOYMENT_CREATE_FAILED',
      },
    );
    if (body?.success === false) throw capabilityError('CLOUDFLARE_DEPLOYMENT_CREATE_FAILED', 502);
    const result = body?.result || {};
    return {
      provider: 'cloudflare',
      script,
      deployment: {
        id: String(result.id || ''),
        created_on: String(result.created_on || ''),
        source: String(result.source || ''),
        strategy: String(result.strategy || ''),
        versions: Array.isArray(result.versions) ? result.versions.slice(0, 2).map(row => ({
          version_id: String(row.version_id || ''),
          percentage: Number(row.percentage || 0),
        })) : [],
      },
    };
  });

  bus.discover({
    id: 'vercel.deployments.redeploy',
    name: 'Vercel deployment redeploy',
    category: 'development',
    version: '1.0.0',
    provider: 'vercel',
    description: 'Redeploys one existing deployment inside the single configured Vercel project. File uploads, arbitrary projects and arbitrary API bodies are not accepted.',
    input_schema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string', minLength: 1, maxLength: 200 },
        target: { type: 'string', enum: ['preview', 'production'] },
      },
      required: ['deploymentId'],
      additionalProperties: false,
    },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [],
    approval: { required: true, scope: 'vercel.deployments.redeploy', reason: 'VERCEL_DEPLOYMENT_MUTATION' },
    health: configured(env, 'VERCEL_TOKEN', 'MEL_VERCEL_PROJECT_ID', 'MEL_VERCEL_PROJECT_NAME') ? 'DEGRADED' : 'UNAVAILABLE',
    enabled: true,
  }, async input => {
    if (!vercelToken || !vercelProjectId || !vercelProjectName) throw capabilityError('VERCEL_CONTROL_NOT_CONFIGURED', 503);
    const deploymentId = safeResource(input.deploymentId, 'VERCEL_DEPLOYMENT_ID_INVALID', 200);
    const projectId = safeResource(vercelProjectId, 'VERCEL_PROJECT_ID_INVALID', 200);
    const projectName = safeResource(vercelProjectName, 'VERCEL_PROJECT_NAME_INVALID', 200);
    const params = new URLSearchParams();
    if (vercelTeamId) params.set('teamId', safeResource(vercelTeamId, 'VERCEL_TEAM_ID_INVALID', 200));
    const url = `${VERCEL_API}/v13/deployments${params.size ? '?' + params.toString() : ''}`;
    const requestBody = {
      name: projectName,
      project: projectId,
      deploymentId,
    };
    if (input.target === 'production') requestBody.target = 'production';
    const body = await requestJson(fetchImpl, url, {
      token: vercelToken,
      body: requestBody,
      code: 'VERCEL_REDEPLOY_FAILED',
    });
    return {
      provider: 'vercel',
      project_id: projectId,
      project_name: projectName,
      requested_target: input.target || 'preview',
      deployment: deploymentRow(body),
    };
  });

  return Object.freeze([
    'github.actions.workflow.dispatch',
    'cloudflare.deployments.create',
    'vercel.deployments.redeploy',
  ]);
}
