import { listD1ValidatedDrafts, runBoundedTaskmarketDraftCycle, createExactJsonAcceptanceValidator } from '../revenue/taskmarket-worker-cycle.js';
import { requireAuth } from '../core/security.js';
import { maybeHandleComputerApi } from '../devices/computer-companion-api.js';

const TASKMARKET_API = 'https://api.taskmarket.dev/api/tasks';
const MAX_LIMIT = 50;
const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } });
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function normalizeRevenueTasks(payload, nowMs = Date.now()) {
  const candidates = Array.isArray(payload?.data?.tasks) ? payload.data.tasks : Array.isArray(payload?.tasks) ? payload.tasks : [];
  return candidates.slice(0, MAX_LIMIT).filter((task) => {
    if (!record(task) || String(task.status || '').toLowerCase() !== 'open') return false;
    if (typeof task.id !== 'string' || typeof task.description !== 'string') return false;
    if (!/^[0-9]+$/.test(String(task.reward ?? ''))) return false;
    const reward = BigInt(task.reward);
    if (reward <= 0n || reward > BigInt(Number.MAX_SAFE_INTEGER)) return false;
    const expiry = Date.parse(task.expiryTime);
    return Number.isFinite(expiry) && expiry > nowMs;
  }).map((task) => ({
    id: task.id.slice(0, 160),
    referenceCode: typeof task.referenceCode === 'string' ? task.referenceCode.slice(0, 80) : '',
    requester: typeof task.requester === 'string' ? task.requester.slice(0, 120) : null,
    description: task.description.slice(0, 6000),
    reward: String(task.reward),
    status: 'open',
    mode: typeof task.mode === 'string' ? task.mode.slice(0, 40) : null,
    submissionCount: Number.isSafeInteger(task.submissionCount) && task.submissionCount >= 0 ? task.submissionCount : 0,
    expiryTime: new Date(Date.parse(task.expiryTime)).toISOString(),
    platformFeeBps: Number.isSafeInteger(task.platformFeeBps) && task.platformFeeBps >= 0 && task.platformFeeBps <= 10000 ? task.platformFeeBps : null,
    // Unknown source state stays unknown; never infer a no-stake/unclaimed offer.
    stakeRequired: typeof task.stakeRequired === 'boolean' ? task.stakeRequired : null,
    stakeStateKnown: typeof task.stakeRequired === 'boolean',
    claimedBy: task.claimedBy === null ? null : typeof task.claimedBy === 'string' ? task.claimedBy.slice(0, 160) : undefined,
    claimStateKnown: task.claimedBy === null || typeof task.claimedBy === 'string',
  }));
}

