import test from 'node:test';
import assert from 'node:assert/strict';

import { createMailOAuthRuntime, mailOAuthConnectorIds } from '../../src/connectors/mail-oauth-runtime.js';
import { definition as oneDrive } from '../../src/connectors/microsoft-onedrive.js';
import { definition as sharePoint } from '../../src/connectors/microsoft-sharepoint.js';

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
const vaults=()=>({transactionVault:new TransactionVault(),tokenVault:new TokenVault()});
const env={
  MICROSOFT_OAUTH_CLIENT_ID:'ms-client',
  MICROSOFT_OAUTH_CLIENT_SECRET:'ms-secret',
  MEL_PUBLIC_ORIGIN:'https://mel.example',
};

test('Microsoft OAuth catalog exposes mail, OneDrive and SharePoint connectors', () => {
  assert.deepEqual(new Set(mailOAuthConnectorIds('microsoft')), new Set([
    'microsoft-mail',
    'microsoft-onedrive',
    'microsoft-sharepoint',
  ]));
});

test('OneDrive begin requests read scope by default and write only when selected', async () => {
  const runtime=createMailOAuthRuntime({providerId:'microsoft',env,vaults:vaults(),fetcher:async()=>{throw new Error('not called')}});
  const basic=await runtime.oauth.begin({connector_id:'microsoft-onedrive',optional_scopes:[]},{owner:'adrien'});
  const basicScopes=new Set(new URL(basic.authorization_url).searchParams.get('scope').split(' '));
  assert.ok(basicScopes.has('https://graph.microsoft.com/Files.Read.All'));
  assert.ok(basicScopes.has('offline_access'));
  assert.equal(basicScopes.has('https://graph.microsoft.com/Files.ReadWrite.All'),false);

  const full=await runtime.oauth.begin({
    connector_id:'microsoft-onedrive',
    optional_scopes:['https://graph.microsoft.com/Files.ReadWrite.All'],
  },{owner:'adrien'});
  const fullScopes=new Set(new URL(full.authorization_url).searchParams.get('scope').split(' '));
  assert.ok(fullScopes.has('https://graph.microsoft.com/Files.ReadWrite.All'));
});

test('SharePoint begin requires file and site read scopes and supports bounded writes', async () => {
  const runtime=createMailOAuthRuntime({providerId:'microsoft',env,vaults:vaults(),fetcher:async()=>{throw new Error('not called')}});
  const full=await runtime.oauth.begin({
    connector_id:'microsoft-sharepoint',
    optional_scopes:[
      'https://graph.microsoft.com/Files.ReadWrite.All',
      'https://graph.microsoft.com/Sites.ReadWrite.All',
    ],
  },{owner:'adrien'});
  const scopes=new Set(new URL(full.authorization_url).searchParams.get('scope').split(' '));
  for(const scope of [
    'https://graph.microsoft.com/Files.Read.All',
    'https://graph.microsoft.com/Sites.Read.All',
    'https://graph.microsoft.com/Files.ReadWrite.All',
    'https://graph.microsoft.com/Sites.ReadWrite.All',
    'offline_access',
  ]) assert.ok(scopes.has(scope),scope);
});

test('connector manifests stay explicit about Graph probes and capabilities', () => {
  assert.equal(oneDrive.id,'microsoft-onedrive');
  assert.match(oneDrive.probe,/graph\.microsoft\.com\/v1\.0\/me\/drive\/root/);
  assert.ok(oneDrive.capabilities.includes('files.read'));
  assert.ok(oneDrive.capabilities.includes('files.write'));

  assert.equal(sharePoint.id,'microsoft-sharepoint');
  assert.match(sharePoint.probe,/graph\.microsoft\.com\/v1\.0\/sites\/root/);
  assert.ok(sharePoint.capabilities.includes('sites.read'));
  assert.ok(sharePoint.capabilities.includes('sites.write'));
});
