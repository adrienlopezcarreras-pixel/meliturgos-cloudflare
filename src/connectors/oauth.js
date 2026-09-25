import { port } from '../core/contracts.js';
export const methods = ["begin", "callback", "refresh", "revoke", "status", "health"];
/** Provider-neutral OAuth2 port. Tokens/verifiers live only in injected stores; public methods never return token values. */
export const createOauth = adapters => port('connectors/oauth',methods,adapters);

export { createMemoryOAuthCredentialStore, createMemoryOAuthStateStore, createOAuth2ConnectorAdapter } from './oauth-runtime.js';
export { CONNECTOR_OAUTH_PROFILES, oauthProfileForConnector } from './oauth-profiles.js';

export { createEncryptedD1OAuthStores } from './oauth-vault.js';
