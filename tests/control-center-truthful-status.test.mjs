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


test('secondary Control Center cards do not claim device or LoRA absence before evidence loads', async()=>{
  const html=await (await renderFullMode()).text();
  assert.match(html,/id="freeWorkflowState">Vérification…<\/span>/);
  assert.match(html,/id="freeRuntimeState">Vérification…<\/span>/);
  assert.match(html,/id="freeRuntimeDetail">État runtime en cours de vérification\.<\/small>/);
  assert.match(html,/id="computerState">VÉRIFICATION…<\/span>/);
  assert.match(html,/id="computerOut">Chargement de l’état ordinateur…<\/pre>/);
  assert.match(html,/id="terminalDevices"><div class="muted">Chargement des terminaux…<\/div>/);
  assert.doesNotMatch(html,/id="freeWorkflowState">Jamais lancé<\/span>/);
  assert.doesNotMatch(html,/id="freeRuntimeState">Non actif<\/span>/);
});

test('secondary Control Center load failures explicitly invalidate stale LoRA and terminal claims', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/setLoraTag\('#freeWorkflowState','Indisponible','bad'\)/);
  assert.match(runtime,/setLoraTag\('#freeRuntimeState','Indisponible','bad'\)/);
  assert.match(runtime,/setLoraTag\('#freeAgenticState','Indisponible','bad'\)/);
  assert.match(runtime,/freeRuntimeDetail'\)\.textContent='État runtime indisponible\.'/);
  assert.match(runtime,/terminalDevices'\)\.innerHTML='<div class="muted">État des terminaux indisponible\.<\/div>'/);
});


test('partial LoRA payloads keep missing evidence unknown instead of inventing lifecycle states', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/const trainStatus=trainWfKnown&&trainWf\.status!=null\?String\(trainWf\.status\)\.toUpperCase\(\):'UNKNOWN'/);
  assert.match(runtime,/const wfStatus=wfKnown&&wf\.status!=null\?String\(wf\.status\)\.toUpperCase\(\):'UNKNOWN'/);
  assert.match(runtime,/const loraState=loraKnown\?String\(lora\.state\)\.toUpperCase\(\):'UNKNOWN'/);
  assert.match(runtime,/lessonCount==null\?'—\/50'/);
  assert.match(runtime,/freeBenchmarkState'\)\.textContent=!benchKnown\?'—'/);
  assert.match(runtime,/freeImpactStage'\)\.textContent=impact\.next_stage\|\|'—'/);
  assert.match(runtime,/!agenticKnown\?'Indisponible'/);
  assert.match(runtime,/trainStatus==='UNKNOWN'\)setLoraTag\('#freeGpuState','Indisponible'/);
  assert.match(runtime,/wfStatus==='NEVER_RUN'\?'Jamais lancé':'Indisponible'/);
  assert.match(runtime,/loraState==='UNKNOWN'\?'Indisponible'/);
  assert.match(runtime,/percent==null\?'—':percent\+'%'/);
  assert.doesNotMatch(runtime,/trainWf\.status\|\|'NEVER_RUN'/);
  assert.doesNotMatch(runtime,/wf\.status\|\|'NEVER_RUN'/);
  assert.doesNotMatch(runtime,/lora\.state\|\|'BLOCKED'/);
  assert.doesNotMatch(runtime,/corrections_available_for_training\|\|0/);
  assert.doesNotMatch(runtime,/impact\.next_stage\|\|'UNCENSORED_WAITING'/);
});


test('CapabilityBus and import counters do not convert missing payload fields into proven zeroes', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/if\(!Array\.isArray\(d\?\.capabilities\)\)throw Error\('Liste CapabilityBus absente'\)/);
  assert.match(runtime,/const fmt=v=>v==null\|\|!Number\.isFinite\(Number\(v\)\)\?'—'/);
  assert.match(runtime,/chatgptServerConversations'\)\.textContent=fmt\(d\.conversations\)/);
  assert.match(runtime,/chatgptServerMessages'\)\.textContent=fmt\(d\.messages\)/);
  assert.match(runtime,/chatgptServerCandidates'\)\.textContent=fmt\(d\.memory_candidates\)/);
  assert.match(runtime,/chatgptServerUnsynced'\)\.textContent=fmt\(d\.unsynced_messages\)/);
  assert.doesNotMatch(runtime,/Number\(d\.conversations\|\|0\)/);
  assert.doesNotMatch(runtime,/Number\(d\.messages\|\|0\)/);
});

test('ShardVault snapshot missing shard count is shown as unavailable, never zero fragments', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/d\.shards==null\?'nombre de fragments indisponible'/);
  assert.doesNotMatch(runtime,/Number\(d\.shards\|\|0\)/);
});


test('Control Center keeps Work as a compatibility alias inside the single IA & Développement surface', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  const panels=[...html.matchAll(/data-panel="([^"]+)"/g)].map(match=>match[1]);
  assert.ok(panels.includes('multi'));
  assert.ok(!panels.includes('work'));
  assert.match(runtime,/multi:\['IA & Développement','Réunion multi-IA et travaux persistants dans une seule surface\.'\]/);
  assert.match(runtime,/const legacyPanelAliases=\{work:\{panel:'multi',mode:'development'\}\}/);
  assert.doesNotMatch(runtime,/work:\['Work'/);
  assert.doesNotMatch(runtime,/work:\(\)=>loadWork\(\)/);
  assert.match(runtime,/function setUnifiedMode\(mode\)/);
  assert.match(runtime,/if\(alias\?\.mode\)setUnifiedMode\(alias\.mode\)\.catch/);
});

test('Control Center navigation fails closed to overview for unknown panels', async()=>{
  const html=await (await renderFullMode()).text();
  const runtime=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
  assert.match(runtime,/if\(!titles\[target\]\|\|!qs\('\.view\[data-panel="'\+target\+'"\]'\)\)target='overview'/);
  assert.doesNotMatch(html,/data-view="work"/);
});
