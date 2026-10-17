import { listD1ValidatedDrafts } from '../revenue/taskmarket-worker-cycle.js';
import { streamDirectWork } from '../revenue/work-stream.js';
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

export async function handleRevenueApi(request, env, ctx = null) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/revenue/tasks' && url.pathname !== '/api/revenue/taskmarket-pc-status' && url.pathname !== '/api/revenue/drafts' && url.pathname !== '/api/revenue/direct-work' && url.pathname !== '/api/revenue/direct-work/decision') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if(url.pathname==='/api/revenue/direct-work/decision'){
    if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    if(typeof env?.DB?.prepare!=='function')return json({ok:false,code:'WORK_DRAFT_DB_REQUIRED'},503);
    const body=await request.json().catch(()=>({}));
    const id=String(body?.artifactId||'');
    const decision=body?.decision;
    if(!/^work-[a-f0-9]{64}$/.test(id)||!['approve','reject'].includes(decision))return json({ok:false,code:'WORK_DECISION_INVALID'},400);
    try{
      const status=decision==='approve'?'APPROVED_BY_OWNER':'REJECTED_BY_OWNER';
      const changed=await env.DB.prepare("UPDATE mel_work_artifacts SET status=? WHERE id=? AND status IN ('DRAFT_UNVERIFIED','VERIFIED_LOCALLY')").bind(status,id).run();
      const saved=await env.DB.prepare('SELECT id,status FROM mel_work_artifacts WHERE id=?').bind(id).first();
      if(saved?.id!==id)return json({ok:false,code:'WORK_ARTIFACT_NOT_FOUND'},404);
      if(saved.status!==status)return json({ok:false,code:'WORK_DECISION_CONFLICT'},409);
      return json({ok:true,artifactId:id,status,submitted:false,paid:false});
    }catch{return json({ok:false,code:'WORK_DECISION_PERSISTENCE_FAILED'},503)}
  }
  if(url.pathname==='/api/revenue/direct-work'){
    if(typeof env?.DB?.prepare!=='function')return json({ok:false,code:'WORK_DRAFT_DB_REQUIRED'},503);
    if(request.method==='GET'&&url.searchParams.has('latest_cycle')){
      try{
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS mel_work_cycles (id TEXT PRIMARY KEY, state TEXT NOT NULL, result TEXT, updated_at TEXT NOT NULL)").run();
        const cycle=await env.DB.prepare('SELECT id,state,result,updated_at FROM mel_work_cycles ORDER BY updated_at DESC LIMIT 1').first();
        return json({ok:true,cycle:cycle?{cycleId:cycle.id,status:cycle.state,result:cycle.result?JSON.parse(cycle.result):null,updatedAt:cycle.updated_at}:null});
      }catch{return json({ok:false,code:'WORK_CYCLE_READ_UNAVAILABLE'},503)}
    }
    if(request.method==='GET'&&url.searchParams.has('cycle_id')){
      const id=url.searchParams.get('cycle_id')||'';
      if(!/^[0-9a-f-]{36}$/i.test(id))return json({ok:false,code:'WORK_CYCLE_ID_INVALID'},400);
      try{
        const cycle=await env.DB.prepare('SELECT id,state,result,updated_at FROM mel_work_cycles WHERE id=?').bind(id).first();
        if(!cycle)return json({ok:false,code:'WORK_CYCLE_NOT_FOUND'},404);
        return json({ok:true,cycleId:cycle.id,status:cycle.state,result:cycle.result?JSON.parse(cycle.result):null,updatedAt:cycle.updated_at});
      }catch{return json({ok:false,code:'WORK_CYCLE_READ_UNAVAILABLE'},503)}
    }
    if(request.method==='GET'&&url.searchParams.has('artifact_id')){
      const artifactId=url.searchParams.get('artifact_id')||'';
      if(!/^work-[a-f0-9]{64}$/.test(artifactId))return json({ok:false,code:'WORK_ARTIFACT_ID_INVALID'},400);
      try{
        const artifact=await env.DB.prepare('SELECT id, mission_id, content, status, created_at FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
        if(!artifact)return json({ok:false,code:'WORK_ARTIFACT_NOT_FOUND'},404);
        const cycle=await env.DB.prepare("SELECT result FROM mel_work_cycles WHERE json_valid(result) AND json_extract(result,'$.artifactId')=? ORDER BY updated_at DESC LIMIT 1").bind(artifactId).first();
        const outcome=cycle?.result?JSON.parse(cycle.result):null;
        return json({ok:true,artifact,humanSteps:Array.isArray(outcome?.humanSteps)?outcome.humanSteps:[],submitted:false,paid:false});
      }catch{return json({ok:false,code:'WORK_ARTIFACT_READ_UNAVAILABLE'},503)}
    }
    if(request.method==='GET'){
      try{
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)').run();
        const rows=await env.DB.prepare('SELECT id, mission_id, status, created_at FROM mel_work_artifacts ORDER BY created_at DESC LIMIT 20').all();
        return json({ok:true,artifacts:rows?.results||[],canSubmit:false});
      }catch{return json({ok:false,code:'WORK_ARTIFACT_LIST_UNAVAILABLE'},503)}
    }
    if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    // Streamed while the owner watches: no background job that the runtime cuts off after 30 s.
    return streamDirectWork({env});
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