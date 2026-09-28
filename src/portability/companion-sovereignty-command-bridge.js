const SCHEMA='mel.sovereignty.local-command/v1';
const ONLINE_MS=20*1000;
const DEFAULT_WAIT_MS=10*1000;
const POLL_MS=350;

const ALLOWED=Object.freeze({
  'source_control':new Set(['seed','health','read_ref','read_file','write_file','create_ref','update_ref','compare_refs']),
});

function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function fail(code,status=503){const e=new Error(code);e.code=code;e.status=status;return e;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function ensureTables(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_devices(
    id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,
    capabilities TEXT NOT NULL,allowed_apps TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,metadata TEXT NOT NULL DEFAULT "{}"
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_commands(
    id TEXT PRIMARY KEY,device_id TEXT NOT NULL,session_id TEXT NOT NULL,
    plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,
    claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT
  )`).run();
}

export async function selectOnlineSovereigntyCompanion(env,{deviceId=null,now=Date.now()}={}){
  if(!env?.DB)throw fail('COMPANION_SOVEREIGNTY_DB_REQUIRED');
  await ensureTables(env.DB);
  let row;
  if(deviceId){
    row=await env.DB.prepare(`SELECT id,name,platform,halted,last_seen_at,metadata
      FROM computer_devices WHERE id=? LIMIT 1`).bind(clean(deviceId,200)).first();
  }else{
    row=await env.DB.prepare(`SELECT id,name,platform,halted,last_seen_at,metadata
      FROM computer_devices
      WHERE platform='windows' AND halted=0
      ORDER BY last_seen_at DESC LIMIT 1`).first();
  }
  if(!row)throw fail('COMPANION_SOVEREIGNTY_DEVICE_NOT_FOUND',404);
  if(Number(row.halted)===1)throw fail('OWNER_HALT_ACTIVE',409);
  if(String(row.platform||'').toLowerCase()!=='windows')throw fail('COMPANION_SOVEREIGNTY_WINDOWS_REQUIRED',409);
  if(now-Number(row.last_seen_at||0)>ONLINE_MS)throw fail('COMPANION_SOVEREIGNTY_DEVICE_OFFLINE',503);
  let metadata={};try{metadata=JSON.parse(row.metadata||'{}')}catch{}
  return{
    id:row.id,
    name:row.name,
    platform:row.platform,
    last_seen_at:Number(row.last_seen_at||0),
    metadata,
    online:true,
  };
}

function sanitizeSourceControlPayload(action,payload={}){
  const out={repository:clean(payload.repository,200)||'meliturgos-cloudflare'};
  if(action==='seed'){
    out.expected_sha=clean(payload.expected_sha,80).toLowerCase();
  }
  if(['read_ref','create_ref','update_ref'].includes(action))out.ref=clean(payload.ref,240);
  if(['create_ref','update_ref'].includes(action))out.sha=clean(payload.sha,80);
  if(action==='update_ref')out.force=payload.force===true;
  if(action==='read_file'){
    out.ref=clean(payload.ref,240);
    out.path=clean(payload.path,500);
  }
  if(action==='write_file'){
    out.ref=clean(payload.ref,240);
    out.path=clean(payload.path,500);
    out.content=String(payload.content??'').slice(0,64*1024);
    out.message=clean(payload.message,500);
  }
  if(action==='compare_refs'){
    out.base=clean(payload.base,240);
    out.head=clean(payload.head,240);
  }
  return out;
}

function sanitize(layer,action,payload){
  if(layer==='source_control')return sanitizeSourceControlPayload(action,payload);
  return{};
}

export async function enqueueCompanionSovereigntyCommand(env,{
  layer,
  action,
  payload={},
  deviceId=null,
  now=Date.now(),
}={}){
  const normalizedLayer=clean(layer,80);
  const normalizedAction=clean(action,80);
  if(!ALLOWED[normalizedLayer]?.has(normalizedAction))throw fail('COMPANION_SOVEREIGNTY_ACTION_FORBIDDEN',403);
  const device=await selectOnlineSovereigntyCompanion(env,{deviceId,now});
  const commandId=crypto.randomUUID();
  const sessionId=crypto.randomUUID();
  const plan={
    schema:SCHEMA,
    owner_halt:false,
    sovereignty:true,
    layer:normalizedLayer,
    steps:[{
      id:'sovereignty-1',
      action:`sovereignty.${normalizedLayer}.${normalizedAction}`,
      payload:sanitize(normalizedLayer,normalizedAction,payload),
    }],
  };
  await env.DB.prepare(`INSERT INTO computer_commands(
    id,device_id,session_id,plan_json,status,created_at
  ) VALUES(?,?,?,?,?,?)`).bind(
    commandId,device.id,sessionId,JSON.stringify(plan),'PENDING',now
  ).run();
  return{ok:true,command_id:commandId,device_id:device.id,status:'PENDING',schema:SCHEMA};
}

export async function readCompanionSovereigntyCommand(env,{commandId}={}){
  if(!env?.DB)throw fail('COMPANION_SOVEREIGNTY_DB_REQUIRED');
  await ensureTables(env.DB);
  const row=await env.DB.prepare(`SELECT id,device_id,plan_json,status,created_at,claimed_at,
    finished_at,result_json,error_code FROM computer_commands WHERE id=? LIMIT 1`)
    .bind(clean(commandId,200)).first();
  if(!row)return{ok:false,status:'NOT_FOUND',code:'COMPANION_SOVEREIGNTY_COMMAND_NOT_FOUND'};
  let plan={};try{plan=JSON.parse(row.plan_json||'{}')}catch{}
  if(plan?.schema!==SCHEMA)return{ok:false,status:'INVALID',code:'COMPANION_SOVEREIGNTY_SCHEMA_MISMATCH'};
  let result=null;try{result=row.result_json?JSON.parse(row.result_json):null}catch{}
  return{
    ok:row.status==='SUCCEEDED',
    command_id:row.id,
    device_id:row.device_id,
    status:row.status,
    error_code:row.error_code||null,
    result,
    created_at:Number(row.created_at||0),
    claimed_at:row.claimed_at==null?null:Number(row.claimed_at),
    finished_at:row.finished_at==null?null:Number(row.finished_at),
  };
}

export function createCompanionSovereigntyExecutor(env,{
  deviceId=null,
  waitMs=DEFAULT_WAIT_MS,
  pollMs=POLL_MS,
}={}){
  return async({capability,action,payload={},repository}={})=>{
    const prefix='sovereignty.';
    if(!String(capability||'').startsWith(prefix))throw fail('COMPANION_SOVEREIGNTY_CAPABILITY_INVALID',400);
    const layer=String(capability).slice(prefix.length);
    const queued=await enqueueCompanionSovereigntyCommand(env,{
      layer,action,payload:{...payload,...(repository?{repository}: {})},deviceId,
    });
    const deadline=Date.now()+Math.max(1000,Math.min(30000,Number(waitMs)||DEFAULT_WAIT_MS));
    while(Date.now()<deadline){
      const state=await readCompanionSovereigntyCommand(env,{commandId:queued.command_id});
      if(state.status==='SUCCEEDED'){
        const output=state.result?.outputs?.[0]||{};
        return{ok:true,...output,command_id:queued.command_id,device_id:queued.device_id};
      }
      if(state.status==='FAILED'){
        return{ok:false,code:state.error_code||'COMPANION_SOVEREIGNTY_COMMAND_FAILED',command_id:queued.command_id};
      }
      await sleep(Math.max(100,Math.min(1000,Number(pollMs)||POLL_MS)));
    }
    return{ok:false,code:'COMPANION_SOVEREIGNTY_COMMAND_TIMEOUT',command_id:queued.command_id};
  };
}

export const COMPANION_SOVEREIGNTY_COMMAND_SCHEMA=SCHEMA;
