import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createConnectorCatalogOAuthHooks,
  createOAuthHttpTokenClient,
} from '../../src/connectors/oauth.js';
import { ConnectorCatalog } from '../../src/connectors/connector-catalog.js';

function responseJson(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}

test('OAuth HTTP exchange posts only to trusted fixed endpoint with PKCE and server-side client secret', async () => {
  const calls = [];
  const client = createOAuthHttpTokenClient({
    resolveClientSecret: async connectorId => {
      assert.equal(connectorId, 'github');
      return 'server-secret';
    },
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return responseJson({
        access_token: 'provider-access',
        refresh_token: 'provider-refresh',
        token_type: 'Bearer',
        scope: 'repo:read',
      });
    },
  });

  const result = await client.exchange({
    owner: 'adrien',
    connector_id: 'github',
    code: 'authorization-code',
    code_verifier: 'pkce-verifier',
    redirect_uri: 'https://mel.example/oauth/github/callback',
    provider: {
      client_id: 'public-client',
      token_endpoint: 'https://github.example/oauth/token',
    },
  }, { owner: 'adrien' });

  assert.equal(result.access_token, 'provider-access');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://github.example/oauth/token');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');

  const form = new URLSearchParams(calls[0].options.body);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('client_id'), 'public-client');
  assert.equal(form.get('client_secret'), 'server-secret');
  assert.equal(form.get('code'), 'authorization-code');
  assert.equal(form.get('code_verifier'), 'pkce-verifier');
  assert.equal(form.get('redirect_uri'), 'https://mel.example/oauth/github/callback');
});

test('OAuth HTTP client rejects untrusted non-HTTPS remote endpoint before fetch', async () => {
  let fetchCalls = 0;
  const client = createOAuthHttpTokenClient({
    fetcher: async () => {
      fetchCalls += 1;
      return responseJson({});
    },
  });

  await assert.rejects(
    () => client.exchange({
      connector_id: 'github',
      code: 'code',
      code_verifier: 'verifier',
      redirect_uri: 'https://mel.example/callback',
      provider: {
        client_id: 'public-client',
        token_endpoint: 'http://attacker.example/token',
      },
    }),
    { code: 'OAUTH_TOKEN_ENDPOINT_INVALID', status: 500 },
  );
  assert.equal(fetchCalls, 0);
});

test('OAuth HTTP failure does not expose upstream response body', async () => {
  const client = createOAuthHttpTokenClient({
    fetcher: async () => responseJson({
      error: 'invalid_grant',
      error_description: 'sensitive provider diagnostic with user data',
    }, 400),
  });

  await assert.rejects(
    () => client.exchange({
      connector_id: 'github',
      code: 'bad-code',
      code_verifier: 'verifier',
      redirect_uri: 'https://mel.example/callback',
      provider: {
        client_id: 'public-client',
        token_endpoint: 'https://github.example/token',
      },
    }),
    error => {
      assert.equal(error?.code, 'OAUTH_TOKEN_EXCHANGE_FAILED');
      assert.equal(String(error).includes('sensitive provider diagnostic'), false);
      return true;
    },
  );
});

test('OAuth HTTP client rejects oversized token response', async () => {
  const large = 'x'.repeat(300_000);
  const client = createOAuthHttpTokenClient({
    fetcher: async () => new Response(JSON.stringify({ access_token: large }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': String(large.length + 30),
      },
    }),
  });

  await assert.rejects(
    () => client.exchange({
      connector_id: 'github',
      code: 'code',
      code_verifier: 'verifier',
      redirect_uri: 'https://mel.example/callback',
      provider: {
        client_id: 'public-client',
        token_endpoint: 'https://github.example/token',
      },
    }),
    { code: 'OAUTH_PROVIDER_RESPONSE_TOO_LARGE', status: 502 },
  );
});

