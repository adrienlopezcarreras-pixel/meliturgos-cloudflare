import { requireValue } from '../core/contracts.js';
import { DevAgent } from './dev-agent.js';
import { D1DevJobRepository } from './d1-dev-job-repository.js'; import { D1BridgeRepository } from './d1-bridge-repository.js';
const now=()=>Date.now();
export function devRuntime(request,env){const u=new URL(request.url), p=u.pathname; if(!p.startsWith('/api/professor/dev')&&!p.startsWith('/api/dev-bridge')) return null;
 const bridge=p.startsWith('/api/dev-bridge'); if(bridge&&request.headers.get('authorization')!==`Bearer ${env.MEL_DEV_BRIDGE_TOKEN||''}`) return Response.json({error:'BRIDGE_AUTH_REQUIRED',code:'BRIDGE_AUTH_REQUIRED'},{status:401});
 return (async()=>{const body=await request.json().catch(()=>({})); const repo=new D1DevJobRepository(env.DB), bridges=new D1BridgeRepository(env.DB);
  if(p==='/api/professor/dev/status'&&request.method==='GET') return Response.json({...await bridges.status(),capabilities:['code.status','code.tree','code.search','code.read','code.diff','dev.plan','dev.create_candidate','dev.apply_change','dev.test','dev.report','dev.rollback','dev.commit']});
  if(p==='/api/professor/dev/jobs'&&request.method==='GET') return Response.json({jobs:await repo.list()});
  if(p==='/api/professor/dev/jobs'&&request.method==='POST'){requireValue(typeof body.goal==='string'&&body.goal.trim(),'GOAL_REQUIRED');return Response.json(await repo.create({goal:body.goal,optional_context:body.optional_context}),{status:201});}
  const m=p.match(/^\/api\/professor\/dev\/jobs\/([^/]+)(?:\/(approve|cancel))?$/); if(m){const j=await repo.get(m[1]);requireValue(j,'JOB_NOT_FOUND',404);if(request.method==='GET')return Response.json(j);if(m[2]==='approve'&&request.method==='POST'){requireValue(j.status==='READY_FOR_REVIEW','JOB_NOT_READY',409);return Response.json(await repo.update(j.id,{status:'APPROVED',approval_status:'APPROVED'}));}if(m[2]==='cancel'&&request.method==='POST')return Response.json(await repo.update(j.id,{status:'CANCELLED'}));}
  if(p==='/api/dev-bridge/heartbeat'&&request.method==='POST')return Response.json(await bridges.heartbeat('ONLINE'));
  if(p==='/api/dev-bridge/claim'&&request.method==='POST'){const j=await repo.claim();if(!j)return Response.json({job:null});const agent=new DevAgent({diagnose:async input=>({goal:input.goal,source:'dev-agent'}),plan:async input=>({goal:input.goal,steps:['code.search','code.read','dev.create_candidate','dev.test','code.diff']})});const d=await agent.diagnose({goal:j.goal});return Response.json(await repo.update(j.id,{plan_json:await agent.plan(d),status:'CLAIMED'}));}
  if(p==='/api/dev-bridge/result'&&request.method==='POST')return Response.json(await repo.update(body.job_id,body));
  if(p==='/api/dev-bridge/commit'&&request.method==='POST'){const j=await repo.get(body.job_id);requireValue(j&&j.status==='APPROVED','APPROVAL_REQUIRED',409);return Response.json(await repo.update(j.id,{status:'COMMITTED',result_json:{commit:body.commit||null}}));}
  return Response.json({error:'NOT_FOUND',code:'NOT_FOUND'},{status:404});
 })(); }
