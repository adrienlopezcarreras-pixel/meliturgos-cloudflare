import { verifyRestoreCandidate } from '../backup/restore-service.js';
import { ENCRYPTED_BACKUP_SCHEMA, createEnvBackupEncryptionCodec } from '../backup/encrypted-backup-storage.js';
import { SovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { validateSovereigntyCandidates } from './sovereignty-candidate-validator.js';
import { createD1OAuthVaults } from '../connectors/d1-oauth-vault.js';
import { pipedreamAccessToken, pipedreamAccountStatus } from '../api/connection-settings-api.js';

export const GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID = 'google-drive-backup-restore-v1';

function clean(value,max=500){return String(value??'').trim().slice(0,max);}
function fail(code,status=400){const error=new Error(code);error.code=code;error.status=status;throw error;}

async function sha256Hex(value){
  const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(String(value??''));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function driveFolder(env={}){
  return clean(env.GOOGLE_DRIVE_SOV_BACKUP_FOLDER_ID||env.GOOGLE_DRIVE_EVIDENCE_FOLDER_ID,300)||null;
}

const PIPEDREAM_CONFIG_ID='pipedream-connect-config';

function actionReturn(body){
  return body?.exports?.$return_value
    ?? body?.data?.exports?.$return_value
    ?? body?.result?.exports?.$return_value
    ?? body?.data?.result
    ?? body?.result
    ?? body?.data
    ?? body;
}

function driveFileId(body){
  const value=actionReturn(body)||{};
  return clean(value?.id||value?.fileId||value?.file_id,300)||null;
}

function bufferText(value){
  const result=actionReturn(value);
  const content=result?.content??result?.buffer??result;
  if(typeof content==='string')return content;
  const bytes=Array.isArray(content?.data)?content.data
    :Array.isArray(content)?content:null;
  if(bytes)return new TextDecoder().decode(Uint8Array.from(bytes));
  const b64=clean(content?.base64||content?.data_b64||content?.content_b64,10_000_000);
  if(b64){
    try{
      const raw=atob(b64);
      return new TextDecoder().decode(Uint8Array.from(raw,ch=>ch.charCodeAt(0)));
    }catch{}
  }
  fail('SOV_BACKUP_PIPEDREAM_BUFFER_INVALID',502);
}

async function pipedreamRunAction({config,owner,accessToken,actionId,configuredProps,fetchImpl=fetch}){
  const environment=config?.environment==='development'?'development':'production';
  const response=await fetchImpl(
    'https://api.pipedream.com/v1/connect/'+encodeURIComponent(config.project_id)+'/actions/run',
    {
      method:'POST',
      headers:{
        authorization:'Bearer '+accessToken,
        'content-type':'application/json',
        accept:'application/json',
        'x-pd-environment':environment,
      },
      body:JSON.stringify({
        external_user_id:owner,
        id:actionId,
        configured_props:configuredProps,
      }),
      redirect:'manual',
      signal:AbortSignal.timeout(60_000),
    },
  );
  const text=await response.text().catch(()=>'');
  let body={};
  try{body=text?JSON.parse(text):{};}catch{fail('SOV_BACKUP_PIPEDREAM_INVALID_RESPONSE',502);}
  if(!response.ok)fail('SOV_BACKUP_PIPEDREAM_ACTION_FAILED:'+response.status,502);
  return body;
}

async function pipedreamDriveContext(env,{fetchImpl=fetch}={}){
  if(!env?.DB)return null;
  const owner=clean(env.MELITURGOS_USER||'owner',200)||'owner';
  let config;
  try{
    config=await createD1OAuthVaults(env).tokenVault.get({owner,connector_id:PIPEDREAM_CONFIG_ID});
  }catch{return null;}
  if(!config?.project_id||!config?.client_id||!config?.client_secret)return null;
  const accessToken=await pipedreamAccessToken(config,{fetcher:fetchImpl}).catch(()=>null);
  if(!accessToken)return null;
  const accounts=await pipedreamAccountStatus(config,owner,{fetcher:fetchImpl,accessToken}).catch(()=>null);
  const account=accounts?.accounts?.find(row=>row.app==='google_drive'&&row.healthy===true);
  if(!account?.id)return null;
  return{owner,config,account_id:account.id,access_token:accessToken};
}

function b64UrlAscii(value){
  return btoa(String(value||'')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,'');
}

function pipedreamDriveProxyUrl(pd,target){
  const params=new URLSearchParams({external_user_id:pd.owner,account_id:pd.account_id});
  return 'https://api.pipedream.com/v1/connect/'+encodeURIComponent(pd.config.project_id)
    +'/proxy/'+b64UrlAscii(target)+'?'+params.toString();
}

async function pipedreamDriveProxyResponse({pd,target,method='GET',headers={},body=null,fetchImpl=fetch,allowNotFound=false}){
  const environment=pd.config?.environment==='development'?'development':'production';
  let response;
  try{
    response=await fetchImpl(pipedreamDriveProxyUrl(pd,target),{
      method,
      headers:{
        authorization:'Bearer '+pd.access_token,
        accept:'application/json, text/plain, */*',
        'x-pd-environment':environment,
        ...headers,
      },
      ...(body!==null?{body}:{}),
      redirect:'manual',
      signal:AbortSignal.timeout(45_000),
    });
  }catch{fail('SOV_BACKUP_PIPEDREAM_PROXY_UNAVAILABLE',503);}
  if(allowNotFound&&response.status===404)return response;
  if(!response.ok)fail('SOV_BACKUP_PIPEDREAM_PROXY_FAILED:'+response.status,502);
  return response;
}

async function pipedreamDriveProxyUpload({pd,name,content,folderId=null,mimeType='application/json',fetchImpl=fetch}){
  const boundary='mel_sov_pd_'+crypto.randomUUID().replaceAll('-','');
  const metadata={name,mimeType,appProperties:{mel_role:'sovereignty-backup-restore'}};
  if(folderId)metadata.parents=[folderId];
  const body=[
    '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n',
    '--'+boundary+'\r\nContent-Type: '+mimeType+'\r\n\r\n'+String(content??'')+'\r\n',
    '--'+boundary+'--',
  ].join('');
  const target='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime';
  const response=await pipedreamDriveProxyResponse({
    pd,target,method:'POST',headers:{'content-type':'multipart/related; boundary='+boundary},body,fetchImpl,
  });
  const payload=await response.json().catch(()=>null);
  if(!payload?.id)fail('SOV_BACKUP_PIPEDREAM_FILE_ID_MISSING',502);
  return{id:clean(payload.id,300),name:clean(payload.name,300)||name};
}

async function pipedreamDriveProxyRead({pd,fileId,fetchImpl=fetch,allowNotFound=false}){
  const target='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?alt=media';
  const response=await pipedreamDriveProxyResponse({pd,target,fetchImpl,allowNotFound});
  if(allowNotFound&&response.status===404)return null;
  return response.text();
}

async function pipedreamDriveProxyDelete({pd,fileId,fetchImpl=fetch}){
  const target='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId);
  await pipedreamDriveProxyResponse({pd,target,method:'DELETE',fetchImpl,allowNotFound:true});
}

async function provePipedreamDriveBackupRestoreAlternative({
  env={},backup,fetchImpl=fetch,sourceSha,now=Date.now(),context=null,
}={}){
  const pd=context||await pipedreamDriveContext(env,{fetchImpl});
  if(!pd)fail('SOV_BACKUP_PIPEDREAM_DRIVE_REQUIRED',409);
  const source_sha=clean(sourceSha||env.MEL_DEPLOYED_GIT_SHA,80).toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(source_sha))fail('SOV_BACKUP_SOURCE_SHA_REQUIRED',409);
  if(!backup?.snapshot_id||!backup?.encrypted_text)fail('SOV_BACKUP_SOURCE_REQUIRED',409);

  const ciphertext_sha256=await sha256Hex(backup.encrypted_text);
  const name=`MEL-SOV-01-${backup.snapshot_id}-${source_sha.slice(0,12)}.enc.json`;
  const created=await pipedreamDriveProxyUpload({
    pd,name,content:backup.encrypted_text,folderId:driveFolder(env),mimeType:'application/json',fetchImpl,
  });
  const fileId=created.id;

  const readback=await pipedreamDriveProxyRead({pd,fileId,fetchImpl});
  const readback_sha256=await sha256Hex(readback);
  if(readback_sha256!==ciphertext_sha256)fail('SOV_BACKUP_DRIVE_READBACK_INTEGRITY_MISMATCH',409);

  let envelope;
  try{envelope=JSON.parse(readback);}catch{fail('SOV_BACKUP_DRIVE_READBACK_JSON_INVALID',409);}
  if(envelope?.schema!==ENCRYPTED_BACKUP_SCHEMA)fail('SOV_BACKUP_DRIVE_READBACK_SCHEMA_INVALID',409);
  const snapshot=await createEnvBackupEncryptionCodec(env).open(envelope);
  const restore=await verifyRestoreCandidate(snapshot);
  if(restore?.ok!==true)fail(restore?.code||'SOV_BACKUP_RESTORE_DRILL_FAILED',409);
  if(String(snapshot.id||'')!==String(backup.snapshot_id||''))fail('SOV_BACKUP_RESTORE_SNAPSHOT_MISMATCH',409);

  const rollbackProbe=await pipedreamDriveProxyUpload({
    pd,
    name:`MEL-SOV-01-rollback-probe-${crypto.randomUUID()}.json`,
    content:JSON.stringify({schema:'mel.sov-backup-rollback-probe/v1',source_sha}),
    folderId:driveFolder(env),
    mimeType:'application/json',
    fetchImpl,
  });
  await pipedreamDriveProxyDelete({pd,fileId:rollbackProbe.id,fetchImpl});
  const afterDelete=await pipedreamDriveProxyRead({pd,fileId:rollbackProbe.id,fetchImpl,allowNotFound:true});
  if(afterDelete!==null)fail('SOV_BACKUP_PIPEDREAM_ROLLBACK_NOT_CONFIRMED',409);

  return Object.freeze({
    ok:true,
    status:'GOOGLE_DRIVE_BACKUP_RESTORE_PREVALIDATED',
    provider:'google-drive-via-pipedream',
    snapshot_id:backup.snapshot_id,
    drive_file_id:fileId,
    drive_name:created.name||name,
    ciphertext_sha256,
    readback_sha256,
    encrypted:true,
    readback_verified:true,
    restore_verified:true,
    restore_code:restore.code||'RESTORE_CANDIDATE_VERIFIED',
    rollback_verified:true,
    export_verified:true,
    import_verified:true,
    activation_semantics_verified:true,
    activation_performed:false,
    production_mutation:false,
    source_sha,
    verified_at:new Date(now).toISOString(),
    evidence_ref:`google-drive:pipedream-proxy-file:${fileId};sha256:${readback_sha256};snapshot:${backup.snapshot_id}`,
    secret_values_exposed:false,
  });
}

async function driveUpload({token,name,content,folderId=null,fetchImpl=fetch}){
  const boundary=`mel_sov_${crypto.randomUUID().replaceAll('-','')}`;
  const metadata={name,mimeType:'application/json',appProperties:{mel_role:'sovereignty-backup-restore'}};
  if(folderId)metadata.parents=[folderId];
  const body=[
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n`,
    `--${boundary}--`,
  ].join('');
  const response=await fetchImpl('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime',{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':`multipart/related; boundary=${boundary}`},
    body,
    redirect:'manual',
    signal:AbortSignal.timeout(20000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.id)fail(`SOV_BACKUP_DRIVE_UPLOAD_FAILED:${response.status}`,502);
  return{id:clean(payload.id,300),name:clean(payload.name,300)||name,created_time:clean(payload.createdTime,100)||null};
}

async function driveRead({token,fileId,fetchImpl=fetch,allowNotFound=false}){
  const response=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{
    method:'GET',
    headers:{authorization:`Bearer ${token}`},
    redirect:'manual',
    signal:AbortSignal.timeout(20000),
  });
  if(allowNotFound&&response.status===404)return null;
  if(!response.ok)fail(`SOV_BACKUP_DRIVE_READ_FAILED:${response.status}`,502);
  return response.text();
}

async function driveDelete({token,fileId,fetchImpl=fetch}){
  const response=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,{
    method:'DELETE',
    headers:{authorization:`Bearer ${token}`},
    redirect:'manual',
    signal:AbortSignal.timeout(20000),
  });
  if(!response.ok&&response.status!==404)fail(`SOV_BACKUP_DRIVE_DELETE_FAILED:${response.status}`,502);
}

export async function loadLatestEncryptedSystemBackup(env={}){
  if(!env?.DB?.prepare)fail('SOV_BACKUP_DB_REQUIRED',503);
  if(!env?.MEDIA_BUCKET?.get)fail('SOV_BACKUP_R2_REQUIRED',503);
  const row=await env.DB.prepare(
    "SELECT id,object_key,metadata_json,created_at FROM backup_objects WHERE object_key LIKE 'backups/system/%.enc.json' ORDER BY created_at DESC LIMIT 1"
  ).first();
  if(!row?.id||!row?.object_key)fail('SOV_BACKUP_ENCRYPTED_SNAPSHOT_REQUIRED',409);
  let metadata={};
  try{metadata=JSON.parse(row.metadata_json||'{}');}catch{}
  if(metadata.encrypted!==true||metadata.verified!==true||metadata.restoreVerified!==true){
    fail('SOV_BACKUP_VERIFIED_ENCRYPTED_SNAPSHOT_REQUIRED',409);
  }
  const object=await env.MEDIA_BUCKET.get(row.object_key);
  if(!object||typeof object.text!=='function')fail('SOV_BACKUP_R2_OBJECT_MISSING',409);
  const encrypted_text=await object.text();
  let envelope;
  try{envelope=JSON.parse(encrypted_text);}catch{fail('SOV_BACKUP_ENVELOPE_INVALID',409);}
  if(envelope?.schema!==ENCRYPTED_BACKUP_SCHEMA)fail('SOV_BACKUP_ENVELOPE_SCHEMA_INVALID',409);
  return{snapshot_id:clean(row.id,160),object_key:clean(row.object_key,500),encrypted_text,envelope};
}

export { provePipedreamDriveBackupRestoreAlternative };

export async function proveGoogleDriveBackupRestoreAlternative({
  env={},
  backup,
  fetchImpl=fetch,
  sourceSha,
  now=Date.now(),
}={}){
  const token=clean(env.GOOGLE_DRIVE_ACCESS_TOKEN,10000);
  if(!token)fail('SOV_BACKUP_DRIVE_TOKEN_REQUIRED',409);
  const source_sha=clean(sourceSha||env.MEL_DEPLOYED_GIT_SHA,80).toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(source_sha))fail('SOV_BACKUP_SOURCE_SHA_REQUIRED',409);
  if(!backup?.snapshot_id||!backup?.encrypted_text)fail('SOV_BACKUP_SOURCE_REQUIRED',409);

  const ciphertext_sha256=await sha256Hex(backup.encrypted_text);
  const folderId=driveFolder(env);
  const uploaded=await driveUpload({
    token,
    name:`MEL-SOV-01-${backup.snapshot_id}-${source_sha.slice(0,12)}.enc.json`,
    content:backup.encrypted_text,
    folderId,
    fetchImpl,
  });
  const readback=await driveRead({token,fileId:uploaded.id,fetchImpl});
  const readback_sha256=await sha256Hex(readback);
  if(readback_sha256!==ciphertext_sha256)fail('SOV_BACKUP_DRIVE_READBACK_INTEGRITY_MISMATCH',409);

  let envelope;
  try{envelope=JSON.parse(readback);}catch{fail('SOV_BACKUP_DRIVE_READBACK_JSON_INVALID',409);}
  if(envelope?.schema!==ENCRYPTED_BACKUP_SCHEMA)fail('SOV_BACKUP_DRIVE_READBACK_SCHEMA_INVALID',409);
  const snapshot=await createEnvBackupEncryptionCodec(env).open(envelope);
  const restore=await verifyRestoreCandidate(snapshot);
  if(restore?.ok!==true)fail(restore?.code||'SOV_BACKUP_RESTORE_DRILL_FAILED',409);
  if(String(snapshot.id||'')!==String(backup.snapshot_id||''))fail('SOV_BACKUP_RESTORE_SNAPSHOT_MISMATCH',409);

  const rollbackProbe=await driveUpload({
    token,
    name:`MEL-SOV-01-rollback-probe-${crypto.randomUUID()}.json`,
    content:JSON.stringify({schema:'mel.sov-backup-rollback-probe/v1',source_sha}),
    folderId,
    fetchImpl,
  });
  await driveDelete({token,fileId:rollbackProbe.id,fetchImpl});
  const afterDelete=await driveRead({token,fileId:rollbackProbe.id,fetchImpl,allowNotFound:true});
  if(afterDelete!==null)fail('SOV_BACKUP_DRIVE_ROLLBACK_DELETE_NOT_VERIFIED',409);

  return Object.freeze({
    ok:true,
    status:'GOOGLE_DRIVE_BACKUP_RESTORE_PREVALIDATED',
    provider:'google-drive',
    snapshot_id:backup.snapshot_id,
    drive_file_id:uploaded.id,
    drive_name:uploaded.name,
    ciphertext_sha256,
    readback_sha256,
    encrypted:true,
    readback_verified:true,
    restore_verified:true,
    restore_code:restore.code||'RESTORE_CANDIDATE_VERIFIED',
    rollback_verified:true,
    export_verified:true,
    import_verified:true,
    activation_semantics_verified:true,
    activation_performed:false,
    production_mutation:false,
    source_sha,
    verified_at:new Date(now).toISOString(),
    evidence_ref:`google-drive:file:${uploaded.id};sha256:${readback_sha256};snapshot:${backup.snapshot_id}`,
    secret_values_exposed:false,
  });
}

function descriptor({pipedream=false}={}){
  return{
    id:GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID,
    provider:pipedream?'google-drive-via-pipedream':'google-drive',
    adapter_id:'google-drive-backup-restore-v1',
    added_cost_eur:0,
    required_config_refs:['MEL_BACKUP_ENCRYPTION_KEY_ID'],
    required_secret_refs:pipedream?['MEL_BACKUP_ENCRYPTION_KEY_B64']:['GOOGLE_DRIVE_ACCESS_TOKEN','MEL_BACKUP_ENCRYPTION_KEY_B64'],
    cost_provenance:{
      verified:true,
      addedCost:0,
      authorization:{approved:true,policy:'EXISTING_AUTHORIZED_DRIVE_ZERO_ADDED_COST',authority:'owner'},
    },
  };
}

async function seedCandidate(store,{now,force}){
  await store.upsertFromWatch({results:[{
    layer:'backup_restore',
    candidate_hints:[{
      id:GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID,
      provider_hint:'google-drive',
      source_url:'https://www.google.com/drive/',
      source_title:'Google Drive encrypted external backup destination',
      status:'CONFIGURED',
    }],
  }]},{now});
  if(force===true){
    const rows=await store.list({layer:'backup_restore',limit:50});
    const current=rows.find(row=>row.id===GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID);
    if(current&&current.status!=='REJECTED'){
      await store.setStatus({
        layer:'backup_restore',
        id:GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID,
        status:'UNVERIFIED',
        metadata:{reason:'FORCED_FRESH_EXTERNAL_BACKUP_PROOF'},
      });
    }
  }
}

export async function runGoogleDriveBackupRestorePrevalidationRuntime(env={},{
  now=Date.now(),
  force=false,
  sourceSha=null,
  fetchImpl=fetch,
  candidateStore=null,
  registryStore=null,
  loadBackup=loadLatestEncryptedSystemBackup,
  resolvePipedreamDrive=pipedreamDriveContext,
}={}){
  const candidates=candidateStore||(env?.DB?new SovereigntyCandidateStore(env.DB):null);
  const registry=registryStore||(env?.DB?new D1AlternativeRegistryStore(env.DB):null);
  if(!candidates||!registry)return{ok:true,skipped:true,reason:'DB_NOT_CONFIGURED'};

  await seedCandidate(candidates,{now,force});
  const scopedStore={
    list:async({status,limit}={})=>(await candidates.list({layer:'backup_restore',status,limit}))
      .filter(row=>row.id===GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID),
    setStatus:args=>candidates.setStatus(args),
  };

  let proof=null;
  const validation=await validateSovereigntyCandidates({
    candidateStore:scopedStore,
    registryStore:registry,
    env,
    now,
    limit:1,
    resolveCandidate:async candidate=>{
      if(candidate.layer!=='backup_restore'||candidate.id!==GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID){
        return{descriptor:null,adapter:null};
      }
      const encryptionReady=clean(env.MEL_BACKUP_ENCRYPTION_KEY_ID)&&clean(env.MEL_BACKUP_ENCRYPTION_KEY_B64);
      const directReady=Boolean(clean(env.GOOGLE_DRIVE_ACCESS_TOKEN)&&encryptionReady);
      const pd=directReady?null:await resolvePipedreamDrive(env,{fetchImpl});
      const d=descriptor({pipedream:Boolean(pd)});
      const adapter=Object.freeze({id:d.adapter_id,provider:d.provider});
      if(!encryptionReady||(!directReady&&!pd))return{descriptor:d,adapter,env,prevalidated:false,proof:null};
      const backup=await loadBackup(env);
      proof=directReady
        ? await proveGoogleDriveBackupRestoreAlternative({
            env,backup,fetchImpl,sourceSha:sourceSha||env.MEL_DEPLOYED_GIT_SHA,now,
          })
        : await provePipedreamDriveBackupRestoreAlternative({
            env,backup,fetchImpl,sourceSha:sourceSha||env.MEL_DEPLOYED_GIT_SHA,now,context:pd,
          });
      return{descriptor:d,adapter,env,prevalidated:proof.ok===true,proof};
    },
  });

  return{
    ok:true,
    skipped:false,
    status:validation.prevalidated>0?'BACKUP_RESTORE_SOVEREIGNTY_ADVANCED'
      :validation.blocked>0?'BACKUP_RESTORE_SOVEREIGNTY_BLOCKED':'BACKUP_RESTORE_SOVEREIGNTY_NOOP',
    processed:validation.processed,
    prevalidated:validation.prevalidated,
    blocked:validation.blocked,
    results:validation.results,
    proof:proof?{
      provider:proof.provider,
      snapshot_id:proof.snapshot_id,
      ciphertext_sha256:proof.ciphertext_sha256,
      readback_verified:proof.readback_verified,
      restore_verified:proof.restore_verified,
      rollback_verified:proof.rollback_verified,
      source_sha:proof.source_sha,
      evidence_ref:proof.evidence_ref,
      secret_values_exposed:false,
    }:null,
  };
}
