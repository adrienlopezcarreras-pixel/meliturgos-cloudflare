/**
 * Jira OAuth Configuration
 * GEN2-14: Connecteur Jira avec flux OAuth 2.0
 * Référence: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3rd-party-flows/
 */

export const JIRA_OAUTH_CONFIG = {
  enabled: false,
  requiredParams: ['clientId', 'clientSecret', 'redirectUri'],
  
  // Configuration OAuth Server
  authorizationUrl: 'https://auth.atlassian.com/oauth/authorize',
  tokenUrl: 'https://auth.atlassian.com/oauth/token',
  
  // Scopes Jira
  scopes: [
    'read:jira-work',
    'write:jira-work',
    'manage:jira-project'
  ],
  
  // Callback endpoint
  callbackPath: '/auth/jira/callback',
  
  // Metadata
  type: 'connector',
  name: 'Jira OAuth Connector',
  risk_level: 'MEDIUM',
  
  // Feature flags
  usePkce: true,  // Proof Key for Code Exchange (recommandé)
  httpMethod: 'POST',
  endpoint: '/api/connectors/jira'
};

/**
 * GitHub OAuth Configuration
 * GEN2-14: Connecteur GitHub avec flux OAuth 2.0
 * Référence: https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps
 */

export const GITHUB_OAUTH_CONFIG = {
  enabled: false,
  requiredParams: ['clientId', 'clientSecret', 'redirectUri'],
  
  // Configuration OAuth Server
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  
  // Scopes GitHub
  scopes: ['repo', 'write:repo_hook', 'user:email'],
  
  // Callback endpoint
  callbackPath: '/auth/github/callback',
  
  // Metadata
  type: 'connector',
  name: 'GitHub OAuth Connector',
  risk_level: 'MEDIUM',
  
  // Feature flags
  usePkce: true,
  httpMethod: 'POST',
  endpoint: '/api/connectors/github'
};

/**
 * Connector Registry (fusion des configs OAuth)
 */
export const CONNECTOR_OAUTH_REGISTRY = {
  jira: JIRA_OAUTH_CONFIG,
  github: GITHUB_OAUTH_CONFIG,
  
  // Legacy connectors (non-OAuth)
  gmail: {
    enabled: false,
    endpoint: '/api/connectors/gmail',
    permissions: ['email'],
    risk_level: 'NEUTRAL'
  },
  slack: {
    enabled: false,
    endpoint: '/api/connectors/slack',
    permissions: ['chat:write', 'channels:history'],
    risk_level: 'MEDIUM'
  },
  discord: {
    enabled: false,
    endpoint: '/api/connectors/discord',
    permissions: ['email'],
    risk_level: 'NEUTRAL'
  },
  notion: {
    enabled: false,
    endpoint: '/api/connectors/notion',
    permissions: ['data'],
    risk_level: 'NEUTRAL'
  },
  linear: {
    enabled: false,
    endpoint: '/api/connectors/linear',
    permissions: ['read'],
    risk_level: 'NEUTRAL'
  },
  trello: {
    enabled: false,
    endpoint: '/api/connectors/trello',
    permissions: ['data'],
    risk_level: 'LOW'
  }
};

/**
 * OAuth Flow Helper Functions
 */
export class OAuthFlow {
  /**
   * Generate OAuth authorization URL
   * @param {string} provider - 'jira' ou 'github'
   * @param {string} clientId - OAuth Client ID
   * @param {object} options - Additional options
   */
  static getAuthorizationUrl(provider, clientId, options = {}) {
    const config = CONNECTOR_OAUTH_REGISTRY[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: options.redirectUri || '/auth/callback',
      scope: options.scopes || config.scopes.join(' '),
      state: crypto.randomUUID(),  // CSRF protection
    });

    if (config.usePkce) {
      params.append('code_challenge', crypto.randomUUID());
      params.append('code_challenge_method', 'S256');
    }

    return `${config.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   * @param {string} provider - 'jira' ou 'github'
   * @param {string} code - Authorization code
   * @param {string} clientId - OAuth Client ID
   * @param {string} clientSecret - OAuth Client Secret
   * @param {string} redirectUri - Callback URI
   */
  static async exchangeCode(provider, code, clientId, clientSecret, redirectUri) {
    const config = CONNECTOR_OAUTH_REGISTRY[provider];
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: code,
        ...(config.usePkce && {
          code_verifier: crypto.randomUUID(), // À générer côté client
        }),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OAuth token exchange failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Refresh access token (if supported)
   * @param {string} refreshToken
   */
  static async refreshAccessToken(refreshToken) {
    throw new Error('Refresh token not implemented for this provider');
  }
}