import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createGoogleOAuthRuntime } from '../../src/connectors/google-oauth-runtime.js';
import { maybeHandleGoogleOAuthApi } from '../../src/api/google-oauth-api.js';

class TransactionVault {
  constructor() { this.rows = new Map(); }
  key(owner, connector, state) { return owner + '::' + connector + '::' + state; }
  async put({ owner, connector_id, state, record }) {
    this.rows.set(this.key(owner, connector_id, state), structuredClone(record));
  }
  async take({ owner, connector_id, state }) {
    const key = this.key(owner, connector_id, state);
    const row = this.rows.get(key);
    if (!row) return null;
    this.rows.delete(key);
    return structuredClone(row);
  }
}

class TokenVault {
  constructor() { this.rows = new Map(); }
  key(owner, connector) { return owner + '::' + connector; }
  async put({ owner, connector_id, token_set }) {
    this.rows.set(this.key(owner, connector_id), structuredClone(token_set));
  }
  async get({ owner, connector_id }) {
    const row = this.rows.get(this.key(owner, connector_id));
    return row ? structuredClone(row) : null;
  }
  async delete({ owner, connector_id }) {
    return this.rows.delete(this.key(owner, connector_id));
  }
}

function memoryVaults() {
  const transactionVault = new TransactionVault();
  const tokenVault = new TokenVault();
  return {
    transactionVault,
    tokenVault,
    accessTokenResolver() {
      return async (connectorId, context = {}) => {
        const row = await tokenVault.get({ owner: context.owner, connector_id: connectorId });
        return row?.access_token || '';
      };
    },
  };
}

function env() {
  return {
    MELITURGOS_USER: 'adrien',
    GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
    MEL_PUBLIC_ORIGIN: 'https://mel.example',
  };
}

function fixture() {
  const calls = [];
  const vaults = memoryVaults();
  const fetcher = async (url, init = {}) => {
    const href = String(url);
    calls.push({ url: href, init });
    if (href === 'https://oauth2.googleapis.com/token') {
      const form = new URLSearchParams(String(init.body || ''));
      if (form.get('grant_type') === 'authorization_code') {
        return Response.json({
          access_token: 'access-secret-1',
          refresh_token: 'refresh-secret-1',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.send',
          ].join(' '),
        });
      }
      if (form.get('grant_type') === 'refresh_token') {
        return Response.json({
          access_token: 'access-secret-2',
          token_type: 'Bearer',
          expires_in: 7200,
          scope: [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.send',
          ].join(' '),
        });
      }
    }
    if (href === 'https://oauth2.googleapis.com/revoke') {
      return new Response('', { status: 200 });
    }
    throw new Error('UNEXPECTED_FETCH:' + href);
  };
  const runtime = createGoogleOAuthRuntime({ env: env(), fetcher, vaults });
  return { runtime, calls, vaults, fetcher };
}

test('Google OAuth begin uses fixed Google endpoints, PKCE and exact connector callback', async () => {
  const { runtime } = fixture();
  const result = await runtime.oauth.begin({
    connector_id: 'gmail',
    optional_scopes: [
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
    ],
  }, { owner: 'adrien' });

  const url = new URL(result.authorization_url);
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.pathname, '/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('client_id'), 'google-client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://mel.example/api/gen2/oauth/google/gmail/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('include_granted_scopes'), 'true');
  assert.deepEqual(result.scopes, [
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
  ]);
});

test('Google OAuth callback stores tokens in vault but returns only safe status', async () => {
  const { runtime, vaults } = fixture();
  const begun = await runtime.oauth.begin({
    connector_id: 'gmail',
    optional_scopes: [
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
    ],
  }, { owner: 'adrien' });
  const state = new URL(begun.authorization_url).searchParams.get('state');

  const result = await runtime.oauth.callback({
    connector_id: 'gmail',
    state,
    code: 'provider-code',
  }, { owner: 'adrien' });

  assert.equal(result.authorized, true);
  assert.equal(result.refreshable, true);
  assert.equal(JSON.stringify(result).includes('access-secret'), false);
  assert.equal(JSON.stringify(result).includes('refresh-secret'), false);

  const stored = await vaults.tokenVault.get({ owner: 'adrien', connector_id: 'gmail' });
  assert.equal(stored.access_token, 'access-secret-1');
  assert.equal(stored.refresh_token, 'refresh-secret-1');

  const status = await runtime.status('gmail', { owner: 'adrien' });
  assert.equal(status.authorized, true);
  assert.equal(status.refreshable, true);
  assert.equal(JSON.stringify(status).includes('access-secret'), false);
  assert.equal(JSON.stringify(status).includes('refresh-secret'), false);
});

