import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../src/router.js';
import { onRequestGet as renderFullMode } from '../src/pages/full-interface-v2.js';

const auth='Basic '+Buffer.from('adrien:test').toString('base64');

test('dashboard summary exposes truthful component state instead of request-success readiness', async()=>{
  const env={
    MELITURGOS_USER:'adrien',
    MELITURGOS_PASSWORD:'test',
    MEL_DEPLOYED_GIT_BRANCH:'release/mel-hardware-v0.1.0',
    MEL_DEPLOYED_GIT_SHA:'1234567890abcdef1234567890abcdef12345678',
  };
  const response=await router.fetch(new Request('https://mel.test/api/gen2/dashboard-summary',{
    headers:{authorization:auth},
  }),env,{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,body.state!=='ERROR');
  assert.ok(['OK','WARN','ERROR'].includes(body.state));
  assert.equal(typeof body.capabilities.total,'number');
  assert.equal(typeof body.capabilities.active,'number');
  assert.equal(typeof body.capabilities.failed,'number');
  assert.equal(typeof body.capabilities.unavailable,'number');
  assert.equal(typeof body.capabilities.degraded,'number');
  assert.equal(body.deployment.exact_identity_known,true);
  assert.equal(body.deployment.branch,'release/mel-hardware-v0.1.0');
  assert.equal(body.deployment.commit,'1234567890abcdef1234567890abcdef12345678');
  const ids=new Set(body.components.map(row=>row.id));
  assert.ok(ids.has('capabilities'));
  assert.ok(ids.has('roadmap'));
  assert.ok(ids.has('deployment'));
  for(const row of body.components){
    assert.ok(['OK','WARN','ERROR'].includes(row.status));
    assert.equal(typeof row.detail,'string');
    assert.ok(row.detail.length>0);
  }
});

test('control center renders global health from dashboard state and avoids forced skill refresh on every open', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/const state=String\(d\?\.state\|\|'WARN'\)\.toUpperCase\(\)/);
  assert.match(runtime,/Array\.isArray\(d\?\.components\)\?d\.components:\[\]/);
  assert.match(runtime,/loadCapabilitiesData\(force\)/);
  assert.doesNotMatch(runtime,/loadCapabilitiesData\(true\),caps=Array\.isArray/);
  assert.doesNotMatch(runtime,/ok===total\?'Système prêt'/);
  assert.match(runtime,/Résumé système indisponible/);
});
