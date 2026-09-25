import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMemoryOAuthCredentialStore,
  createMemoryOAuthStateStore,
  createOAuth2ConnectorAdapter,
} from '../../src/connectors/oauth.js';
import { oauthProfileForConnector } from '../../src/connectors/oauth-profiles.js';

const env = {
  GOOGLE_OAUTH_CLIENT_ID: 'google-client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://mel.example.test/oauth/callback',
  MICROSOFT_OAUTH_CLIENT_ID: 'ms-client',
  MICROSOFT_OAUTH_CLIENT_SECRET: 'ms-secret',
  MICROSOFT_OAUTH_REDIRECT_URI: 'https://mel.example.test/oauth/callback',
};

const ownerContext = { owner: 'owner-1', requestId: 'oauth-test' };

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('OAuth profiles declare exact read-only scopes for every OAuth connector', () => {
  assert.deepEqual(oauthProfileForConnector('gmail').required_scopes, ['https://www.googleapis.com/auth/gmail.readonly']);
  assert.deepEqual(oauthProfileForConnector('google-drive').required_scopes, ['https://www.googleapis.com/auth/drive.readonly']);
  assert.ok(oauthProfileForConnector('outlook').required_scopes.includes('Mail.Read'));
  assert.ok(oauthProfileForConnector('onedrive').required_scopes.includes('Files.Read'));
  assert.ok(oauthProfileForConnector('sharepoint').required_scopes.includes('Sites.Read.All'));
  assert.equal(oauthProfileForConnector('github'), null);
});

test('OAuth begin uses PKCE S256, one-time state and declared scopes without exposing verifier or client secret', async () => {
  const oauth = createOAuth2ConnectorAdapter({
    env,
    stateStore: createMemoryOAuthStateStore(),
    credentialStore: createMemoryOAuthCredentialStore(),
  });

  const result = await oauth.begin({ connector_id: 'gmail' }, ownerContext);
  const url = new URL(result.authorization_url);

  assert.equal(result.pkce, 'S256');
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), 'google-client');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('state'), result.state);
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
  assert.equal(JSON.stringify(result).includes('google-secret'), false);
  assert.equal(JSON.stringify(result).includes('code_verifier'), false);

  await assert.rejects(
    () => oauth.begin({ connector_id: 'gmail', scopes: ['https://www.googleapis.com/auth/gmail.modify'] }, ownerContext),
    { code: 'OAUTH_SCOPE_UNDECLARED', status: 400 },
  );
});

test('OAuth callback consumes state once, stores tokens privately and returns only public credential metadata', async () => {
  const stateStore = createMemoryOAuthStateStore();
  const credentialStore = createMemoryOAuthCredentialStore();
  const requests = [];
  const oauth = createOAuth2ConnectorAdapter({
    env,
    stateStore,
    credentialStore,
    now: (() => { let value = 1_000; return () => value += 100; })(),
    fetcher: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse({
        access_token: 'access-secret',
        refresh_token: 'refresh-secret',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
      });
    },
  });

  const begun = await oauth.begin({ connector_id: 'gmail' }, ownerContext);
  const connected = await oauth.callback({ state: begun.state, code: 'authorization-code' }, ownerContext);

  assert.equal(connected.status, 'CONNECTED');
  assert.equal(connected.refreshable, true);
  assert.equal(JSON.stringify(connected).includes('access-secret'), false);
  assert.equal(JSON.stringify(connected).includes('refresh-secret'), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token');
  assert.match(String(requests[0].init.body), /code_verifier=/);
  assert.match(String(requests[0].init.body), /client_secret=google-secret/);

  const stored = await credentialStore.getCredentials({ connector_id: 'gmail', owner: 'owner-1' });
  assert.equal(stored.access_token, 'access-secret');
  assert.equal(stored.refresh_token, 'refresh-secret');

  await assert.rejects(
    () => oauth.callback({ state: begun.state, code: 'replay' }, ownerContext),
    { code: 'OAUTH_STATE_INVALID_OR_REPLAYED', status: 409 },
  );
});

