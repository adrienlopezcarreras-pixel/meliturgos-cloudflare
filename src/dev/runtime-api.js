import { requireValue } from '../core/contracts.js';
import { DevAgent } from './dev-agent.js';
const jobs=new Map(); let heartbeat=null;
const now=()=>Date.now();
export function devRuntime(request,env){const u=new URL(request.url), p=u.pathname; if(!p.startsWith('/api/professor/dev')&&!p.startsWith('/api/dev-bridge')) return null;
 const bridge=p.startsWith('/api/dev-bridge'); if(bridge&&request.headers.get('authorization')!==`Bearer ${env.MEL_DEV_BRIDGE_TOKEN||''}`) return Response.json({error:'BRIDGE_AUTH_REQUIRED',code:'BRIDGE_AUTH_REQUIRED'},{status:401});
 return (async()=>{const body=await request.json().catch(()=>({}));
  if(p==='/api/professor/dev/status'&&request.method==='GET') return Response.json({online:Boolean(heartbeat&&now()-heartbeat<60000),last_seen:heartbeat,capabilities:['code.status','code.tree','code.search','code.read','code.diff','dev.plan','dev.create_candidate','dev.apply_change','dev.test','dev.report','dev.rollback','dev.commit']});
  if(p==='/api/professor/dev/jobs'&&request.method==='GET') return Response.json({jobs:[...jobs.values()]});
  if(p==='/api/professor/dev/jobs'&&request.method==='POST'){requireValue(typeof body.goal==='string'&&body.goal.trim(),'GOAL_REQUIRED');const id=crypto.randomUUID(),j={id,job_id:id,status:'QUEUED',requested_by:'professor',goal:body.goal,optional_context:body.optional_context||null,created_at:now(),updated_at:now(),approval_status:'PENDING'};jobs.set(id,j);return Response.json(j,{status:201});}
  const m=p.match(/^\/api\/professor\/dev\/jobs\/([^/]+)(?:\/(approve|cancel))?$/); if(m){const j=jobs.get(m[1]);requireValue(j,'JOB_NOT_FOUND',404);if(request.method==='GET')return Response.json(j);if(m[2]==='approve'&&request.method==='POST'){requireValue(j.status==='READY_FOR_REVIEW','JOB_NOT_READY',409);j.status='APPROVED';j.approval_status='APPROVED';j.updated_at=now();return Response.json(j);}if(m[2]==='cancel'&&request.method==='POST'){j.status='CANCELLED';return Response.json(j);}}
  if(p==='/api/dev-bridge/heartbeat'&&request.method==='POST'){heartbeat=now();return Response.json({online:true,last_seen:heartbeat});}
  if(p==='/api/dev-bridge/claim'&&request.method==='POST'){const j=[...jobs.values()].find(x=>x.status==='QUEUED');if(!j)return Response.json({job:null});const agent=new DevAgent({diagnose:async input=>({goal:input.goal,source:'dev-agent'}),plan:async input=>({goal:input.goal,steps:['code.search','code.read','dev.create_candidate','dev.test','code.diff']})});j.dev_agent=await agent.diagnose({goal:j.goal});j.plan=await agent.plan(j.dev_agent);j.status='CLAIMED';j.updated_at=now();return Response.json(j);}
  if(p==='/api/dev-bridge/result'&&request.method==='POST'){const j=jobs.get(body.job_id);requireValue(j,'JOB_NOT_FOUND',404);Object.assign(j,body,{updated_at:now()});return Response.json(j);}
  if(p==='/api/dev-bridge/commit'&&request.method==='POST'){const j=jobs.get(body.job_id);requireValue(j&&j.status==='APPROVED','APPROVAL_REQUIRED',409);j.status='COMMITTED';j.commit=body.commit||null;j.updated_at=now();return Response.json(j);}
  return Response.json({error:'NOT_FOUND',code:'NOT_FOUND'},{status:404});
 })(); }
