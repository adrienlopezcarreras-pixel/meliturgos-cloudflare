import test from 'node:test';
import assert from 'node:assert/strict';

import { CapabilityBus } from '../../src/capabilities/capability-bus.js';
import {
  CONNECTOR_OAUTH_PERMISSION,
  registerConnectorOAuthCapabilities,
} from '../../src/capabilities/connector-oauth-capabilities.js';
import { createOAuth2ConnectorAdapter } from '../../src/connectors/oauth-runtime.js';
import { createEncryptedD1OAuthStores } from '../../src/connectors/oauth-vault.js';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';

const key = '11'.repeat(32);
const env = {
  GOOGLE_OAUTH_CLIENT_ID: 'google-client',
  GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://mel.example.test/oauth/callback',
};

const context = { owner: 'owner-1', requestId: 'oauth-vault' };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('encrypted D1 OAuth vault never persists verifier or token plaintext', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const stores = createEncryptedD1OAuthStores(db, { key, now: () => 1_000 });
  let phase = 'token';
  const oauth = createOAuth2ConnectorAdapter({
    env,
    ...stores,
    now: () => 1_000,
    fetcher: async () => phase === 'token'
      ? jsonResponse({
          access_token: 'access-secret-value',
          refresh_token: 'refresh-secret-value',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/gmail.readonly',
        })
      : new Response('', { status: 200 }),
  });

  const begun = await oauth.begin({ connector_id: 'gmail' }, context);
  const sessionRows = (await db.prepare('SELECT * FROM connector_oauth_vault WHERE kind=?').bind('session').all()).results;
  assert.equal(sessionRows.length, 1);
  assert.equal(JSON.stringify(sessionRows).includes('code_verifier'), false);
  assert.equal(JSON.stringify(sessionRows).includes('google-secret'), false);

  await oauth.callback({ state: begun.state, code: 'code' }, context);
  const credentialRows = (await db.prepare('SELECT * FROM connector_oauth_vault WHERE kind=?').bind('credential').all()).results;
  assert.equal(credentialRows.length, 1);
  assert.equal(JSON.stringify(credentialRows).includes('access-secret-value'), false);
  assert.equal(JSON.stringify(credentialRows).includes('refresh-secret-value'), false);

  const stored = await stores.credentialStore.getCredentials({ connector_id: 'gmail', owner: 'owner-1' });
  assert.equal(stored.access_token, 'access-secret-value');
  assert.equal(stored.refresh_token, 'refresh-secret-value');

  phase = 'health';
  assert.equal((await oauth.health({ connector_id: 'gmail' }, context)).status, 'CONNECTED');
});

test('OAuth state consumption is one-shot in D1 even though encrypted row data is recoverable before claim', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const stores = createEncryptedD1OAuthStores(db, { key });
  await stores.stateStore.putSession('state-1', { connector_id: 'gmail', owner: 'owner', code_verifier: 'secret' });

  const first = await stores.stateStore.consumeSession('state-1');
  const second = await stores.stateStore.consumeSession('state-1');
  assert.equal(first.code_verifier, 'secret');
  assert.equal(second, null);
});

test('wrong OAuth vault key fails closed instead of returning corrupt credentials', async (t) => {
  const db = sqliteD1();
  t.after(() => db.close());
  const first = createEncryptedD1OAuthStores(db, { key });
  await first.credentialStore.putCredentials(
    { connector_id: 'gmail', owner: 'owner' },
    { access_token: 'secret', scopes: ['scope'] },
  );

  const wrong = createEncryptedD1OAuthStores(db, { key: '22'.repeat(32) });
  await assert.rejects(
    () => wrong.credentialStore.getCredentials({ connector_id: 'gmail', owner: 'owner' }),
    { code: 'OAUTH_VAULT_DECRYPT_FAILED', status: 500 },
  );
});

test('OAuth runtime capabilities are unavailable without a secure configured runtime', async () => {
  const bus = new CapabilityBus();
  registerConnectorOAuthCapabilities(bus, {});
  assert.equal(bus.describe('connectors.oauth.status').health, 'UNAVAILABLE');

  await assert.rejects(
    () => bus.execute('connectors.oauth.status', { connector_id: 'gmail' }, {
      owner: 'owner',
      permissions: [CONNECTOR_OAUTH_PERMISSION],
      requestId: 'unavailable',
    }),
    { code: 'CAPABILITY_UNAVAILABLE', status: 503 },
  );
});

test('OAuth begin and revoke require explicit CapabilityBus approval while status/health stay read-only', async () => {
  const calls = [];
  const runtime = {
    async begin(input) { calls.push(['begin', input]); return { connector_id: input.connector_id, authorization_url: 'https://auth.example' }; },
    async refresh(input) { calls.push(['refresh', input]); return { connector_id: input.connector_id, status: 'CONNECTED' }; },
    async revoke(input) { calls.push(['revoke', input]); return { connector_id: input.connector_id, status: 'AUTH_REQUIRED' }; },
    async status(input) { calls.push(['status', input]); return { connector_id: input.connector_id, status: 'CONNECTED' }; },
    async health(input) { calls.push(['health', input]); return { connector_id: input.connector_id, status: 'CONNECTED' }; },
  };
  const bus = new CapabilityBus();
  registerConnectorOAuthCapabilities(bus, { MEL_CONNECTOR_OAUTH_RUNTIME: runtime });
  const base = { owner: 'owner', permissions: [CONNECTOR_OAUTH_PERMISSION], requestId: 'oauth-capability' };

  await assert.rejects(
    () => bus.execute('connectors.oauth.begin', { connector_id: 'gmail' }, base),
    { code: 'EXPLICIT_APPROVAL_REQUIRED', status: 409 },
  );
  assert.equal(calls.length, 0);

  await bus.execute('connectors.oauth.begin', { connector_id: 'gmail' }, {
    ...base,
    approvedCapabilities: ['connectors.oauth.begin'],
  });
  await bus.execute('connectors.oauth.status', { connector_id: 'gmail' }, base);
  await bus.execute('connectors.oauth.health', { connector_id: 'gmail' }, base);
  await bus.execute('connectors.oauth.refresh', { connector_id: 'gmail' }, base);

  await assert.rejects(
    () => bus.execute('connectors.oauth.revoke', { connector_id: 'gmail' }, base),
    { code: 'EXPLICIT_APPROVAL_REQUIRED', status: 409 },
  );
  await bus.execute('connectors.oauth.revoke', { connector_id: 'gmail' }, {
    ...base,
    approvedCapabilities: ['connectors.oauth.revoke'],
  });

  assert.deepEqual(calls.map(([name]) => name), ['begin', 'status', 'health', 'refresh', 'revoke']);
});
