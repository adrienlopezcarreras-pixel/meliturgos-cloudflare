import test from 'node:test';
import assert from 'node:assert/strict';

import { OAuth2PkceRuntime } from '../../src/connectors/oauth2-pkce-runtime.js';
import { createMailOAuthRuntime } from '../../src/connectors/mail-oauth-runtime.js';
import { maybeHandleMailOAuthApi } from '../../src/api/mail-oauth-api.js';
import { definition as genericMail } from '../../src/connectors/generic-imap-smtp.js';

class TransactionVault {
  constructor(){ this.rows=new Map(); }
  key(o,c,s){ return o+'::'+c+'::'+s; }
  async put({owner,connector_id,state,record}){ this.rows.set(this.key(owner,connector_id,state), structuredClone(record)); }
  async take({owner,connector_id,state}){ const k=this.key(owner,connector_id,state); const v=this.rows.get(k); this.rows.delete(k); return v ? structuredClone(v) : null; }
}
class TokenVault {
  constructor(){ this.rows=new Map(); }
  key(o,c){ return o+'::'+c; }
  async put({owner,connector_id,token_set}){ this.rows.set(this.key(owner,connector_id), structuredClone(token_set)); }
  async get({owner,connector_id}){ const v=this.rows.get(this.key(owner,connector_id)); return v ? structuredClone(v) : null; }
  async delete({owner,connector_id}){ return this.rows.delete(this.key(owner,connector_id)); }
}
function vaults(){ return { transactionVault:new TransactionVault(), tokenVault:new TokenVault() }; }

test('OAuth runtime supports authorization-only scopes without requiring them in token response', async () => {
  const v=vaults();
  const runtime=new OAuth2PkceRuntime({
    resolveProvider: async () => ({
      connector_id:'x',
      client_id:'cid',
      authorization_endpoint:'https://auth.example/authorize',
      token_endpoint:'https://auth.example/token',
      redirect_uri:'https://mel.example/cb',
    }),
    resolveManifest: async () => ({
      id:'x', version:'1', auth:'oauth2',
      scopes:{ required:['mail.read'], optional:[], authorization_only:['offline_access'] },
    }),
    transactionVault:v.transactionVault,
    tokenVault:v.tokenVault,
    tokenClient:{
      async exchange(){ return { access_token:'a', refresh_token:'r', expires_in:3600 }; },
      async refresh(){ return { access_token:'b', scope:'mail.read', expires_in:3600 }; },
      async revoke(){ return {ok:true}; },
    },
  });
  const begin=await runtime.begin({connector_id:'x'},{owner:'adrien'});
  const url=new URL(begin.authorization_url);
  assert.equal(url.searchParams.get('scope'),'mail.read offline_access');
  const result=await runtime.callback({connector_id:'x',state:url.searchParams.get('state'),code:'ok'},{owner:'adrien'});
  assert.equal(result.authorized,true);
  assert.deepEqual(result.scopes,['mail.read']);
});

test('Microsoft mail begin uses common v2 endpoint, PKCE and offline_access', async () => {
  const v=vaults();
  const runtime=createMailOAuthRuntime({
    providerId:'microsoft',
    env:{
      MICROSOFT_OAUTH_CLIENT_ID:'ms-client',
      MICROSOFT_OAUTH_CLIENT_SECRET:'ms-secret',
      MEL_PUBLIC_ORIGIN:'https://mel.example',
    },
    vaults:v,
    fetcher:async()=>{ throw new Error('not called'); },
  });
  const begin=await runtime.oauth.begin({connector_id:'microsoft-mail',optional_scopes:['https://graph.microsoft.com/Mail.Send']},{owner:'adrien'});
  const url=new URL(begin.authorization_url);
  assert.equal(url.origin,'https://login.microsoftonline.com');
  assert.equal(url.pathname,'/common/oauth2/v2.0/authorize');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('redirect_uri'),'https://mel.example/api/gen2/oauth/microsoft/microsoft-mail/callback');
  assert.ok(url.searchParams.get('scope').split(' ').includes('offline_access'));
  assert.ok(url.searchParams.get('scope').split(' ').includes('https://graph.microsoft.com/Mail.Read'));
  assert.ok(url.searchParams.get('scope').split(' ').includes('https://graph.microsoft.com/Mail.Send'));
});

test('Yahoo mail begin uses Yahoo endpoints and mail-r scope', async () => {
  const runtime=createMailOAuthRuntime({
    providerId:'yahoo',
    env:{
      YAHOO_OAUTH_CLIENT_ID:'y-client',
      YAHOO_OAUTH_CLIENT_SECRET:'y-secret',
      MEL_PUBLIC_ORIGIN:'https://mel.example',
    },
    vaults:vaults(),
    fetcher:async()=>{ throw new Error('not called'); },
  });
  const begin=await runtime.oauth.begin({connector_id:'yahoo-mail',optional_scopes:[]},{owner:'adrien'});
  const url=new URL(begin.authorization_url);
  assert.equal(url.origin,'https://api.login.yahoo.com');
  assert.equal(url.pathname,'/oauth2/request_auth');
  assert.equal(url.searchParams.get('redirect_uri'),'https://mel.example/api/gen2/oauth/yahoo/yahoo-mail/callback');
  assert.deepEqual(new Set(url.searchParams.get('scope').split(' ')), new Set(['mail-r','openid']));
});

test('mail OAuth API rejects undeclared provider connectors', async () => {
  const req=new Request('https://mel.example/api/gen2/oauth/microsoft/evil/begin',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  const res=await maybeHandleMailOAuthApi(req,{MELITURGOS_USER:'adrien'},new URL(req.url));
  assert.equal(res.status,404);
  assert.equal((await res.json()).code,'MAIL_OAUTH_CONNECTOR_UNSUPPORTED');
});

test('generic IMAP/SMTP connector is explicit standards backend for Roundcube', () => {
  assert.equal(genericMail.id,'generic-imap-smtp');
  assert.equal(genericMail.auth_type,'IMAP_SMTP');
  assert.equal(genericMail.metadata.tls_required,true);
  assert.ok(genericMail.capabilities.includes('mail.messages.read'));
  assert.ok(genericMail.capabilities.includes('mail.messages.send'));
});
