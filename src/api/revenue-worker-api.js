import { listD1ValidatedDrafts, createTaskmarketCouncilSolverAdapter, createTaskmarketCouncilAssessmentAdapter } from '../revenue/taskmarket-worker-cycle.js';
import { runDirectWork } from '../revenue/work-mission-core.js';
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

export async function handleRevenueApi(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/revenue/tasks' && url.pathname !== '/api/revenue/taskmarket-pc-status' && url.pathname !== '/api/revenue/drafts' && url.pathname !== '/api/revenue/direct-work' && !/^\/api\/revenue\/drafts\/work-[a-f0-9]{64}\/decision$/.test(url.pathname)) return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  if(/^\/api\/revenue\/drafts\/work-[a-f0-9]{64}\/decision$/.test(url.pathname)){
    if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    const id=url.pathname.split('/')[4];
    const body=await request.json().catch(()=>({}));
    if(!['APPROVED','REJECTED'].includes(body.decision))return json({ok:false,code:'WORK_OWNER_DECISION_INVALID'},400);
    try{
      const status=body.decision==='APPROVED'?'APPROVED_BY_OWNER':'REJECTED_BY_OWNER';
      const changed=await env.DB.prepare("UPDATE mel_work_artifacts SET status=?,owner_note=?,decided_at=? WHERE id=? AND status='DRAFT_FOR_OWNER'")
       .bind(status,String(body.note||'').slice(0,1000),new Date().toISOString(),id).run();
      if(Number(changed?.meta?.changes)!==1)return json({ok:false,code:'WORK_DRAFT_NOT_PENDING'},409);
      return json({ok:true,id,status,submitted:false,paid:false});
    }catch{return json({ok:false,code:'WORK_OWNER_DECISION_UNAVAILABLE'},503)}
  }
  if(url.pathname==='/api/revenue/direct-work'){
    if(typeof env?.DB?.prepare!=='function')return json({ok:false,code:'WORK_DRAFT_DB_REQUIRED'},503);
    if(request.method==='GET'&&url.searchParams.has('cycle_id')){
      const id=url.searchParams.get('cycle_id')||'';
      if(!/^cycle-[0-9a-f-]{36}$/.test(id))return json({ok:false,code:'WORK_CYCLE_ID_INVALID'},400);
      const cycle=await env.DB.prepare('SELECT id,state,error,artifact_id,updated_at FROM mel_work_cycles WHERE id=?').bind(id).first().catch(()=>null);
      return cycle?json({ok:true,cycle}):json({ok:false,code:'WORK_CYCLE_NOT_FOUND'},404);
    }
    if(request.method==='GET'&&url.searchParams.has('artifact_id')){
      const artifactId=url.searchParams.get('artifact_id')||'';
      if(!/^work-[a-f0-9]{64}$/.test(artifactId))return json({ok:false,code:'WORK_ARTIFACT_ID_INVALID'},400);
      try{
        const artifact=await env.DB.prepare('SELECT id, mission_id, content, status, created_at, human_steps, owner_note, decided_at FROM mel_work_artifacts WHERE id=?').bind(artifactId).first();
        if(!artifact)return json({ok:false,code:'WORK_ARTIFACT_NOT_FOUND'},404);
        return json({ok:true,artifact:{...artifact,humanSteps:JSON.parse(artifact.human_steps||'[]')},submitted:false,paid:false});
      }catch{return json({ok:false,code:'WORK_ARTIFACT_READ_UNAVAILABLE'},503)}
    }
    if(request.method==='GET'){
      try{
        await env.DB.prepare('CREATE TABLE IF NOT EXISTS mel_work_artifacts (id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, human_steps TEXT NOT NULL DEFAULT \'[]\', owner_note TEXT, decided_at TEXT)').run();
        for(const column of ["human_steps TEXT NOT NULL DEFAULT '[]'","owner_note TEXT","decided_at TEXT"]){try{await env.DB.prepare('ALTER TABLE mel_work_artifacts ADD COLUMN '+column).run()}catch(e){if(!/duplicate column/i.test(String(e)))throw e}}
        const rows=await env.DB.prepare('SELECT id, mission_id, status, created_at, human_steps FROM mel_work_artifacts ORDER BY created_at DESC LIMIT 20').all();
        const missions=await env.DB.prepare('SELECT id, state, last_error, updated_at FROM mel_work_missions ORDER BY updated_at DESC LIMIT 10').all().catch(()=>({results:[]}));
        return json({ok:true,artifacts:(rows?.results||[]).map(x=>({...x,humanSteps:JSON.parse(x.human_steps||'[]')})),missions:missions.results||[],canSubmit:false});
      }catch{return json({ok:false,code:'WORK_ARTIFACT_LIST_UNAVAILABLE'},503)}
    }
    if(request.method!=='POST')return json({ok:false,code:'METHOD_NOT_ALLOWED'},405);
    if(typeof ctx?.waitUntil!=='function')return json({ok:false,code:'WORK_BACKGROUND_CONTEXT_REQUIRED'},503);
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS mel_work_cycles (id TEXT PRIMARY KEY, state TEXT NOT NULL, error TEXT, artifact_id TEXT, started_at TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
    const active=await env.DB.prepare("SELECT id FROM mel_work_cycles WHERE state='RUNNING' ORDER BY started_at DESC LIMIT 1").first();
    if(active)return json({ok:true,cycleId:active.id,state:'RUNNING',reused:true},202);
    const cycleId='cycle-'+crypto.randomUUID(),now=new Date().toISOString();
    await env.DB.prepare('INSERT INTO mel_work_cycles (id,state,started_at,updated_at) VALUES (?,?,?,?)').bind(cycleId,'RUNNING',now,now).run();
    ctx.waitUntil((async()=>{
      try{
        const response=await fetch(TASKMARKET_API+'?status=open&sort=reward_desc&limit=50',{headers:{accept:'application/json'},signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('TASKMARKET_UPSTREAM_ERROR');
        const payload=await response.json();
        if(!Array.isArray(payload?.data?.tasks)&&!Array.isArray(payload?.tasks))throw new Error('TASKMARKET_RESPONSE_INVALID');
        const tasks=normalizeRevenueTasks(payload).map(task=>({...task,eligibleForDraft:task.description.length<=6000}));
        const solve=createTaskmarketCouncilSolverAdapter({env});
        const assess=createTaskmarketCouncilAssessmentAdapter({env});
        const result=await runDirectWork({db:env.DB,listMissions:async()=>tasks,assess:({mission})=>assess({task:mission,untrustedDescription:mission.description}),execute:(_,mission,assessment)=>solve({task:mission,assessment})});
        await env.DB.prepare('UPDATE mel_work_cycles SET state=?,artifact_id=?,updated_at=? WHERE id=?').bind(result.artifactId?'DRAFT_FOR_OWNER':'NO_DRAFTABLE_MISSION',result.artifactId||null,new Date().toISOString(),cycleId).run();
      }catch(error){
        await env.DB.prepare('UPDATE mel_work_cycles SET state=?,error=?,updated_at=? WHERE id=?').bind('FAILED',String(error?.message||'WORK_CYCLE_FAILED').slice(0,180),new Date().toISOString(),cycleId).run();
      }
    })());
    return json({ok:true,cycleId,state:'RUNNING',submitted:false,paid:false},202);
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