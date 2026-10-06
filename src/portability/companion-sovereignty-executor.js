import { isLocalSovereigntyAction } from './local-sovereignty-actions.js';

function clean(v,max=300){return String(v||'').trim().slice(0,max);}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const MIN_LOCAL_AI_ENGINE_VERSION='1.3.2';

function versionAtLeast(actual,required){
  const a=String(actual||'').match(/^\d+(?:\.\d+){0,3}/)?.[0]?.split('.').map(Number)||[];
  const r=String(required||'').match(/^\d+(?:\.\d+){0,3}/)?.[0]?.split('.').map(Number)||[];
  if(!a.length||!r.length)return false;
  for(let i=0;i<Math.max(a.length,r.length);i++){
    const av=Number(a[i]||0),rv=Number(r[i]||0);
    if(av>rv)return true;
    if(av<rv)return false;
  }
  return true;
}

async function ensureTables(db){
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_devices(
    id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,
    capabilities TEXT NOT NULL,allowed_apps TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,metadata TEXT NOT NULL DEFAULT "{}"
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_commands(
    id TEXT PRIMARY KEY,device_id TEXT NOT NULL,session_id TEXT NOT NULL,plan_json TEXT NOT NULL,
    status TEXT NOT NULL,created_at INTEGER NOT NULL,claimed_at INTEGER,finished_at INTEGER,
    result_json TEXT,error_code TEXT
  )`).run();
}

function engineHeartbeatFresh(row,{now=Date.now(),onlineWithinMs=35000}={}){
  if(!row||Number(row.halted)===1||String(row.platform||'').toLowerCase()!=='windows')return false;
  if(now-Number(row.last_seen_at||0)>=onlineWithinMs)return false;
  try{
    const metadata=JSON.parse(row.metadata||'{}');
    const engineHeartbeatAt=Number(metadata.engine_heartbeat_at||0);
    return engineHeartbeatAt>0&&now-engineHeartbeatAt<onlineWithinMs;
  }catch{return false;}
}

async function chooseDevice(db,{deviceId=null,now=Date.now(),onlineWithinMs=35000}={}){
  if(deviceId){
    const row=await db.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(clean(deviceId,200)).first();
    return engineHeartbeatFresh(row,{now,onlineWithinMs})?row:null;
  }
  const rows=await db.prepare(`SELECT * FROM computer_devices
    WHERE lower(platform)='windows' AND halted=0 AND last_seen_at>=?
    ORDER BY last_seen_at DESC LIMIT 5`)
    .bind(now-onlineWithinMs).all();
  return (rows?.results||[]).find(row=>engineHeartbeatFresh(row,{now,onlineWithinMs}))||null;
}

function parseJson(v,fallback=null){
  try{return JSON.parse(String(v||''));}catch{return fallback;}
}

export function createCompanionSovereigntyExecutor(env,{
  deviceId=null,
  pollIntervalMs=300,
  timeoutMs=12000,
  onlineWithinMs=35000,
}={}){
  if(!env?.DB)throw Object.assign(new Error('COMPANION_SOVEREIGNTY_DB_REQUIRED'),{code:'COMPANION_SOVEREIGNTY_DB_REQUIRED'});

  return async function execute({capability,action,repository=null,namespace=null,database=null,service=null,payload={}}={}){
    const capabilityId=String(capability||'').trim();
    if(!capabilityId.startsWith('sovereignty.')){
      return{ok:false,code:'SOVEREIGNTY_CAPABILITY_REQUIRED'};
    }
    const rawAction=String(action||'').trim();
    const qualifiedAction=rawAction.startsWith('sovereignty.')
      ? rawAction
      : capabilityId+'.'+rawAction;
    if(!isLocalSovereigntyAction(qualifiedAction)){
      return{ok:false,code:'SOVEREIGNTY_ACTION_NOT_ALLOWED'};
    }

    await ensureTables(env.DB);
    const now=Date.now();
    const device=await chooseDevice(env.DB,{deviceId,now,onlineWithinMs});
    if(!device)return{ok:false,code:'COMPUTER_OFFLINE'};
    if(Number(device.halted)===1)return{ok:false,code:'OWNER_HALT_ACTIVE'};
    if(String(device.platform||'').toLowerCase()!=='windows')return{ok:false,code:'SOVEREIGNTY_WINDOWS_REQUIRED'};
    if(capabilityId==='sovereignty.ai'){
      const metadata=parseJson(device.metadata,{})||{};
      const engineVersion=clean(metadata.engine_version,80);
      if(!versionAtLeast(engineVersion,MIN_LOCAL_AI_ENGINE_VERSION)){
        return{
          ok:false,
          code:'COMPANION_ENGINE_UPDATE_REQUIRED:'+MIN_LOCAL_AI_ENGINE_VERSION,
          engine_version:engineVersion||null,
          required_engine_version:MIN_LOCAL_AI_ENGINE_VERSION,
          refresh_status:clean(metadata.engine_refresh_status,80)||null,
        };
      }
    }

    const commandId=crypto.randomUUID();
    const sessionId=crypto.randomUUID();
    const stepPayload={
      ...(payload&&typeof payload==='object'?payload:{}),
    };
    if(repository)stepPayload.repository=clean(repository,200);
    if(namespace)stepPayload.namespace=clean(namespace,200);
    if(database)stepPayload.database=clean(database,240);
    if(service)stepPayload.service=clean(service,180);

    const plan={
      schema:'mel.sovereignty.local-command/v1',
      owner_authorized:true,
      internal_executor:true,
      steps:[{id:'sovereignty-1',action:qualifiedAction,payload:stepPayload}],
    };

    await env.DB.prepare(`INSERT INTO computer_commands(
      id,device_id,session_id,plan_json,status,created_at
    ) VALUES(?,?,?,?,?,?)`)
      .bind(commandId,device.id,sessionId,JSON.stringify(plan),'PENDING',now).run();

    const deadline=Date.now()+Math.max(1000,Math.min(120000,Number(timeoutMs)||12000));
    while(Date.now()<deadline){
      const row=await env.DB.prepare(`SELECT status,result_json,error_code
        FROM computer_commands WHERE id=? AND device_id=? LIMIT 1`)
        .bind(commandId,device.id).first();

      const status=String(row?.status||'');
      if(status==='SUCCEEDED'){
        const result=parseJson(row?.result_json,{});
        const output=Array.isArray(result?.outputs)?result.outputs[0]:null;
        return{
          ok:true,
          command_id:commandId,
          device_id:device.id,
          ...(output&&typeof output==='object'?output:{}),
        };
      }
      if(status==='FAILED'){
        return{
          ok:false,
          code:clean(row?.error_code,240)||'COMPANION_SOVEREIGNTY_FAILED',
          command_id:commandId,
          device_id:device.id,
        };
      }
      await sleep(Math.max(100,Math.min(1000,Number(pollIntervalMs)||300)));
    }

    return{
      ok:false,
      code:'COMPANION_SOVEREIGNTY_TIMEOUT',
      command_id:commandId,
      device_id:device.id,
    };
  };
}
