import { DomainError } from '../core/contracts.js';
import { createOAuth2ConnectorAdapter } from '../connectors/oauth-runtime.js';
import { createEncryptedD1OAuthStores } from '../connectors/oauth-vault.js';

export const CONNECTOR_OAUTH_PERMISSION = 'connectors:manage';

const objectSchema = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

function configuredRuntime(env = {}) {
  if (env.MEL_CONNECTOR_OAUTH_RUNTIME) return env.MEL_CONNECTOR_OAUTH_RUNTIME;
  if (!env.DB || typeof env.DB.prepare !== 'function') return null;
  if (!env.MEL_CONNECTOR_VAULT_KEY) return null;
  const stores = createEncryptedD1OAuthStores(env.DB, { key: env.MEL_CONNECTOR_VAULT_KEY });
  return createOAuth2ConnectorAdapter({
    env,
    stateStore: stores.stateStore,
    credentialStore: stores.credentialStore,
    fetcher: typeof env.MEL_CONNECTOR_OAUTH_FETCHER === 'function'
      ? env.MEL_CONNECTOR_OAUTH_FETCHER
      : fetch,
  });
}

function requireRuntime(runtime) {
  if (!runtime) throw new DomainError('CONNECTOR_OAUTH_RUNTIME_UNAVAILABLE', 503);
  return runtime;
}

export function registerConnectorOAuthCapabilities(bus, env = {}) {
  const runtime = configuredRuntime(env);
  const health = runtime ? 'HEALTHY' : 'UNAVAILABLE';

  bus.discover({
    id: 'connectors.oauth.status',
    name: 'État OAuth connecteur',
    category: 'connectors',
    version: '1.0.0',
    provider: 'core',
    description: 'Expose uniquement les métadonnées publiques du grant OAuth, jamais les tokens.',
    input_schema: objectSchema({
      connector_id: { type: 'string', minLength: 1, maxLength: 120 },
    }, ['connector_id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [CONNECTOR_OAUTH_PERMISSION],
    health,
    enabled: true,
  }, (input, context) => requireRuntime(runtime).status(input, context));

  bus.discover({
    id: 'connectors.oauth.begin',
    name: 'Démarrer OAuth connecteur',
    category: 'connectors',
    version: '1.0.0',
    provider: 'core',
    description: 'Crée un state one-shot et une URL OAuth PKCE avec scopes déclarés.',
    input_schema: objectSchema({
      connector_id: { type: 'string', minLength: 1, maxLength: 120 },
      scopes: { type: 'array', maxItems: 32, items: { type: 'string', minLength: 1, maxLength: 500 } },
    }, ['connector_id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [CONNECTOR_OAUTH_PERMISSION],
    approval: {
      required: true,
      scope: 'connectors.oauth.begin',
      reason: 'Starting an external OAuth grant is a user-authorized connection change.',
    },
    health,
    enabled: true,
  }, (input, context) => requireRuntime(runtime).begin(input, context));

  bus.discover({
    id: 'connectors.oauth.refresh',
    name: 'Rafraîchir OAuth connecteur',
    category: 'connectors',
    version: '1.0.0',
    provider: 'core',
    description: 'Rafraîchit un grant existant sans élargir les scopes.',
    input_schema: objectSchema({
      connector_id: { type: 'string', minLength: 1, maxLength: 120 },
    }, ['connector_id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'MEDIUM',
    permissions: [CONNECTOR_OAUTH_PERMISSION],
    health,
    enabled: true,
  }, (input, context) => requireRuntime(runtime).refresh(input, context));

  bus.discover({
    id: 'connectors.oauth.revoke',
    name: 'Révoquer OAuth connecteur',
    category: 'connectors',
    version: '1.0.0',
    provider: 'core',
    description: 'Révoque si possible côté provider puis supprime toujours le grant local du coffre.',
    input_schema: objectSchema({
      connector_id: { type: 'string', minLength: 1, maxLength: 120 },
    }, ['connector_id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'HIGH',
    permissions: [CONNECTOR_OAUTH_PERMISSION],
    approval: {
      required: true,
      scope: 'connectors.oauth.revoke',
      reason: 'Revoking a connector grant disconnects an external provider.',
    },
    health,
    enabled: true,
  }, (input, context) => requireRuntime(runtime).revoke(input, context));

  bus.discover({
    id: 'connectors.oauth.health',
    name: 'Santé OAuth connecteur',
    category: 'connectors',
    version: '1.0.0',
    provider: 'core',
    description: 'Teste le probe fixe du connecteur avec le token du coffre sans jamais l’exposer.',
    input_schema: objectSchema({
      connector_id: { type: 'string', minLength: 1, maxLength: 120 },
    }, ['connector_id']),
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [CONNECTOR_OAUTH_PERMISSION],
    health,
    enabled: true,
  }, (input, context) => requireRuntime(runtime).health(input, context));

  return runtime;
}