test('Google access-token resolver automatically refreshes an expiring token', async () => {
  const { runtime, vaults, calls } = fixture();
  await vaults.tokenVault.put({
    owner: 'adrien',
    connector_id: 'gmail',
    token_set: {
      access_token: 'old-access',
      refresh_token: 'refresh-secret-1',
      token_type: 'Bearer',
      scopes: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/gmail.send',
      ],
      expires_at: Date.now() - 1,
    },
  });

  const resolved = await runtime.accessTokenResolver('gmail', { owner: 'adrien' });
  assert.equal(resolved, 'access-secret-2');
  assert.equal(calls.some(call => {
    if (call.url !== 'https://oauth2.googleapis.com/token') return false;
    return new URLSearchParams(String(call.init.body || '')).get('grant_type') === 'refresh_token';
  }), true);
});

test('Google OAuth API full-access begin requests declared optional scopes and never accepts arbitrary connector', async () => {
  const f = fixture();
  const request = new Request('https://mel.example/api/gen2/oauth/google/google-calendar/begin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ full_access: true }),
  });
  const response = await maybeHandleGoogleOAuthApi(request, env(), new URL(request.url), { runtime: f.runtime });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.scopes, [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.events.readonly',
  ]);

  const bad = new Request('https://mel.example/api/gen2/oauth/google/evil/begin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const denied = await maybeHandleGoogleOAuthApi(bad, env(), new URL(bad.url), { runtime: f.runtime });
  assert.equal(denied.status, 404);
  assert.equal((await denied.json()).code, 'GOOGLE_OAUTH_CONNECTOR_UNSUPPORTED');
});

test('OAuth revoke API requires exact explicit approval and never leaks token material', async () => {
  const f = fixture();
  await f.vaults.tokenVault.put({
    owner: 'adrien',
    connector_id: 'gmail',
    token_set: {
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      token_type: 'Bearer',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      expires_at: Date.now() + 100000,
    },
  });

  const deniedReq = new Request('https://mel.example/api/gen2/oauth/google/gmail/revoke', { method: 'POST' });
  const denied = await maybeHandleGoogleOAuthApi(deniedReq, env(), new URL(deniedReq.url), { runtime: f.runtime });
  assert.equal(denied.status, 409);
  assert.equal((await denied.json()).code, 'EXPLICIT_APPROVAL_REQUIRED');

  const approvedReq = new Request('https://mel.example/api/gen2/oauth/google/gmail/revoke', {
    method: 'POST',
    headers: { 'x-mel-approve-capability': 'oauth.google.gmail.revoke' },
  });
  const approved = await maybeHandleGoogleOAuthApi(approvedReq, env(), new URL(approvedReq.url), { runtime: f.runtime });
  assert.equal(approved.status, 200);
  const body = await approved.json();
  assert.equal(body.ok, true);
  assert.equal(body.revoked, true);
  assert.equal(JSON.stringify(body).includes('access-secret'), false);
  assert.equal(JSON.stringify(body).includes('refresh-secret'), false);
  assert.equal(await f.vaults.tokenVault.get({ owner: 'adrien', connector_id: 'gmail' }), null);
});

test('router propagates request-scoped capability approvals into CapabilityBus context', async () => {
  const source = await readFile(new URL('../../src/router.js', import.meta.url), 'utf8');
  assert.match(source, /approvedCapabilitiesFromRequest\(request\)/);
  assert.match(source, /capabilityContext\(env, request\)/);
  assert.match(source, /maybeHandleGoogleOAuthApi\(request, env, url\)/);
});