export async function handleRevenueApi(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/revenue/tasks' && url.pathname !== '/api/revenue/taskmarket-pc-status' && url.pathname !== '/api/revenue/drafts' && url.pathname !== '/api/revenue/draft-cycle' && url.pathname !== '/api/revenue/draft-readiness') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (url.pathname === '/api/revenue/draft-readiness') {
    if(request.method!=='GET')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    let trustedFixtureCount=0;
    try{
      const fixtures=JSON.parse(env?.MEL_WORK_TRUSTED_ACCEPTANCE_JSON||'null');
      if(record(fixtures)&&Object.keys(fixtures).length<=20)
        trustedFixtureCount=(await Promise.all(Object.values(fixtures).map(async item=>{if(!record(item)||typeof item.expectedJson!=='string'||!/^[a-f0-9]{64}$/i.test(String(item.sha256||'')))return false;const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(item.expectedJson));const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');return actual===item.sha256.toLowerCase();}))).filter(Boolean).length;
    }catch{}
    return json({ok:true,d1Ready:typeof env?.DB?.prepare==='function',trustedFixtureCount,ready:typeof env?.DB?.prepare==='function'&&trustedFixtureCount>0,executionMode:'DRAFT_ONLY',canClaim:false,canSubmit:false});
  }
  if (url.pathname === '/api/revenue/draft-cycle') {
    if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    // A trusted oracle must originate in the server environment, never in browser input.
    // No fallback validator or automatic submission is allowed.
    if(typeof env?.MEL_WORK_TRUSTED_ACCEPTANCE_JSON!=='string')return json({ok:false,code:'WORK_TRUSTED_ACCEPTANCE_NOT_CONFIGURED'},409);
    let expectedByTaskId;
    try { expectedByTaskId=JSON.parse(env.MEL_WORK_TRUSTED_ACCEPTANCE_JSON); }
    catch { return json({ok:false,code:'WORK_TRUSTED_ACCEPTANCE_INVALID'},503); }
    if(!record(expectedByTaskId)||Object.keys(expectedByTaskId).length>20)return json({ok:false,code:'WORK_TRUSTED_ACCEPTANCE_INVALID'},503);
    if(typeof env?.DB?.prepare!=='function')return json({ok:false,code:'WORK_DRAFT_DB_REQUIRED'},503);
    const fixtures=Object.entries(expectedByTaskId);
    if(fixtures.length===0)return json({ok:false,code:'WORK_TRUSTED_ACCEPTANCE_NOT_CONFIGURED'},409);
    for(const [taskId,item] of fixtures){
      if(!taskId||taskId.length>160||!record(item)||typeof item.expectedJson!=='string'||item.expectedJson.length>12000||!/^[a-f0-9]{64}$/i.test(String(item.sha256||'')))
        return json({ok:false,code:'WORK_TRUSTED_ACCEPTANCE_INVALID'},503);
      let parsed;try{parsed=JSON.parse(item.expectedJson)}catch{return json({ok:false,code:'WORK_TRUSTED_ACCEPTANCE_INVALID'},503)}
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(item.expectedJson));
      const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      if(actual!==item.sha256.toLowerCase())return json({ok:false,code:'WORK_TRUSTED_ACCEPTANCE_TAMPERED'},409);
    }
    try {
      const cycle=await runBoundedTaskmarketDraftCycle({
        db:env.DB,env,eligibleTaskIds:Object.keys(expectedByTaskId),validateArtifact:createExactJsonAcceptanceValidator({expectedByTaskId}),
        policy:{minimumProfitMicros:0,minimumMarginBps:0,maxTasksPerCycle:1},
      });
      const decisions=Array.isArray(cycle?.decisions)?cycle.decisions:[];
      const completed=cycle?.status==='COMPLETED' && decisions.length>0 && decisions.every(d=>d.status==='READY_NOT_SUBMITTED'&&typeof d.draftId==='string'&&d.draftId.length>0);
      return json({ok:completed,cycle,submissionEnabled:false,code:completed?null:'WORK_CYCLE_NO_VERIFIED_DRAFT'},completed?200:409);
    } catch(error) {
      const code=String(error?.code||error?.message||'WORK_CYCLE_FAILED');
      return json({ok:false,code:/^[A-Z_]{4,90}$/.test(code)?code:'WORK_CYCLE_FAILED'},503);
    }
  }
  if (url.pathname === '/api/revenue/drafts') {
    if (request.method !== 'GET') return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    try { return json({ok:true,...await listD1ValidatedDrafts(env?.DB,{limit:20})}); }
    catch (error) { return json({ok:false,code:'WORK_DRAFT_LIST_UNAVAILABLE'},503); }
  }
  if (url.pathname === '/api/revenue/taskmarket-pc-status') {
    if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
    const body = await request.json().catch(() => ({}));
    const computerId = typeof body?.computer_id === 'string' ? body.computer_id.trim().slice(0, 200) : '';
    if (!computerId) return json({ ok: false, code: 'COMPUTER_ID_REQUIRED' }, 400);
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    const forwarded = new Request(new URL('/api/computer/v1/pc-control', url.origin), {
      method: 'POST',
      headers,
      body: JSON.stringify({ computer_id: computerId, action: 'taskmarket.readonly.probe', payload: {} }),
    });
    return (await maybeHandleComputerApi(forwarded, env)) || json({ ok: false, code: 'COMPANION_ROUTE_UNAVAILABLE' }, 503);
  }
  if (request.method !== 'GET') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const apiUrl = new URL(TASKMARKET_API);
    apiUrl.searchParams.set('status', 'open');
    apiUrl.searchParams.set('sort', 'reward_desc');
    apiUrl.searchParams.set('limit', String(MAX_LIMIT));
    const response = await fetch(apiUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) return json({ ok: false, code: 'TASKMARKET_UPSTREAM_ERROR', upstreamStatus: response.status, tasks: [] }, 502);
    const payload = await response.json();
    if (!record(payload) || (!Array.isArray(payload?.data?.tasks) && !Array.isArray(payload?.tasks))) return json({ ok: false, code: 'TASKMARKET_RESPONSE_INVALID', tasks: [] }, 502);
    const tasks = normalizeRevenueTasks(payload);
    return json({ ok: true, source: 'taskmarket-public-api', retrievedAt: new Date().toISOString(), count: tasks.length, tasks, executionMode: 'OBSERVE_ONLY', canClaim: false, canSubmit: false });
  } catch (error) {
    return json({ ok: false, code: 'TASKMARKET_UNAVAILABLE', detail: String(error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : error?.code || error?.message || 'UNKNOWN').slice(0, 120), tasks: [] }, 503);
  }
}