test('OAuth callback is bound to owner and rejects missing required granted scopes', async () => {
  const stateStore = createMemoryOAuthStateStore();
  const credentials = createMemoryOAuthCredentialStore();
  const oauth = createOAuth2ConnectorAdapter({
    env,
    stateStore,
    credentialStore: credentials,
    fetcher: async () => jsonResponse({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      scope: 'User.Read offline_access',
    }),
  });

  const begun = await oauth.begin({ connector_id: 'outlook' }, ownerContext);
  await assert.rejects(
    () => oauth.callback({ state: begun.state, code: 'code' }, { owner: 'other-owner' }),
    { code: 'OAUTH_OWNER_MISMATCH', status: 403 },
  );

  const second = await oauth.begin({ connector_id: 'outlook' }, ownerContext);
  await assert.rejects(
    () => oauth.callback({ state: second.state, code: 'code' }, ownerContext),
    { code: 'OAUTH_GRANTED_SCOPE_MISSING', status: 502 },
  );
  assert.equal(await credentials.getCredentials({ connector_id: 'outlook', owner: 'owner-1' }), null);
});

test('OAuth refresh rotates access token while preserving refresh token when provider omits a replacement', async () => {
  const stateStore = createMemoryOAuthStateStore();
  const credentials = createMemoryOAuthCredentialStore();
  let phase = 'callback';
  const oauth = createOAuth2ConnectorAdapter({
    env,
    stateStore,
    credentialStore: credentials,
    now: (() => { let value = 10_000; return () => value += 1_000; })(),
    fetcher: async () => phase === 'callback'
      ? jsonResponse({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 60,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        })
      : jsonResponse({
          access_token: 'access-2',
          expires_in: 120,
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        }),
  });

  const begun = await oauth.begin({ connector_id: 'google-drive' }, ownerContext);
  await oauth.callback({ state: begun.state, code: 'code' }, ownerContext);
  phase = 'refresh';
  const refreshed = await oauth.refresh({ connector_id: 'google-drive' }, ownerContext);

  assert.equal(refreshed.status, 'CONNECTED');
  const stored = await credentials.getCredentials({ connector_id: 'google-drive', owner: 'owner-1' });
  assert.equal(stored.access_token, 'access-2');
  assert.equal(stored.refresh_token, 'refresh-1');
});

test('OAuth health uses only the fixed connector probe and never accepts a client-supplied URL', async () => {
  const stateStore = createMemoryOAuthStateStore();
  const credentials = createMemoryOAuthCredentialStore();
  const urls = [];
  let tokenPhase = true;
  const oauth = createOAuth2ConnectorAdapter({
    env,
    stateStore,
    credentialStore: credentials,
    now: () => 1000,
    fetcher: async (url) => {
      urls.push(url);
      if (tokenPhase) {
        return jsonResponse({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/contacts.readonly',
        });
      }
      return new Response('{}', { status: 200 });
    },
  });

  const begun = await oauth.begin({ connector_id: 'google-contacts' }, ownerContext);
  await oauth.callback({ state: begun.state, code: 'code' }, ownerContext);
  tokenPhase = false;

  const health = await oauth.health({
    connector_id: 'google-contacts',
    probe: 'https://evil.example.test/steal',
  }, ownerContext);

  assert.equal(health.status, 'CONNECTED');
  assert.equal(urls.at(-1), 'https://people.googleapis.com/v1/people/me?personFields=names');
  assert.equal(JSON.stringify(health).includes('access'), false);
});

test('OAuth revoke deletes local credentials and reports remote revocation honestly', async () => {
  const stateStore = createMemoryOAuthStateStore();
  const credentials = createMemoryOAuthCredentialStore();
  let phase = 'token';
  const oauth = createOAuth2ConnectorAdapter({
    env,
    stateStore,
    credentialStore: credentials,
    fetcher: async (url) => {
      if (phase === 'token') {
        return jsonResponse({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        });
      }
      assert.equal(url, 'https://oauth2.googleapis.com/revoke');
      return new Response('', { status: 200 });
    },
  });

  const begun = await oauth.begin({ connector_id: 'gmail' }, ownerContext);
  await oauth.callback({ state: begun.state, code: 'code' }, ownerContext);
  phase = 'revoke';
  const revoked = await oauth.revoke({ connector_id: 'gmail' }, ownerContext);

  assert.equal(revoked.status, 'AUTH_REQUIRED');
  assert.equal(revoked.local_deleted, true);
  assert.equal(revoked.remote_revoked, true);
  assert.equal((await oauth.status({ connector_id: 'gmail' }, ownerContext)).configured, false);
});
