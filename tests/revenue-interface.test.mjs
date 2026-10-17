import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createD1ValidatedDraftAdapter } from '../src/revenue/taskmarket-worker-cycle.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/revenue-interface.js';
import { handleRevenueApi, normalizeRevenueTasks } from '../src/api/revenue-worker-api.js';

test('MEL WORK revenue page is an observation-only control center, not a claim/submit UI', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const token of ['MEL WORK', 'id="refreshAll"', 'id="refreshPc"', 'id="taskList"', '/api/revenue/tasks', '/api/computer/v1/status', 'observation uniquement']) assert.ok(html.includes(token), `missing ${token}`);
  assert.match(html, /id="autonomyToggle" disabled/);
  assert.match(html, /taskmarket\.cmd/i, 'the local Taskmarket probe is described in the page');
  assert.doesNotMatch(html, /privateKey|seedPhrase|submitResult\(/i, 'the page must not expose signing secrets or submission actions');
});

test('revenue task normalizer accepts only valid open, unexpired paid tasks', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  const valid = { id: 'task-1', referenceCode: 'TSK-1', status: 'open', description: 'Normalize provided JSON.', reward: '1000000', mode: 'bounty', submissionCount: 3, expiryTime: '2026-10-17T12:00:00.000Z', platformFeeBps: 750 };
  const tasks = normalizeRevenueTasks({ data: { tasks: [valid, { ...valid, id: 'closed', status: 'closed' }, { ...valid, id: 'expired', expiryTime: '2026-10-15T12:00:00.000Z' }, { ...valid, id: 'free', reward: '0' }] } }, now);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, 'task-1');
  assert.equal(tasks[0].reward, '1000000');
  assert.equal(tasks[0].platformFeeBps, 750);
  assert.equal(tasks[0].stakeRequired, null, 'missing stake data must remain unknown');
  assert.equal(tasks[0].stakeStateKnown, false);
  assert.equal(tasks[0].claimedBy, undefined, 'missing claim data must remain unknown');
  assert.equal(tasks[0].claimStateKnown, false);
  const explicitlySafe = normalizeRevenueTasks({ tasks: [{ ...valid, stakeRequired: false, claimedBy: null }] }, now)[0];
  assert.equal(explicitlySafe.stakeRequired, false);
  assert.equal(explicitlySafe.claimedBy, null);
  assert.equal(explicitlySafe.stakeStateKnown, true);
  assert.equal(explicitlySafe.claimStateKnown, true);
});

