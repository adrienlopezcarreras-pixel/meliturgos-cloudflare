import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../src/router.js';
import { onRequestGet as renderFullMode } from '../src/pages/full-interface-v2.js';
import { FULL_MODE_CONTROL_PATCH } from '../src/pages/full-mode-control-enhancer.js';

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


test('control center never turns missing dashboard metrics into truthful-looking zeros', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/function finiteMetric\(value\)/);
  assert.match(runtime,/function renderCapabilityOverview\(caps\)/);
  assert.match(runtime,/active===null\?'État indisponible'/);
  assert.match(runtime,/renderCapabilityOverview\(null\);renderRoadmapSummary\(null\)/);
  assert.doesNotMatch(runtime,/s\.total\|\|0/);
  assert.doesNotMatch(runtime,/s\.complete\|\|0/);
  assert.doesNotMatch(runtime,/Number\(caps\.total\|\|0\)/);
  assert.doesNotMatch(runtime,/Number\(caps\.active\|\|0\)/);
});

test('activity panel distinguishes unloaded state from an observed empty state',()=>{
  assert.match(FULL_MODE_CONTROL_PATCH,/function metricValue\(value\)/);
  assert.match(FULL_MODE_CONTROL_PATCH,/État des travaux non chargé/);
  assert.match(FULL_MODE_CONTROL_PATCH,/Journal non chargé\. Actualise pour vérifier les traces récentes\./);
  assert.match(FULL_MODE_CONTROL_PATCH,/renderActivity\(state,null\)/);
  assert.doesNotMatch(FULL_MODE_CONTROL_PATCH,/c\.active\|\|0/);
  assert.doesNotMatch(FULL_MODE_CONTROL_PATCH,/c\.completed\|\|0/);
  assert.doesNotMatch(FULL_MODE_CONTROL_PATCH,/c\.failed\|\|0/);
  assert.doesNotMatch(FULL_MODE_CONTROL_PATCH,/renderActivity\(state,\{events:\[\],deployment:null\}\)/);
});


test('activity and learning cards keep missing evidence unknown instead of inventing zero', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/Historique d’activité non chargé\./);
  assert.match(runtime,/Aucune activité récente observée\./);
  assert.doesNotMatch(runtime,/Number\(counts\.active\|\|0\)/);
  assert.doesNotMatch(runtime,/Number\(counts\.completed\|\|0\)/);
  assert.doesNotMatch(runtime,/Number\(counts\.failed\|\|0\)/);
  assert.match(runtime,/const fmtCount=value=>\{const n=finiteMetric\(value\);return n===null\?'—'/);
  assert.match(runtime,/bar\.setAttribute\('aria-valuetext',p===null\?'mesure indisponible'/);
  assert.doesNotMatch(runtime,/Number\(d\.xp\|\|0\)/);
  assert.doesNotMatch(runtime,/Number\(e\.corrections_validated\|\|0\)/);
  assert.doesNotMatch(runtime,/Number\(e\.inference_trials\|\|0\)/);
  assert.match(runtime,/état des poids indisponible/);
});
