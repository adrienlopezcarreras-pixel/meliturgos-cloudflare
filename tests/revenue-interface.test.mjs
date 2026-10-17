import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { createD1ValidatedDraftAdapter } from '../src/revenue/taskmarket-worker-cycle.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet } from '../src/pages/revenue-interface.js';
import { handleRevenueApi, normalizeRevenueTasks } from '../src/api/revenue-worker-api.js';

test('MEL WORK page is simple: PC state, hand-ins, live work, nightly watch — nothing to approve', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const token of ['MEL WORK', 'id="workNow"', 'id="pcState"', 'id="submissionsList"', 'id="watchList"', 'id="live"', '/api/revenue/submissions', '/api/revenue/watch', '/api/revenue/direct-work?latest_cycle=1', '/api/computer/v1/status', "fetch('/api/revenue/direct-work',{method:'POST'})"]) assert.ok(html.includes(token), `missing ${token}`);
  for (const gone of ['palier 0', 'pas encore disponible', 'autonomyToggle', 'Valider le brouillon', 'scanPcTaskmarket', 'Préparation à l']) assert.ok(!html.includes(gone), `obsolete ${gone}`);
  assert.doesNotMatch(html, /privateKey|seedPhrase/i);
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Function(script));
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
  assert.match(router, /handleRevenueApi\(request, env, ctx\)/);
  assert.match(professor, /href="\/revenus"[\s\S]{0,120}MEL WORK/);
  assert.match(router, /const revenueResponse = await handleRevenueApi\(request, env, ctx\)/);
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
  assert.match(probe, /task list --status open --limit 20/);
  assert.match(probe, /mode='READ_ONLY'/);
  assert.doesNotMatch(probe, /task (claim|submit)|submitResult|privateKey|seedPhrase/i);
  const localProbeRoute = api.slice(api.indexOf("if (url.pathname === '/api/revenue/taskmarket-pc-status')"), api.indexOf("if (request.method !== 'GET')", api.indexOf("if (url.pathname === '/api/revenue/taskmarket-pc-status')")));
  assert.match(localProbeRoute, /computer_id: computerId/);
  assert.doesNotMatch(localProbeRoute, /body\.command|body\.payload|body\.script/);
  assert.equal(asset, dist, 'the distributed Companion script remains synchronized');
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

test('direct MEL WORK API stays owner-only and fails closed without D1',async()=>{
 const url='https://mel.test/api/revenue/direct-work';
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test'};
 assert.notEqual((await handleRevenueApi(new Request(url),env)).status,200);
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const response=await handleRevenueApi(new Request(url,{method:'POST',headers}),env);
 assert.equal(response.status,503);
 assert.equal((await response.json()).code,'WORK_DRAFT_DB_REQUIRED');
});

test('owner may read saved direct artifact by exact id; other users and malformed ids cannot',async()=>{
 const env={MELITURGOS_USER:'adrien',MELITURGOS_PASSWORD:'test',DB:{prepare(sql){return {bind(id){return {first:async()=>({id,mission_id:'job',content:'REAL D1 BODY',status:'DRAFT_UNVERIFIED',created_at:'2026-10-17'})}}}}}};
 const id='work-'+'a'.repeat(64);
 const url='https://mel.test/api/revenue/direct-work?artifact_id='+id;
 assert.notEqual((await handleRevenueApi(new Request(url),env)).status,200);
 const headers={authorization:'Basic '+Buffer.from('adrien:test').toString('base64')};
 const res=await handleRevenueApi(new Request(url,{headers}),env);
 assert.equal(res.status,200);
 assert.equal((await res.json()).artifact.content,'REAL D1 BODY');
 assert.equal((await handleRevenueApi(new Request('https://mel.test/api/revenue/direct-work?artifact_id=../../bad',{headers}),env)).status,400);
});