test('task normalizer supports CLI/API list envelope without inventing offer data', () => {
  const valid = { id: 'task-2', status: 'open', description: 'Process a public JSON dataset.', reward: '2500000', expiryTime: '2026-10-18T12:00:00.000Z' };
  const tasks = normalizeRevenueTasks({ tasks: [valid] }, Date.parse('2026-10-16T12:00:00.000Z'));
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].reward, '2500000');
  assert.equal(tasks[0].referenceCode, '');
});
test('canonical MEL navigation and router expose MEL WORK without bypassing owner authentication', async () => {
  const [router, professor] = await Promise.all([
    readFile(new URL('../src/router.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8'),
  ]);
  assert.match(router, /url\.pathname === "\/revenus"/);
  assert.match(router, /handleRevenueApi\(request, env\)/);
  assert.match(professor, /href="\/revenus"[\s\S]{0,120}MEL WORK/);
  assert.match(router, /const auth = requireAuth\(request, env\);[\s\S]{0,120}handleRevenueApi\(request, env\)/);
});

test('Taskmarket PC probe is fixed/read-only, owner-authenticated, and accepts only a PC identity', async () => {
  const [api, companionApi, statuses, probe, asset, dist, page] = await Promise.all([
    readFile(new URL('../src/api/revenue-worker-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/devices/computer-companion-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/devices/computer-command-status.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/devices/taskmarket-readonly-companion.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/revenue-interface.js', import.meta.url), 'utf8'),
  ]);
  assert.match(api, /requireAuth\(request, env\)/);
  assert.match(api, /action: 'taskmarket\.readonly\.probe'/);
  assert.match(companionApi, /"taskmarket\.readonly\.probe"/);
  assert.match(companionApi, /effectivePayload=taskmarketReadonlyPcCommand\(\)/);
  assert.match(companionApi, /import \{ COMPUTER_COMMAND_STATUS \} from \"\.\/computer-command-status\.js\"/);
  assert.match(companionApi, /COMPUTER_COMMAND_STATUS\.SUCCEEDED/);
  assert.match(companionApi, /COMPUTER_COMMAND_STATUS\.FAILED/);
  assert.match(statuses, /SUCCEEDED: \"SUCCEEDED\"/);
  assert.match(page, /import \{ COMPUTER_COMMAND_STATUS \} from \"\.\.\/devices\/computer-command-status\.js\"/);
  assert.match(page, /\$\{COMPUTER_COMMAND_STATUS\.SUCCEEDED\}/);
  assert.doesNotMatch(page, /command\.status==='SUCCESS'/, 'the page must not accept a non-canonical SUCCESS alias');
  assert.match(probe, /task list --status open --limit 20/);
  assert.match(probe, /mode='READ_ONLY'/);
  assert.doesNotMatch(probe, /task (claim|submit)|submitResult|privateKey|seedPhrase/i);
  const localProbeRoute = api.slice(api.indexOf("if (url.pathname === '/api/revenue/taskmarket-pc-status')"), api.indexOf("if (request.method !== 'GET')", api.indexOf("if (url.pathname === '/api/revenue/taskmarket-pc-status')")));
  assert.match(localProbeRoute, /computer_id: computerId/);
  assert.doesNotMatch(localProbeRoute, /body\.command|body\.payload|body\.script/);
  assert.equal(asset, dist, 'the distributed Companion script remains synchronized');
  assert.match(page, /id="scanPcTaskmarket"/);
  assert.match(page, /\/api\/revenue\/taskmarket-pc-status/);
  assert.match(page, /value\.action==='system\.exec'/);
  assert.match(page, /JSON\.parse\(String\(probe\.stdout\|\|''\)\)/);
  assert.match(page, /command\.status==='\$\{COMPUTER_COMMAND_STATUS\.SUCCEEDED\}'/);
  assert.match(page, /PC_TASKMARKET_PROBE_TIMEOUT/);
  assert.match(page, /PC_TASKMARKET_OUTPUT_JSON_INVALID/);
  assert.match(page, /attempt<30/);
  assert.match(page, /cli_available!==true/);
  assert.match(page, /list_available!==true/);
  assert.match(page, /last_seen_at/);
  assert.match(page, /palier 0 — lecture seule/);
  assert.match(page, /function taskLifecycle\(t\)/);
  assert.match(page, /Stake inconnu — revue requise/);
  assert.match(page, /Statut de réclamation inconnu — revue requise/);
  assert.match(page, /Aucun stake · non réclamée confirmé/);
});

test('MEL WORK executes its saved candidate-only preparation plan only after an owner click and never submits a mission', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  const html = await response.text();
  assert.match(html, /data-create-work-plan/);
  assert.match(html, /Préparer avec MEL/);
  assert.match(html, /work\.plan\.save/);
  assert.match(html, /work\.plan\.get/);
  assert.match(html, /CANDIDATE_ONLY/);
  assert.match(html, /OBSERVATION/);
  assert.match(html, /aucune mission n’a été réclamée ou soumise/i);
  assert.doesNotMatch(html, /task claim|task submit|submitResult\(/i, 'preparation must not expose claim or submission operations');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const runner = script.slice(script.indexOf('async function executeSavedReadOnlyPreparation'), script.indexOf('async function createPersistentPrepPlan'));
  const handler = script.slice(script.indexOf('async function createPersistentPrepPlan'), script.indexOf('async function refreshTasks'));
  assert.match(handler, /executeWorkCapability\('work\.plan\.generate'/);
  assert.match(handler, /executeWorkCapability\('work\.plan\.save'/);
  assert.match(handler, /executeWorkCapability\('work\.plan\.get'/);
  assert.match(runner, /executeWorkCapability\('work\.plan\.materialize'/);
  assert.match(runner, /executeWorkCapability\('work\.run'/);
  assert.match(runner, /executeWorkCapability\('work\.plan\.sync'/);
  assert.match(runner, /safePreparationCapabilities\.has/);
  assert.match(runner, /PERSISTED_PREP_PLAN_NOT_READ_ONLY/);
  assert.match(handler, /GENERATED_READ_ONLY_PLAN/);
  assert.match(handler, /SAFE_LOCAL_DIAGNOSTICS_FALLBACK/);
  assert.match(handler, /function buildLocalDiagnosticFallback\(bindings\)/);
  assert.match(handler, /capability:'roadmap\.read'/);
  assert.match(handler, /capability:'system\.bindings'/);
  assert.match(handler, /fallbackBindings=await executeWorkCapability\('system\.bindings',\{\}\)/);
  assert.match(handler, /bindings\?\.db===true/);
  assert.match(handler, /capability:'system\.integrity'/);
  assert.match(handler, /capability:'system\.maturity'/);
  assert.match(handler, /Les diagnostics locaux ne prouvent pas que ces exigences sont satisfaites/);
  const saveAt = handler.indexOf("executeWorkCapability('work.plan.save'");
  const runHelperAt = handler.indexOf('await executeSavedReadOnlyPreparation(taskId,planId,title,button,safePreparationCapabilities');
  const materializeAt = runner.indexOf("executeWorkCapability('work.plan.materialize'");
  const runAt = runner.indexOf("executeWorkCapability('work.run'");
  assert.ok(saveAt >= 0 && saveAt < runHelperAt, 'the plan must be persisted before the explicit preparation runner is called');
  assert.ok(materializeAt >= 0 && materializeAt < runAt, 'the preparation DAG must be materialized before work.run');
  const pageLoad = script.slice(script.indexOf('Promise.all([refreshTasks(),refreshPc()])'));
  assert.doesNotMatch(pageLoad, /work\.plan\.materialize|work\.run/, 'no preparation runs automatically on page load');
  assert.doesNotThrow(() => new Function(script));
});

test('MEL WORK reloads saved preparation-plan state from the existing persistent plan registry', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  const html = await response.text();
  assert.match(html, /id="prepPlanInfo"/);
  assert.match(html, /async function loadPersistentPrepPlans/);
  assert.match(html, /executeWorkCapability\('work\.plan\.list',\{limit:100\}\)/);
  assert.match(html, /savedPlanIds\.has\(taskPreparationPlanId\(t\.id\)\)/);
  assert.match(html, /Plans de préparation persistants récupérés/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.doesNotThrow(() => new Function(script));
});

test('MEL WORK renders a per-plan persistent status board without implying delivery or payment', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  const html = await response.text();
  assert.match(html, /id="savedPrepPlansSection"/);
  assert.match(html, /id="prepPlanList"/);
  assert.match(html, /function renderPersistentPrepPlans\(\)/);
  assert.match(html, /savedPlanRecords\.set\(id,\{id,status:String\(row\?\.status/);
  assert.match(html, /row\?\.work_dag_id/);
  assert.match(html, /row\?\.updated_at/);
  assert.match(html, /Dernière mise à jour/);
  assert.match(html, /aucune réclamation, soumission, signature ou paiement n’est déduit de cet état/i);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.doesNotThrow(() => new Function(script));
});

test('MEL WORK resumes a saved read-only preparation through its existing Work DAG without rematerializing it', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  const html = await response.text();
  assert.match(html, /data-resume-work-plan/);
  assert.match(html, /async function resumePersistentPrepPlan\(planId,button\)/);
  assert.match(html, /savedPlanRecords\.get\(planId\)/);
  assert.match(html, /PERSISTED_READ_ONLY_PLAN/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const runner = script.slice(script.indexOf('async function executeSavedReadOnlyPreparation'), script.indexOf('async function resumePersistentPrepPlan'));
  const resume = script.slice(script.indexOf('async function resumePersistentPrepPlan'), script.indexOf('async function refreshTasks'));
  assert.match(runner, /const existingDagId=String\(plan\?\.work_dag_id\|\|''\)\.trim\(\);/);
  assert.match(runner, /if\(!dagId\)\{[\s\S]*?work\.plan\.materialize/);
  assert.match(runner, /executeWorkCapability\('work\.run',\{id:dagId\}\)/);
  assert.match(resume, /executeSavedReadOnlyPreparation\(planId,planId/);
  assert.match(resume, /safePreparationCapabilities/);
  assert.match(resume, /Aucune mission n’a été réclamée ou soumise/);
  assert.doesNotThrow(() => new Function(script));
});

test('MEL WORK requires a fresh local remote-access grant and engine heartbeat before claiming PC control is ready', async () => {
  const response = await onRequestGet();
  const html = await response.text();
  assert.match(html, /function computerControlIssue\(pc,now=Date\.now\(\)\)/);
  assert.match(html, /metadata\.remote_access_enabled!==true/);
  assert.match(html, /engine_heartbeat_at/);
  assert.match(html, /now-engine>20000/);
  assert.match(html, /REMOTE_ACCESS_DISABLED_LOCALLY/);
  assert.match(html, /COMPUTER_ENGINE_OFFLINE/);
  assert.match(html, /OWNER_HALT_ACTIVE/);
  assert.match(html, /currentPcIssue\|\|'COMPANION_WINDOWS_NOT_ONLINE'/);
  assert.match(html, /Contrôle prêt/);
  assert.match(html, /autorisation dans MEL Companion Windows/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.doesNotThrow(() => new Function(script));
});

test('MEL WORK can refresh saved preparation plans independently of Taskmarket offers', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  const html = await response.text();
  assert.match(html, /id="refreshPrepPlans"/);
  assert.match(html, /Actualiser les préparations/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const refresh = script.slice(script.indexOf('async function refreshPersistentPrepPlans'), script.indexOf('async function refreshTasks'));
  assert.match(refresh, /await loadPersistentPrepPlans\(\)/);
  assert.match(script, /\$\('refreshPrepPlans'\)\.onclick=refreshPersistentPrepPlans/);
  assert.doesNotMatch(refresh, /refreshTasks\(\)|\/api\/revenue\/tasks/, 'refreshing persisted plans must not depend on Taskmarket availability');
  assert.doesNotMatch(refresh, /work\.run|work\.plan\.materialize/, 'refresh is read-only and must not start work');
  assert.doesNotThrow(() => new Function(script));
});

test('MEL WORK prequalifies public Taskmarket offers without implying submission eligibility or guaranteed profit', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  const html = await response.text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.match(script, /function taskQualification\(t\)/);
  assert.match(script, /CANDIDAT À PRÉPARER/);
  assert.match(script, /QUALIFICATION INCOMPLÈTE/);
  assert.match(script, /Commission inconnue : revenu après frais non calculé/);
  assert.match(script, /avant coûts de calcul, temps de travail et risque de rejet/);
  assert.match(script, /Préqualification à partir des données publiques uniquement/);
  const source = script.slice(script.indexOf('function taskQualification'), script.indexOf('function renderTasks'));
  const likelyCandidate = t => /json|csv|dataset|data processing|software|code|bug|implement|typescript|javascript|python|audit|benchmark|extract|classif|normalize|algorithm|api endpoint|technical analysis/i.test(String(t.description||'')) && !/create an original image|image generation|publish on x|publish on medium|animated infographic|video.*mp4|discord|social media|marketing campaign/i.test(String(t.description||''));
  const taskLifecycle = t => (t.stakeRequired === false && t.claimedBy === null) ? {kind:'good',text:'Aucun stake · non réclamée confirmé'} : {kind:'warn',text:'Statut inconnu — revue requise'};
  const usdc = micros => (Number(BigInt(String(micros||'0')))/1e6).toFixed(6);
  const qualify = new Function('likelyCandidate','taskLifecycle','usdc',source+';return taskQualification;')(likelyCandidate,taskLifecycle,usdc);
  const base={id:'public-1',description:'Normalize the public JSON dataset into CSV',mode:'bounty',status:'open',stakeRequired:false,claimedBy:null,expiryTime:new Date(Date.now()+3600000).toISOString(),reward:'1000000',platformFeeBps:750};
  const ready=qualify(base);
  assert.equal(ready.status,'CANDIDAT À PRÉPARER');
  assert.match(ready.economics,/0\.925000 USDC/);
  assert.match(ready.economics,/avant coûts de calcul/);
  const unknown=qualify({...base,claimedBy:undefined});
  assert.equal(unknown.status,'QUALIFICATION INCOMPLÈTE');
  assert.match(unknown.detail,/revue requise/);
  const feeUnknown=qualify({...base,platformFeeBps:null});
  assert.match(feeUnknown.economics,/Commission inconnue/);
  assert.doesNotMatch(feeUnknown.economics,/0\.925000 USDC/);
  assert.doesNotMatch(script,/task\.(claim|submit)|submitResult\(/i);
  assert.doesNotThrow(() => new Function(script));
});

test('MEL WORK generated browser JavaScript is syntactically valid', async () => {
  const response = await (await import('../src/pages/revenue-interface.js')).onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'MEL WORK inline browser script is present');
  assert.doesNotThrow(() => new Function(script), 'MEL WORK browser script must parse');
});


test('MEL WORK shows fetched offers without awaiting persistent preparation lookup', async () => {
  const html = await (await onRequestGet()).text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const refresh = script.slice(script.indexOf('async function refreshTasks'), script.indexOf('function computerControlIssue'));
  assert.match(refresh, /renderTasks\(\);void loadPersistentPrepPlans\(\);/);
  assert.doesNotMatch(refresh, /await loadPersistentPrepPlans\(\)/);
  assert.doesNotThrow(() => new Function(script));
});


test('MEL WORK prefers synchronized persisted status over transient run status', async () => {
  const html = await (await onRequestGet()).text();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
  const runner = script.slice(script.indexOf('async function executeSavedReadOnlyPreparation'),script.indexOf('async function createPersistentPrepPlan'));
  assert.match(runner, /const status=String\(synced\?\.work\?\.status\|\|executed\?\.status\|\|'UNKNOWN'\)/);
  assert.doesNotThrow(() => new Function(script));
});


test('MEL WORK lets owner inspect persisted artifact summaries without exposing payloads', async()=>{
 const html=await(await onRequestGet()).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 assert.match(script,/data-view-work-artifacts/);
 assert.match(script,/executeWorkCapability\('work\.artifacts'/);
 assert.match(script,/area\.textContent=rows\.length/);
 assert.doesNotThrow(()=>new Function(script));
});


test('MEL WORK refuses to mistake malformed artifact API output for an empty result', async()=>{
 const html=await(await onRequestGet()).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 assert.match(script,/if\(!Array\.isArray\(result\?\.artifacts\)\)throw new Error\('WORK_ARTIFACTS_INVALID_RESPONSE'\)/);
 assert.doesNotThrow(()=>new Function(script));
});


test('MEL WORK refreshes persisted evidence automatically after a preparation execution',async()=>{
 const html=await(await onRequestGet()).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 const runner=script.slice(script.indexOf('async function executeSavedReadOnlyPreparation'),script.indexOf('async function createPersistentPrepPlan'));
 assert.match(runner,/void viewPersistentWorkArtifacts\(planId,evidenceButton\)/);
 assert.doesNotThrow(()=>new Function(script));
});


test('MEL WORK discards stale evidence after a persisted-plan refresh',async()=>{
 const html=await(await onRequestGet()).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 assert.match(script,/!area\.isConnected \|\| savedPlanRecords\.get\(planId\)\?\.work_dag_id!==record\.work_dag_id/);
 assert.doesNotThrow(()=>new Function(script));
});


test('MEL WORK ignores stale evidence errors after plan cards are refreshed',async()=>{
 const html=await(await onRequestGet()).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 assert.match(script,/catch\(error\)\{if\(area\.isConnected && savedPlanRecords\.get\(planId\)\?\.work_dag_id===record\.work_dag_id\)/);
 assert.doesNotThrow(()=>new Function(script));
});


test('MEL WORK displays quality-verified evidence separately from artifact count',async()=>{
 const html=await(await onRequestGet()).text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 assert.match(script,/const verified=rows\.filter/);
 assert.match(script,/Object\.values\(checks\)\.every\(value=>value===true\)/);
 assert.match(script,/contrôles de qualité explicitement réussis/);
 assert.doesNotThrow(()=>new Function(script));
});


test('MEL WORK exposes read-only D1 draft metadata panel',async()=>{
 const html=await(await onRequestGet()).text();
 assert.match(html,/id="savedDraftsSection"/);
 assert.match(html,/\/api\/revenue\/drafts/);
 assert.match(html,/item\.textContent=/);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1]||'';
 assert.doesNotThrow(()=>new Function(script));
});

test('MEL WORK authenticated draft API roundtrips with real SQLite D1 adapter',async()=>{
 const DB=sqliteD1();
 const env={DB,MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
 const url='https://mel.test/api/revenue/drafts';
 const unauth=await handleRevenueApi(new Request(url),env);
 assert.notEqual(unauth.status,200);
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const first=await handleRevenueApi(new Request(url,{headers}),env);
 assert.equal(first.status,200);
 assert.deepEqual((await first.json()).drafts,[]);
 const stored=await createD1ValidatedDraftAdapter(DB)({taskId:'market-job-1',content:'sample validated candidate',candidateSha256:'f'.repeat(64),validation:'schema OK'});
 const listed=await handleRevenueApi(new Request(url,{headers}),env);
 const payload=await listed.json();
 assert.equal(listed.status,200);
 assert.equal(payload.drafts.length,1);
 assert.equal(payload.drafts[0].id,stored.draftId);
 assert.equal(payload.drafts[0].taskId,'market-job-1');
 assert.equal('content' in payload.drafts[0],false);
 assert.equal(JSON.stringify(payload).includes('sample validated candidate'),false);
});

test('MEL WORK draft cycle requires owner auth and server-side trusted oracle',async()=>{
 const url='https://mel.test/api/revenue/draft-cycle';
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
 const denied=await handleRevenueApi(new Request(url,{method:'POST'}),env);
 assert.notEqual(denied.status,200);
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const response=await handleRevenueApi(new Request(url,{method:'POST',headers}),env);
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,'WORK_TRUSTED_ACCEPTANCE_NOT_CONFIGURED');
});
test('MEL WORK draft-cycle button exists without claim or submit routes',async()=>{
 const html=await (await onRequestGet()).text();
 assert.match(html,/id="runDraftCycle"/);
 assert.match(html,/api\/revenue\/draft-cycle/);
 assert.doesNotMatch(html,/\/api\/revenue\/taskmarket-submit/);
});

test('draft readiness reflects real server bindings without exposing acceptance answers',async()=>{
 const url='https://mel.test/api/revenue/draft-readiness';
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',DB:{prepare(){}}};
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const unauth=await handleRevenueApi(new Request(url),env);
 assert.notEqual(unauth.status,200);
 const empty=await (await handleRevenueApi(new Request(url,{headers}),env)).json();
 assert.equal(empty.ready,false);
 assert.equal(empty.d1Ready,true);
 env.MEL_WORK_TRUSTED_ACCEPTANCE_JSON=JSON.stringify({sample:{expectedJson:'{"answer":1}',sha256:'aed6cbbe621d94bd02a9b85bd636d371c2039ffdda7da09615ae28e8d19e51f7'}});
 const ready=await (await handleRevenueApi(new Request(url,{headers}),env)).json();
 assert.equal(ready.ready,true);
 env.MEL_WORK_TRUSTED_ACCEPTANCE_JSON=JSON.stringify({sample:{expectedJson:'{\"answer\":1}',sha256:'f'.repeat(64)}});
 const tampered=await (await handleRevenueApi(new Request(url,{headers}),env)).json();
 assert.equal(tampered.ready,false);
 assert.equal(ready.canSubmit,false);
 assert.equal(JSON.stringify(ready).includes('"answer"'),false);
});

test('MEL WORK draft-cycle API never reports false success for a blocked Council cycle',async()=>{
 const url='https://mel.test/api/revenue/draft-cycle';
 const expectedJson='{"result":true}';
 const bytes=new TextEncoder().encode(expectedJson);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',DB:sqliteD1(),MEL_WORK_TRUSTED_ACCEPTANCE_JSON:JSON.stringify({job1:{expectedJson,sha256:digest}})};
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const prior=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>({tasks:[]})});
 try{
  const response=await handleRevenueApi(new Request(url,{method:'POST',headers}),env);
  assert.equal(response.status,409);
  const payload=await response.json();
  assert.equal(payload.ok,false);
  assert.equal(payload.code,'WORK_CYCLE_NO_VERIFIED_DRAFT');
 }finally{globalThis.fetch=prior}
});

test('draft cycle rejects tampered oracle before any external marketplace or Council request',async()=>{
 const url='https://mel.test/api/revenue/draft-cycle';
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',DB:{prepare(){throw new Error('SHOULD_NOT_QUERY_DB')}},MEL_WORK_TRUSTED_ACCEPTANCE_JSON:JSON.stringify({job:{expectedJson:'{"answer":1}',sha256:'f'.repeat(64)}})};
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const response=await handleRevenueApi(new Request(url,{method:'POST',headers}),env);
 assert.equal(response.status,409);
 assert.equal((await response.json()).code,'WORK_TRUSTED_ACCEPTANCE_TAMPERED');
});

test('MEL WORK readiness gives precise blocking reason for missing D1 or trusted oracle',async()=>{
 const url='https://mel.test/api/revenue/draft-readiness';
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const missingDb=await (await handleRevenueApi(new Request(url,{headers}),env)).json();
 assert.equal(missingDb.blockingReason,'WORK_DRAFT_DB_REQUIRED');
 env.DB={prepare(){}};
 const missingOracle=await (await handleRevenueApi(new Request(url,{headers}),env)).json();
 assert.equal(missingOracle.blockingReason,'WORK_TRUSTED_ACCEPTANCE_NOT_CONFIGURED');
});

test('MEL WORK readiness distinguishes malformed oracle from missing configuration',async()=>{
 const url='https://mel.test/api/revenue/draft-readiness';
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',DB:{prepare(){}},MEL_WORK_TRUSTED_ACCEPTANCE_JSON:'not valid json'};
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const response=await handleRevenueApi(new Request(url,{headers}),env);
 assert.equal(response.status,200);
 const payload=await response.json();
 assert.equal(payload.ready,false);
 assert.equal(payload.blockingReason,'WORK_TRUSTED_ACCEPTANCE_INVALID');
});

test('readiness stays disabled when one of two oracle fixtures is tampered',async()=>{
 const url='https://mel.test/api/revenue/draft-readiness';
 const expectedJson='{"answer":1}';
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expectedJson))),b=>b.toString(16).padStart(2,'0')).join('');
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',DB:{prepare(){}},MEL_WORK_TRUSTED_ACCEPTANCE_JSON:JSON.stringify({valid:{expectedJson,sha256:digest},tampered:{expectedJson,sha256:'f'.repeat(64)}})};
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const result=await (await handleRevenueApi(new Request(url,{headers}),env)).json();
 assert.equal(result.trustedFixtureCount,1);
 assert.equal(result.ready,false);
});

test('eligible discovery is owner-only and fails closed before public lookup without trusted fixtures',async()=>{
 const url='https://mel.test/api/revenue/eligible-discovery';
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
 const denied=await handleRevenueApi(new Request(url),env);
 assert.notEqual(denied.status,200);
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const response=await handleRevenueApi(new Request(url,{headers}),env);
 assert.equal(response.status,409);
 const result=await response.json();
 assert.equal(result.matchingTaskCount,0);
 assert.equal(result.code,'WORK_TRUSTED_ACCEPTANCE_NOT_CONFIGURED');
});