test('OAuth HTTP refresh reuses secure resolver and carries no caller-provided client secret', async () => {
  const calls = [];
  const client = createOAuthHttpTokenClient({
    resolveClientSecret: async () => 'server-secret',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return responseJson({
        access_token: 'refreshed',
        token_type: 'Bearer',
      });
    },
  });

  await client.refresh({
    connector_id: 'github',
    refresh_token: 'refresh-secret',
    client_secret: 'attacker-supplied-secret',
    provider: {
      client_id: 'public-client',
      token_endpoint: 'https://github.example/token',
    },
  });

  const form = new URLSearchParams(calls[0].options.body);
  assert.equal(form.get('grant_type'), 'refresh_token');
  assert.equal(form.get('refresh_token'), 'refresh-secret');
  assert.equal(form.get('client_secret'), 'server-secret');
  assert.notEqual(form.get('client_secret'), 'attacker-supplied-secret');
});

test('OAuth HTTP revoke uses fixed revocation endpoint and prefers refresh token', async () => {
  const calls = [];
  const client = createOAuthHttpTokenClient({
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 204 });
    },
  });

  const result = await client.revoke({
    connector_id: 'github',
    access_token: 'access-secret',
    refresh_token: 'refresh-secret',
    provider: {
      client_id: 'public-client',
      revocation_endpoint: 'https://github.example/oauth/revoke',
    },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].url, 'https://github.example/oauth/revoke');
  const form = new URLSearchParams(calls[0].options.body);
  assert.equal(form.get('token'), 'refresh-secret');
});

const githubManifest = {
  id: 'github',
  name: 'GitHub',
  version: '1.0.0',
  capabilities: ['repo.read'],
  auth: 'oauth2',
  scopes: {
    required: ['repo:read'],
    optional: ['repo:write'],
  },
  metadata: {},
};

test('OAuth catalog hook persists only version/scopes and can disable on revoke', async () => {
  const catalog = new ConnectorCatalog();
  catalog.register(githubManifest);
  const hooks = createConnectorCatalogOAuthHooks({ catalog });

  const authorized = await hooks.onAuthorized({
    owner: 'adrien',
    connector_id: 'github',
    connector_version: '1.0.0',
    granted_scopes: ['repo:write', 'repo:read'],
    status: {
      authorized: true,
      access_token: 'must-be-ignored',
    },
  });

  assert.deepEqual(authorized.granted_scopes, ['repo:read', 'repo:write']);
  assert.equal(catalog.get('github').state, 'installed');
  assert.deepEqual(catalog.get('github').granted_scopes, ['repo:read', 'repo:write']);
  assert.equal(JSON.stringify(catalog.exportSnapshot()).includes('must-be-ignored'), false);

  const revoked = await hooks.onRevoked({ owner: 'adrien', connector_id: 'github' });
  assert.equal(revoked.disabled, true);
  assert.equal(catalog.get('github').state, 'disabled');
});

test('OAuth catalog hook can health-check and enable only a healthy connector', async () => {
  const catalog = new ConnectorCatalog({
    healthProbe: async () => ({
      status: 'healthy',
      code: 'READY',
      latency_ms: 5,
    }),
  });
  catalog.register(githubManifest);
  const hooks = createConnectorCatalogOAuthHooks({
    catalog,
    checkHealthAfterAuthorization: true,
    enableAfterHealthy: true,
  });

  const result = await hooks.onAuthorized({
    connector_id: 'github',
    connector_version: '1.0.0',
    granted_scopes: ['repo:read'],
  });

  assert.equal(result.health, 'healthy');
  assert.equal(result.enabled, true);
  assert.equal(catalog.get('github').state, 'enabled');
});

test('OAuth catalog revoke is safe when connector was never installed', async () => {
  const catalog = new ConnectorCatalog();
  catalog.register(githubManifest);
  const hooks = createConnectorCatalogOAuthHooks({ catalog });

  const result = await hooks.onRevoked({
    connector_id: 'github',
  });

  assert.deepEqual(result, {
    connector_id: 'github',
    disabled: true,
    already_absent: true,
  });
});
