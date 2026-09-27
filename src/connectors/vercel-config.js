import { createD1OAuthVaults } from './d1-oauth-vault.js';

const CONNECTOR_ID = 'vercel-platform';

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function owner(env = {}) {
  return clean(env.MELITURGOS_USER || 'owner', 200) || 'owner';
}

function fromEnv(env = {}) {
  return {
    token: clean(env.VERCEL_TOKEN, 4000),
    team_id: clean(env.VERCEL_TEAM_ID, 200),
    project_id: clean(env.MEL_VERCEL_PROJECT_ID, 200),
    project_name: clean(env.MEL_VERCEL_PROJECT_NAME, 200),
    source: 'env',
  };
}

export function createVercelConfigResolver(env = {}) {
  return async function resolveVercelConfig(contextOwner = owner(env)) {
    const direct = fromEnv(env);
    if (direct.token && direct.project_id && direct.project_name) return direct;

    try {
      const vaults = createD1OAuthVaults(env);
      const stored = await vaults.tokenVault.get({
        owner: clean(contextOwner, 200) || owner(env),
        connector_id: CONNECTOR_ID,
      });
      return {
        token: direct.token || clean(stored?.token, 4000),
        team_id: direct.team_id || clean(stored?.team_id, 200),
        project_id: direct.project_id || clean(stored?.project_id, 200),
        project_name: direct.project_name || clean(stored?.project_name, 200),
        source: direct.token || direct.project_id || direct.project_name ? 'env+vault' : 'vault',
      };
    } catch {
      return direct;
    }
  };
}

export async function saveVercelConnectionConfig(env = {}, config = {}, contextOwner = owner(env)) {
  const token = clean(config.token, 4000);
  const teamId = clean(config.team_id, 200);
  const projectId = clean(config.project_id, 200);
  const projectName = clean(config.project_name, 200);
  if (!token) {
    const error = new Error('VERCEL_TOKEN_REQUIRED');
    error.code = 'VERCEL_TOKEN_REQUIRED';
    error.status = 400;
    throw error;
  }
  const vaults = createD1OAuthVaults(env);
  await vaults.tokenVault.put({
    owner: clean(contextOwner, 200) || owner(env),
    connector_id: CONNECTOR_ID,
    token_set: {
      kind: 'vercel-platform-credentials',
      token,
      team_id: teamId,
      project_id: projectId,
      project_name: projectName,
      updated_at: Date.now(),
    },
  });
  return { token_present: true, team_id: teamId, project_id: projectId, project_name: projectName, stored_securely: true };
}
