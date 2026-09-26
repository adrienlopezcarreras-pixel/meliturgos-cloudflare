import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { createGoogleOAuthRuntime } from '../../src/connectors/google-oauth-runtime.js';

function keyB64() {
  return Buffer.from(Uint8Array.from({ length:32 }, (_,i)=>i+1)).toString('base64');
}

function jsonResponse(body, status=200) {
  return new Response(JSON.stringify(body), {
    status,
    headers:{ 'content-type':'application/json' },
  });
}

test('Google OAuth runtime persists encrypted PKCE tokens, refreshes and revokes without token leakage', async () => {
  const DB=sqliteD1();
  try {
    const calls=[];
    const fetcher=async (url, init={}) => {
      const href=String(url);
      const params=new URLSearchParams(String(init.body || ''));
      calls.push({ href, grant:params.get('grant_type') || null });

      if (href === 'https://oauth2.googleapis.com/token') {
        if (params.get('grant_type') === 'authorization_code') {
          assert.equal(params.get('client_id'),'google-client-id');
          assert.equal(params.get('client_secret'),'google-client-secret');
          assert.equal(params.get('code'),'provider-code');
          assert.ok(params.get('code_verifier'));
          return jsonResponse({
            access_token:'access-one',
            refresh_token:'refresh-one',
            token_type:'Bearer',
            expires_in:3600,
            scope:'https://www.googleapis.com/auth/gmail.readonly',
          });
        }
        if (params.get('grant_type') === 'refresh_token') {
          assert.equal(params.get('refresh_token'),'refresh-one');
          return jsonResponse({
            access_token:'access-two',
            token_type:'Bearer',
            expires_in:3600,
            scope:'https://www.googleapis.com/auth/gmail.readonly',
          });
        }
      }

      if (href === 'https://oauth2.googleapis.com/revoke') {
        assert.equal(params.get('token'),'refresh-one');
        return new Response('',{status:200});
      }

      throw new Error('UNEXPECTED_FETCH:'+href);
    };

    const env={
      DB,
      GOOGLE_OAUTH_CLIENT_ID:'google-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET:'google-client-secret',
      MEL_PUBLIC_ORIGIN:'https://mel.example',
      MEL_OAUTH_ENCRYPTION_KEY_ID:'oauth-test-key',
      MEL_OAUTH_ENCRYPTION_KEY_B64:keyB64(),
    };
    const runtime=createGoogleOAuthRuntime({ env, fetcher });
    const ctx={ owner:'adrien' };

    const begin=await runtime.oauth.begin({connector_id:'gmail',optional_scopes:[]},ctx);
    const authorization=new URL(begin.authorization_url);
    assert.equal(authorization.origin,'https://accounts.google.com');
    assert.equal(authorization.searchParams.get('client_id'),'google-client-id');
    assert.equal(
      authorization.searchParams.get('redirect_uri'),
      'https://mel.example/api/gen2/oauth/google/gmail/callback',
    );
    assert.equal(authorization.searchParams.get('code_challenge_method'),'S256');
    assert.ok(authorization.searchParams.get('state'));
    assert.ok(authorization.searchParams.get('code_challenge'));

    const callback=await runtime.oauth.callback({
      connector_id:'gmail',
      state:authorization.searchParams.get('state'),
      code:'provider-code',
    },ctx);
    assert.equal(callback.authorized,true);
    assert.equal(callback.refreshable,true);
    assert.equal(JSON.stringify(callback).includes('access-one'),false);
    assert.equal(JSON.stringify(callback).includes('refresh-one'),false);

    const row=await DB.prepare(
      'SELECT envelope_json FROM mel_oauth_tokens WHERE owner=? AND connector_id=?'
    ).bind('adrien','gmail').first();
    assert.ok(row?.envelope_json);
    assert.equal(row.envelope_json.includes('access-one'),false);
    assert.equal(row.envelope_json.includes('refresh-one'),false);

    const status=await runtime.status('gmail',ctx);
    assert.equal(status.authorized,true);
    assert.equal(JSON.stringify(status).includes('access-one'),false);
    assert.equal(await runtime.accessTokenResolver('gmail',ctx),'access-one');

    await assert.rejects(
      () => runtime.oauth.callback({
        connector_id:'gmail',
        state:authorization.searchParams.get('state'),
        code:'replayed-code',
      },ctx),
      error => String(error?.code || error?.message).includes('OAUTH_STATE_INVALID_OR_REPLAYED'),
    );

    const refreshed=await runtime.oauth.refresh({connector_id:'gmail'},ctx);
    assert.equal(refreshed.authorized,true);
    assert.equal(await runtime.accessTokenResolver('gmail',ctx),'access-two');

    const revoked=await runtime.oauth.revoke({connector_id:'gmail'},ctx);
    assert.equal(revoked.revoked,true);
    assert.equal((await runtime.status('gmail',ctx)).authorized,false);
    assert.equal(await runtime.accessTokenResolver('gmail',ctx),'');

    assert.ok(calls.some(call=>call.href==='https://oauth2.googleapis.com/token' && call.grant==='authorization_code'));
    assert.ok(calls.some(call=>call.href==='https://oauth2.googleapis.com/token' && call.grant==='refresh_token'));
    assert.ok(calls.some(call=>call.href==='https://oauth2.googleapis.com/revoke'));
  } finally {
    DB.close();
  }
});
