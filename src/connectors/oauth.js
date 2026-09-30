import { port } from '../core/contracts.js';
import { createOAuth2PkceAdapters, OAuth2PkceRuntime } from './oauth2-pkce-runtime.js';
import { createOAuthHttpTokenClient } from './oauth2-http-token-client.js';
import { createConnectorCatalogOAuthHooks } from './oauth-catalog-hooks.js';

export const methods = ["begin", "callback", "refresh", "revoke"];

/**
 * Stable OAuth port. When no adapters are injected it remains fail-closed.
 * Use createOAuth2() for the generic Authorization Code + PKCE runtime.
 */
export const createOauth = adapters => port('connectors/oauth', methods, adapters);

export function createOAuth2(options = {}) {
  return createOauth(createOAuth2PkceAdapters(options));
}

export {
  OAuth2PkceRuntime,
  createOAuth2PkceAdapters,
  createOAuthHttpTokenClient,
  createConnectorCatalogOAuthHooks,
};
