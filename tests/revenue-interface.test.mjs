import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/revenue-interface.js';
import { normalizeRevenueTasks } from '../src/api/revenue-worker-api.js';

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
  assert.match(handler, /SAFE_TEMPLATE_FALLBACK/);
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
  const script = html.match(/<script>([\\s\\S]*?)<\\/script>/)?.[1] || '';
  assert.match(script, /function taskQualification\\(t\\)/);
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
  assert.match(ready.economics,/0\\.925000 USDC/);
  assert.match(ready.economics,/avant coûts de calcul/);
  const unknown=qualify({...base,claimedBy:undefined});
  assert.equal(unknown.status,'QUALIFICATION INCOMPLÈTE');
  assert.match(unknown.detail,/revue requise/);
  const feeUnknown=qualify({...base,platformFeeBps:null});
  assert.match(feeUnknown.economics,/Commission inconnue/);
  assert.doesNotMatch(feeUnknown.economics,/0\\.925000 USDC/);
  assert.doesNotMatch(script,/task\\.(claim|submit)|submitResult\\(/i);
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
