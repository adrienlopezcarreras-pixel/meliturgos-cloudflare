import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import {
  createOAuthVaultCodec,
  D1OAuthTokenVault,
  D1OAuthTransactionVault,
} from '../../src/connectors/d1-oauth-vault.js';
import { createGoogleOAuthRuntime } from '../../src/connectors/google-oauth-runtime.js';

function keyBytes() {
  return Uint8Array.from({ length: 32 }, (_, index) => index + 1);
}

function keyB64() {
  return Buffer.from(keyBytes()).toString('base64');
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('OAuth D1 vault encrypts token material and binds ciphertext to owner + connector', async () => {
  const DB = sqliteD1();
  try {
    const codec = createOAuthVaultCodec({
      keyBytes: keyBytes(),
      keyId: 'oauth-test-key',
      randomBytes: size => new Uint8Array(size).fill(7),
    });
    const vault = new D1OAuthTokenVault(DB, codec, { now: () => 1000 });
    await vault.put({
      owner: 'adrien',
      connector_id: 'gmail',
      token_set: {
        access_token: 'access-secret-value',
        refresh_token: 'refresh-secret-value',
        scopes: ['scope-a'],
        expires_at: 999999,
      },
    });

    const row = await DB.prepare('SELECT envelope_json FROM oauth_tokens WHERE owner=? AND connector_id=?')
      .bind('adrien', 'gmail')
      .first();
    assert.ok(row?.envelope_json);
    assert.equal(row.envelope_json.includes('access-secret-value'), false);
    assert.equal(row.envelope_json.includes('refresh-secret-value'), false);

    const opened = await vault.get({ owner: 'adrien', connector_id: 'gmail' });
    assert.equal(opened.access_token, 'access-secret-value');
    assert.equal(opened.refresh_token, 'refresh-secret-value');

    await assert.rejects(
      () => codec.open(JSON.parse(row.envelope_json), {
        owner: 'someone-else',
        connector_id: 'gmail',
        purpose: 'token',
      }),
      error => error?.code === 'OAUTH_VAULT_DECRYPTION_FAILED',
    );
  } finally {
    DB.close();
  }
});

test('OAuth PKCE transaction lookup resolves connector by state and consumes the state once', async () => {
  const DB = sqliteD1();
  try {
    const codec = createOAuthVaultCodec({
      keyBytes: keyBytes(),
      keyId: 'oauth-test-key',
      randomBytes: size => new Uint8Array(size).fill(9),
    });
    let now = 1000;
    const vault = new D1OAuthTransactionVault(DB, codec, { now: () => now });
    await vault.put({
      owner: 'adrien',
      connector_id: 'gmail',
      state: 'state-123',
      record: {
        owner: 'adrien',
        connector_id: 'gmail',
        state: 'state-123',
        code_verifier: 'verifier-secret',
        expires_at: 10000,
      },
    });

    assert.equal(await vault.resolveConnector({ owner:'adrien', state:'state-123' }), 'gmail');
    const first = await vault.take({ owner:'adrien', connector_id:'gmail', state:'state-123' });
    assert.equal(first.code_verifier, 'verifier-secret');
    assert.equal(await vault.take({ owner:'adrien', connector_id:'gmail', state:'state-123' }), null);
    assert.equal(await vault.resolveConnector({ owner:'adrien', state:'state-123' }), null);

    now = 20000;
    await vault.put({
      owner:'adrien',
      connector_id:'gmail',
      state:'expired-state',
      record:{ owner:'adrien', connector_id:'gmail', state:'expired-state', expires_at:15000 },
    });
    assert.equal(await vault.resolveConnector({ owner:'adrien', state:'expired-state' }), null);
  } finally {
    DB.close();
  }
});

test('Google OAuth runtime performs PKCE callback, stores encrypted token, refreshes and revokes without public token leakage', async () => {
  const DB = sqliteD1();
  try {
    let now = 1_000_000;
    const calls = [];
    const fetcher = async (url, init = {}) => {
      calls.push({ url:String(url), method:init.method, body:String(init.body || '') });
      if (String(url) === 'https://oauth2.googleapis.com/token') {
        const params = new URLSearchParams(String(init.body || ''));
        if (params.get('grant_type') === 'authorization_code') {
          assert.equal(params.get('client_id'), 'google-client-id');
          assert.equal(params.get('client_secret'), 'google-client-secret');
          assert.equal(params.get('code'), 'provider-code');
          assert.ok(params.get('code_verifier'));
          return jsonResponse({
            access_token:'access-one',
            refresh_token:'refresh-one',
            token_type:'Bearer',
            expires_in:60,
            scope:'https://www.googleapis.com/auth/gmail.readonly',
          });
        }
        if (params.get('grant_type') === 'refresh_token') {
          assert.equal(params.get('refresh_token'), 'refresh-one');
          return jsonResponse({
            access_token:'access-two',
            token_type:'Bearer',
            expires_in:3600,
            scope:'https://www.googleapis.com/auth/gmail.readonly',
          });
        }
      }
      if (String(url) === 'https://oauth2.googleapis.com/revoke') {
        const params = new URLSearchParams(String(init.body || ''));
        assert.equal(params.get('token'), 'refresh-one');
        return new Response('', { status:200 });
      }
      throw new Error('UNEXPECTED_FETCH:' + url);
    };

    const env = {
      DB,
      GOOGLE_OAUTH_CLIENT_ID:'google-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET:'google-client-secret',
      GOOGLE_OAUTH_REDIRECT_URI:'https://mel.example/api/gen2/connectors/oauth/callback',
      MEL_OAUTH_TOKEN_KEY_B64:keyB64(),
      MEL_OAUTH_TOKEN_KEY_ID:'oauth-test-key',
    };

    const runtime = createGoogleOAuthRuntime(env, { fetcher, now: () => now });
    const ctx = { owner:'adrien' };

    const begin = await runtime.oauth.begin({ connector_id:'gmail', optional_scopes:[] }, ctx);
    const authorization = new URL(begin.authorization_url);
    assert.equal(authorization.origin, 'https://accounts.google.com');
    assert.equal(authorization.searchParams.get('client_id'), 'google-client-id');
    assert.equal(authorization.searchParams.get('redirect_uri'), env.GOOGLE_OAUTH_REDIRECT_URI);
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorization.searchParams.get('access_type'), 'offline');
    assert.equal(authorization.searchParams.get('prompt'), 'consent');
    assert.equal(authorization.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');

    assert.equal(
      await runtime.transactionVault.resolveConnector({ owner:'adrien', state:authorization.searchParams.get('state') }),
      'gmail',
    );

    const callback = await runtime.oauth.callback({
      connector_id:'gmail',
      state:authorization.searchParams.get('state'),
      code:'provider-code',
    }, ctx);
    assert.equal(callback.authorized, true);
    assert.equal(callback.refreshable, true);
    assert.equal(JSON.stringify(callback).includes('access-one'), false);
    assert.equal(JSON.stringify(callback).includes('refresh-one'), false);

    const stored = await DB.prepare('SELECT envelope_json FROM oauth_tokens WHERE owner=? AND connector_id=?')
      .bind('adrien','gmail')
      .first();
    assert.ok(stored?.envelope_json);
    assert.equal(stored.envelope_json.includes('access-one'), false);
    assert.equal(stored.envelope_json.includes('refresh-one'), false);

    const status = await runtime.status('gmail', ctx);
    assert.equal(status.authorized, true);
    assert.equal(JSON.stringify(status).includes('access-one'), false);

    assert.equal(await runtime.resolveAccessToken('gmail', ctx), 'access-one');

    now += 120_000;
    assert.equal(await runtime.resolveAccessToken('gmail', ctx), 'access-two');

    const revoked = await runtime.oauth.revoke({ connector_id:'gmail' }, ctx);
    assert.equal(revoked.revoked, true);
    assert.equal((await runtime.status('gmail', ctx)).authorized, false);
    assert.equal(await runtime.resolveAccessToken('gmail', ctx), '');

    assert.ok(calls.some(call => call.url === 'https://oauth2.googleapis.com/token'));
    assert.ok(calls.some(call => call.url === 'https://oauth2.googleapis.com/revoke'));
  } finally {
    DB.close();
  }
});
