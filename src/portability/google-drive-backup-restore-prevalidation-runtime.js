import { verifyRestoreCandidate } from '../backup/restore-service.js';
import { ENCRYPTED_BACKUP_SCHEMA, createEnvBackupEncryptionCodec } from '../backup/encrypted-backup-storage.js';
import { SovereigntyCandidateStore } from './sovereignty-candidate-store.js';
import { D1AlternativeRegistryStore } from './d1-alternative-registry-store.js';
import { validateSovereigntyCandidates } from './sovereignty-candidate-validator.js';
import { createD1OAuthVaults } from '../connectors/d1-oauth-vault.js';
import { pipedreamAccessToken, pipedreamAccountStatus, resolveConnectionOAuthEnv } from '../api/connection-settings-api.js';
import { createGoogleOAuthRuntime } from '../connectors/google-oauth-runtime.js';

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

async function nativeGoogleDriveContext(env,{fetchImpl=fetch}={}){
  if(!env?.DB)return null;
  const owner=clean(env.MELITURGOS_USER||'owner',200)||'owner';
  try{
    const resolved=await resolveConnectionOAuthEnv(env,'google',owner);
    const runtime=createGoogleOAuthRuntime({env:resolved,fetcher:fetchImpl});
    const status=await runtime.status('google-drive',{owner});
    if(status?.authorized!==true)return null;
    const token=await runtime.accessTokenResolver('google-drive',{owner});
    if(!token)return null;
    return{owner,token,provider:'google-drive-oauth',token_source:status.token_source||'unknown'};
  }catch{return null;}
}

async function pipedreamDriveContext(env,{fetchImpl=fetch,accountId=null}={}){
  if(!env?.DB)return null;
  const owner=clean(env.MELITURGOS_USER||'owner',200)||'owner';
  let config;
  try{
    config=await createD1OAuthVaults(env).tokenVault.get({owner,connector_id:PIPEDREAM_CONFIG_ID});
  }catch{return null;}
  if(!config?.project_id||!config?.client_id||!config?.client_secret)return null;
  const accessToken=await pipedreamAccessToken(config,{fetcher:fetchImpl}).catch(()=>null);
  if(!accessToken)return null;
  const knownAccountId=clean(accountId,300);
  if(knownAccountId)return{owner,config,account_id:knownAccountId,access_token:accessToken};
  const accounts=await pipedreamAccountStatus(config,owner,{fetcher:fetchImpl,accessToken}).catch(()=>null);
  const account=accounts?.accounts?.find(row=>row.app==='google_drive'&&row.healthy===true);
  if(!account?.id)return null;
  return{owner,config,account_id:account.id,access_token:accessToken};
}

function b64UrlAscii(value){
  return btoa(String(value||'')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,'');
}

const SOV_BACKUP_DOWNLOAD_PATH='/api/internal/sov-backup-download';
const SOV_BACKUP_DOWNLOAD_TTL_MS=120000;

function randomHex(bytes=32){
  const value=new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return [...value].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function createSovBackupDownloadTicket(env,{objectKey,sourceSha,byteLength=0,now=Date.now()}={}){
  if(!env?.MEDIA_BUCKET?.put)fail('SOV_BACKUP_R2_REQUIRED',503);
  const origin=clean(env.MEL_PUBLIC_ORIGIN,1000).replace(/\/$/,'');
  if(!/^https:\/\//i.test(origin))fail('SOV_BACKUP_PUBLIC_ORIGIN_REQUIRED',503);
  const source_sha=clean(sourceSha,80).toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(source_sha))fail('SOV_BACKUP_SOURCE_SHA_REQUIRED',409);
  const object_key=clean(objectKey,500);
  if(!object_key.startsWith('backups/system/'))fail('SOV_BACKUP_OBJECT_KEY_INVALID',409);
  const token=randomHex(32);
  const token_hash=await sha256Hex(token);
  const expires_at=Number(now)+SOV_BACKUP_DOWNLOAD_TTL_MS;
  await env.MEDIA_BUCKET.put(
    'sovereignty/download-tickets/'+token_hash+'.json',
    JSON.stringify({
      schema:'mel.sov-backup-download-ticket/v1',
      token_hash,source_sha,object_key,
      byte_length:Number(byteLength||0),
      expires_at,
    }),
    {httpMetadata:{contentType:'application/json'}},
  );
  return{
    url:origin+SOV_BACKUP_DOWNLOAD_PATH+'?token='+encodeURIComponent(token)+'&sha='+encodeURIComponent(source_sha),
    token_hash,expires_at,
  };
}

async function consumeSovBackupDownloadTicket(env,tokenHash,sourceSha,{now=Date.now(),consume=true}={}){
  if(!env?.MEDIA_BUCKET?.get)fail('SOV_BACKUP_R2_REQUIRED',503);
  const ticketObject=await env.MEDIA_BUCKET.get('sovereignty/download-tickets/'+tokenHash+'.json');
  if(!ticketObject)fail('SOV_BACKUP_DOWNLOAD_TICKET_NOT_FOUND',404);
  let ticket;
  try{ticket=JSON.parse(await ticketObject.text());}
  catch{fail('SOV_BACKUP_DOWNLOAD_TICKET_INVALID',409);}
  if(ticket?.schema!=='mel.sov-backup-download-ticket/v1')fail('SOV_BACKUP_DOWNLOAD_TICKET_INVALID',409);
  if(ticket?.token_hash!==tokenHash||ticket?.source_sha!==sourceSha)fail('SOV_BACKUP_DOWNLOAD_TICKET_MISMATCH',403);
  if(Number(ticket?.expires_at||0)<Number(now))fail('SOV_BACKUP_DOWNLOAD_TICKET_EXPIRED',410);
  if(consume){
    if(!env?.DB?.prepare)fail('SOV_BACKUP_DB_REQUIRED',503);
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mel_sov_download_consumptions (
      token_hash TEXT PRIMARY KEY,
      source_sha TEXT NOT NULL,
      consumed_at INTEGER NOT NULL
    )`).run();
    const result=await env.DB.prepare(`INSERT OR IGNORE INTO mel_sov_download_consumptions
      (token_hash,source_sha,consumed_at) VALUES(?,?,?)`)
      .bind(tokenHash,sourceSha,Number(now)).run();
    const changes=Number(result?.meta?.changes??result?.changes??0);
    if(changes<1)fail('SOV_BACKUP_DOWNLOAD_TICKET_CONSUMED',410);
  }
  return ticket;
}

export async function maybeHandleSovBackupDownload(request,env,{now=Date.now()}={}){
  const url=new URL(request.url);
  if(url.pathname!==SOV_BACKUP_DOWNLOAD_PATH)return null;
  if(!['GET','HEAD'].includes(request.method)){
    return Response.json({ok:false,code:'METHOD_NOT_ALLOWED'},{status:405,headers:{allow:'GET, HEAD','cache-control':'no-store'}});
  }
  const token=clean(url.searchParams.get('token'),200);
  const sourceSha=clean(url.searchParams.get('sha'),80).toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(token)||!/^[a-f0-9]{40}$/.test(sourceSha)){
    return Response.json({ok:false,code:'SOV_BACKUP_DOWNLOAD_TOKEN_INVALID'},{status:403,headers:{'cache-control':'no-store'}});
  }
  try{
    const tokenHash=await sha256Hex(token);
    const ticket=await consumeSovBackupDownloadTicket(env,tokenHash,sourceSha,{now,consume:request.method==='GET'});
    const object=await env.MEDIA_BUCKET.get(ticket.object_key);
    if(!object)return Response.json({ok:false,code:'SOV_BACKUP_R2_OBJECT_MISSING'},{status:404,headers:{'cache-control':'no-store'}});
    const size=Number(object.size||ticket.byte_length||0);
    const headers=new Headers({
      'content-type':'application/json',
      'content-disposition':'attachment; filename="mel-sovereignty-backup.enc.json"',
      'cache-control':'private, no-store, max-age=0',
      'x-content-type-options':'nosniff',
    });
    if(Number.isSafeInteger(size)&&size>0)headers.set('content-length',String(size));
    if(request.method==='HEAD')return new Response(null,{status:200,headers});
    return new Response(object.body||await object.arrayBuffer(),{status:200,headers});
  }catch(error){
    return Response.json(
      {ok:false,code:String(error?.code||'SOV_BACKUP_DOWNLOAD_FAILED').slice(0,120)},
      {status:Number(error?.status||500),headers:{'cache-control':'no-store'}},
    );
  }
}

async function pipedreamDriveActionUploadUrl({pd,name,fileUrl,mimeType='application/json',fetchImpl=fetch}){
  const body=await pipedreamRunAction({
    config:pd.config,owner:pd.owner,accessToken:pd.access_token,
    actionId:'google_drive-upload-file',
    configuredProps:{
      google_drive:{authProvisionId:pd.account_id},
      filePath:fileUrl,
      name,
      mimeType,
    },
    fetchImpl,
  });
  const id=driveFileId(body);
  if(!id)fail('SOV_BACKUP_PIPEDREAM_FILE_ID_MISSING',502);
  const result=actionReturn(body)||{};
  return{id,name:clean(result?.name,300)||name};
}

async function pipedreamDriveActionCreateText({pd,name,content,fetchImpl=fetch}){
  const body=await pipedreamRunAction({
    config:pd.config,owner:pd.owner,accessToken:pd.access_token,
    actionId:'google_drive-create-file-from-text',
    configuredProps:{
      google_drive:{authProvisionId:pd.account_id},
      name,content:String(content??''),mimeType:'text/plain',
    },
    fetchImpl,
  });
  const id=driveFileId(body);
  if(!id)fail('SOV_BACKUP_PIPEDREAM_FILE_ID_MISSING',502);
  return{id,name};
}

async function pipedreamDriveActionDelete({pd,fileId,fetchImpl=fetch}){
  const body=await pipedreamRunAction({
    config:pd.config,owner:pd.owner,accessToken:pd.access_token,
    actionId:'google_drive-delete-file',
    configuredProps:{
      google_drive:{authProvisionId:pd.account_id},
      fileId,
    },
    fetchImpl,
  });
  const result=actionReturn(body)||{};
  if(result?.success!==true)fail('SOV_BACKUP_PIPEDREAM_DELETE_FAILED',502);
  return true;
}

function pipedreamDriveProxyUrl(pd,target){
  const params=new URLSearchParams({external_user_id:pd.owner,account_id:pd.account_id});
  return 'https://api.pipedream.com/v1/connect/'+encodeURIComponent(pd.config.project_id)
    +'/proxy/'+b64UrlAscii(target)+'?'+params.toString();
}

async function pipedreamDriveProxyResponse({pd,target,method='GET',headers={},body=null,fetchImpl=fetch,allowNotFound=false}){
  const environment=pd.config?.environment==='development'?'development':'production';
  let response;
  const proxyHeaders={
    authorization:'Bearer '+pd.access_token,
    accept:'application/json, text/plain, */*',
    'x-pd-environment':environment,
    'x-pd-proxy-accept':'application/json, text/plain, */*',
  };
  for(const [key,value] of Object.entries(headers||{})){
    const normalized=clean(key,100).toLowerCase();
    if(!normalized||value===null||value===undefined)continue;
    // Pipedream consumes normal request headers itself. Only x-pd-proxy-*
    // headers are guaranteed to be forwarded to Google Drive.
    proxyHeaders[normalized]=String(value);
    proxyHeaders['x-pd-proxy-'+normalized]=String(value);
  }
  try{
    response=await fetchImpl(pipedreamDriveProxyUrl(pd,target),{
      method,
      headers:proxyHeaders,
      ...(body!==null?{body}:{}),
      redirect:'manual',
      signal:AbortSignal.timeout(30_000),
    });
  }catch{fail('SOV_BACKUP_PIPEDREAM_PROXY_UNAVAILABLE',503);}
  if(allowNotFound&&response.status===404)return response;
  if(!response.ok)fail('SOV_BACKUP_PIPEDREAM_PROXY_FAILED:'+response.status,502);
  return response;
}

async function pipedreamDriveProxyCreateFile({pd,name,folderId=null,mimeType='application/json',fetchImpl=fetch}){
  const metadata={name,mimeType,appProperties:{mel_role:'sovereignty-backup-restore'}};
  if(folderId)metadata.parents=[folderId];
  const target='https://www.googleapis.com/drive/v3/files?fields=id,name,createdTime';
  const response=await pipedreamDriveProxyResponse({
    pd,target,method:'POST',
    headers:{'content-type':'application/json; charset=utf-8'},
    body:JSON.stringify(metadata),fetchImpl,
  });
  const payload=await response.json().catch(()=>null);
  if(!payload?.id)fail('SOV_BACKUP_PIPEDREAM_FILE_ID_MISSING',502);
  return{id:clean(payload.id,300),name:clean(payload.name,300)||name};
}

async function pipedreamDriveProxyWriteMedia({pd,fileId,body,mimeType='application/json',fetchImpl=fetch}){
  const target='https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(fileId)
    +'?uploadType=media&fields=id,name';
  const response=await pipedreamDriveProxyResponse({
    pd,target,method:'PATCH',headers:{'content-type':mimeType},body,fetchImpl,
  });
  const payload=await response.json().catch(()=>null);
  if(!payload?.id)fail('SOV_BACKUP_PIPEDREAM_MEDIA_UPLOAD_FAILED',502);
  return{id:clean(payload.id,300),name:clean(payload.name,300)||null};
}

async function pipedreamDriveProxyCreateMedia({
  pd,name,body,mimeType='application/json',fetchImpl=fetch,
}){
  // Create content in one media upload instead of creating an empty Drive file
  // and PATCHing its media afterwards. The latter is rejected by the current
  // Pipedream Google Drive proxy with HTTP 403 in production.
  const target='https://www.googleapis.com/upload/drive/v3/files?uploadType=media&fields=id,name,createdTime';
  const response=await pipedreamDriveProxyResponse({
    pd,target,method:'POST',headers:{'content-type':mimeType},body,fetchImpl,
  });
  const payload=await response.json().catch(()=>null);
  if(!payload?.id)fail('SOV_BACKUP_PIPEDREAM_MEDIA_UPLOAD_FAILED',502);
  return{id:clean(payload.id,300),name:clean(payload.name,300)||name};
}

async function pipedreamDriveProxyUpload({pd,name,content,folderId=null,mimeType='application/json',fetchImpl=fetch}){
  void folderId;
  return pipedreamDriveProxyCreateMedia({
    pd,name,body:String(content??''),mimeType,fetchImpl,
  });
}

async function pipedreamDriveProxyUploadBody({
  pd,name,body,byteLength=0,folderId=null,mimeType='application/json',fetchImpl=fetch,
}){
  void folderId;
  let uploadBody=body;
  let pump=null;
  const length=Number(byteLength||0);
  if(
    Number.isSafeInteger(length)&&length>0
    && typeof globalThis.FixedLengthStream==='function'
    && body&&typeof body.pipeTo==='function'
  ){
    const fixed=new globalThis.FixedLengthStream(length);
    pump=body.pipeTo(fixed.writable);
    uploadBody=fixed.readable;
  }
  try{
    const created=await pipedreamDriveProxyCreateMedia({
      pd,name,body:uploadBody,mimeType,fetchImpl,
    });
    if(pump)await pump;
    return created;
  }catch(error){
    if(pump)await pump.catch(()=>{});
    throw error;
  }
}

async function pipedreamDriveProxyReadBytes({pd,fileId,fetchImpl=fetch,allowNotFound=false}){
  const target='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?alt=media';
  const response=await pipedreamDriveProxyResponse({pd,target,fetchImpl,allowNotFound});
  if(allowNotFound&&response.status===404)return null;
  return new Uint8Array(await response.arrayBuffer());
}

async function pipedreamDriveProxyRead({pd,fileId,fetchImpl=fetch,allowNotFound=false}){
  const bytes=await pipedreamDriveProxyReadBytes({pd,fileId,fetchImpl,allowNotFound});
  if(bytes===null)return null;
  return new TextDecoder().decode(bytes);
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

function driveFailureCode(prefix,response,payload={}){
  const reasons=new Set();
  const error=payload?.error||{};
  if(error?.status)reasons.add(clean(error.status,120));
  for(const row of Array.isArray(error?.errors)?error.errors:[]){
    if(row?.reason)reasons.add(clean(row.reason,120));
  }
  for(const row of Array.isArray(error?.details)?error.details:[]){
    if(row?.reason)reasons.add(clean(row.reason,120));
  }
  const normalized=[...reasons].map(value=>String(value).toUpperCase());
  if(response?.status===403&&normalized.some(value=>value==='SERVICE_DISABLED'||value==='ACCESSNOTCONFIGURED')){
    return'SOV_BACKUP_GOOGLE_DRIVE_API_DISABLED';
  }
  if(response?.status===403&&normalized.some(value=>value.includes('INSUFFICIENT')||value==='PERMISSION_DENIED')){
    return'SOV_BACKUP_GOOGLE_DRIVE_PERMISSION_DENIED';
  }
  if(response?.status===403&&normalized.some(value=>value.includes('QUOTA'))){
    return'SOV_BACKUP_GOOGLE_DRIVE_QUOTA_EXCEEDED';
  }
  return prefix+':'+String(response?.status||0);
}

async function driveCreateMetadata({token,name,folderId=null,fetchImpl=fetch}){
  const metadata={name,mimeType:'application/json',appProperties:{mel_role:'sovereignty-backup-restore'}};
  if(folderId)metadata.parents=[folderId];
  const response=await fetchImpl('https://www.googleapis.com/drive/v3/files?fields=id,name,createdTime',{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=utf-8'},
    body:JSON.stringify(metadata),
    redirect:'manual',
    signal:AbortSignal.timeout(20000),
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.id)fail(driveFailureCode('SOV_BACKUP_DRIVE_CREATE_FAILED',response,payload),502);
  return{id:clean(payload.id,300),name:clean(payload.name,300)||name};
}

async function driveWriteMedia({token,fileId,body,byteLength=0,fetchImpl=fetch}){
  let uploadBody=body;
  let pump=null;
  const length=Number(byteLength||0);
  if(Number.isSafeInteger(length)&&length>0&&typeof globalThis.FixedLengthStream==='function'&&body&&typeof body.pipeTo==='function'){
    const fixed=new globalThis.FixedLengthStream(length);
    pump=body.pipeTo(fixed.writable);
    uploadBody=fixed.readable;
  }
  try{
    const response=await fetchImpl(
      'https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(fileId)+'?uploadType=media&fields=id,name',
      {
        method:'PATCH',
        headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
        body:uploadBody,
        redirect:'manual',
        signal:AbortSignal.timeout(30000),
      },
    );
    const payload=await response.json().catch(()=>({}));
    if(!response.ok||!payload?.id)fail(driveFailureCode('SOV_BACKUP_DRIVE_MEDIA_UPLOAD_FAILED',response,payload),502);
    if(pump)await pump;
    return{id:clean(payload.id,300),name:clean(payload.name,300)||null};
  }catch(error){
    if(pump)await pump.catch(()=>{});
    throw error;
  }
}

async function driveReadBytes({token,fileId,fetchImpl=fetch,allowNotFound=false}){
  let response;
  try{
    response=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{
      method:'GET',
      headers:{authorization:`Bearer ${token}`},
      redirect:'follow',
      signal:AbortSignal.timeout(30000),
    });
  }catch(error){
    const name=clean(error?.name,120).toUpperCase();
    if(name==='TIMEOUTERROR'||name==='ABORTERROR')fail('SOV_BACKUP_DRIVE_READ_TIMEOUT',503);
    fail('SOV_BACKUP_DRIVE_READ_NETWORK_FAILED',503);
  }
  if(allowNotFound&&response.status===404)return null;
  if(!response.ok){
    const payload=await response.clone().json().catch(()=>({}));
    fail(driveFailureCode('SOV_BACKUP_DRIVE_READ_FAILED',response,payload),502);
  }
  try{return new Uint8Array(await response.arrayBuffer());}
  catch(error){
    const name=clean(error?.name,120).toUpperCase();
    if(name==='TIMEOUTERROR'||name==='ABORTERROR')fail('SOV_BACKUP_DRIVE_READ_BODY_TIMEOUT',503);
    fail('SOV_BACKUP_DRIVE_READ_BODY_FAILED',503);
  }
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
  if(!response.ok||!payload?.id)fail(driveFailureCode('SOV_BACKUP_DRIVE_UPLOAD_FAILED',response,payload),502);
  return{id:clean(payload.id,300),name:clean(payload.name,300)||name,created_time:clean(payload.createdTime,100)||null};
}

async function driveRead({token,fileId,fetchImpl=fetch,allowNotFound=false}){
  let response;
  try{
    response=await fetchImpl(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,{
      method:'GET',
      headers:{authorization:`Bearer ${token}`},
      redirect:'follow',
      signal:AbortSignal.timeout(30000),
    });
  }catch(error){
    const name=clean(error?.name,120).toUpperCase();
    if(name==='TIMEOUTERROR'||name==='ABORTERROR')fail('SOV_BACKUP_DRIVE_READ_TIMEOUT',503);
    fail('SOV_BACKUP_DRIVE_READ_NETWORK_FAILED',503);
  }
  if(allowNotFound&&response.status===404)return null;
  if(!response.ok){
    const payload=await response.clone().json().catch(()=>({}));
    fail(driveFailureCode('SOV_BACKUP_DRIVE_READ_FAILED',response,payload),502);
  }
  try{return await response.text();}
  catch(error){
    const name=clean(error?.name,120).toUpperCase();
    if(name==='TIMEOUTERROR'||name==='ABORTERROR')fail('SOV_BACKUP_DRIVE_READ_BODY_TIMEOUT',503);
    fail('SOV_BACKUP_DRIVE_READ_BODY_FAILED',503);
  }
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

export async function loadLatestEncryptedSystemBackupSource(env={}){
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
  if(!object)fail('SOV_BACKUP_R2_OBJECT_MISSING',409);
  let body=object.body||null;
  let byte_length=Number(object.size||0);
  if(!body&&typeof object.arrayBuffer==='function'){
    const bytes=new Uint8Array(await object.arrayBuffer());
    body=bytes;
    byte_length=bytes.byteLength;
  }else if(!body&&typeof object.text==='function'){
    const text=await object.text();
    body=text;
    byte_length=new TextEncoder().encode(text).byteLength;
  }
  if(!body)fail('SOV_BACKUP_R2_BODY_MISSING',409);
  return{
    snapshot_id:clean(row.id,160),
    object_key:clean(row.object_key,500),
    byte_length:Number.isFinite(byte_length)&&byte_length>=0?byte_length:0,
    body,
  };
}

async function readR2ObjectBytes(env,key){
  if(!env?.MEDIA_BUCKET?.get)fail('SOV_BACKUP_R2_REQUIRED',503);
  const object=await env.MEDIA_BUCKET.get(key);
  if(!object)fail('SOV_BACKUP_R2_OBJECT_MISSING',409);
  if(typeof object.arrayBuffer==='function')return new Uint8Array(await object.arrayBuffer());
  if(typeof object.text==='function')return new TextEncoder().encode(await object.text());
  fail('SOV_BACKUP_R2_BODY_MISSING',409);
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

const BACKUP_RESTORE_STAGE_PREFIX='sovereignty/backup-restore-prevalidation';

function backupRestoreStageKey(sourceSha){
  return BACKUP_RESTORE_STAGE_PREFIX+'/'+String(sourceSha||'').toLowerCase()+'.json';
}

async function readBackupRestoreStage(env,sourceSha){
  if(!env?.MEDIA_BUCKET?.get)fail('SOV_BACKUP_R2_REQUIRED',503);
  const body=await env.MEDIA_BUCKET.get(backupRestoreStageKey(sourceSha));
  if(!body)return null;
  try{return JSON.parse(await body.text());}
  catch{fail('SOV_BACKUP_STAGE_INVALID',409);}
}

async function writeBackupRestoreStage(env,sourceSha,state){
  if(!env?.MEDIA_BUCKET?.put)fail('SOV_BACKUP_R2_REQUIRED',503);
  await env.MEDIA_BUCKET.put(
    backupRestoreStageKey(sourceSha),
    JSON.stringify({...state,secret_values_exposed:false}),
    {httpMetadata:{contentType:'application/json'}},
  );
}

function stagedProofFromState(state,now=Date.now()){
  return Object.freeze({
    ok:true,
    status:'GOOGLE_DRIVE_BACKUP_RESTORE_PREVALIDATED',
    provider:state.provider||'google-drive',
    snapshot_id:state.snapshot_id,
    drive_file_id:state.drive_file_id,
    drive_name:state.drive_name,
    ciphertext_sha256:state.ciphertext_sha256,
    readback_sha256:state.readback_sha256,
    encrypted:true,
    readback_verified:state.readback_verified===true,
    restore_verified:state.restore_verified===true,
    restore_code:state.restore_code||'RESTORE_CANDIDATE_VERIFIED',
    rollback_verified:state.rollback_verified===true,
    export_verified:true,
    import_verified:true,
    activation_semantics_verified:true,
    activation_performed:false,
    production_mutation:false,
    source_sha:state.source_sha,
    verified_at:new Date(now).toISOString(),
    evidence_ref:'google-drive:'+String(state.provider||'direct')+':file:'+state.drive_file_id
      +';sha256:'+state.readback_sha256+';snapshot:'+state.snapshot_id,
    secret_values_exposed:false,
  });
}

async function runPipedreamBackupRestoreStage(env,{
  stage,sourceSha,now=Date.now(),fetchImpl=fetch,
  loadBackupSource=loadLatestEncryptedSystemBackupSource,
  resolvePipedreamDrive=pipedreamDriveContext,
  resolveNativeDrive=nativeGoogleDriveContext,
  candidateStore,registryStore,
}={}){
  const source_sha=clean(sourceSha||env.MEL_DEPLOYED_GIT_SHA,80).toLowerCase();
  if(!/^[a-f0-9]{40}$/.test(source_sha))fail('SOV_BACKUP_SOURCE_SHA_REQUIRED',409);
  if(!['resolve','prepare','readback','rollback','finalize'].includes(stage))fail('SOV_BACKUP_STAGE_INVALID',400);

  let state=await readBackupRestoreStage(env,source_sha);

  if(stage==='resolve'){
    if(
      state?.resolved===true
      && state?.source_sha===source_sha
      && state?.provider==='google-drive-oauth'
    ){
      const native=await resolveNativeDrive(env,{fetchImpl});
      if(!native)fail('SOV_BACKUP_GOOGLE_DRIVE_RECONSENT_REQUIRED',409);
      return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_RESOLVED',stage,provider:state.provider,secret_values_exposed:false};
    }
    const native=await resolveNativeDrive(env,{fetchImpl});
    // The exact-SHA staged release proof must use MEL's native Google OAuth
    // grant. Pipedream Drive writes have repeatedly failed with HTTP 403 in
    // production, so silently falling back would only hide a missing drive.file
    // consent behind a transport error.
    if(!native)fail('SOV_BACKUP_GOOGLE_DRIVE_RECONSENT_REQUIRED',409);
    const switchingProvider=Boolean(
      state?.source_sha===source_sha
      && state?.provider
      && state.provider!=='google-drive-oauth'
    );
    state={
      ...(state?.source_sha===source_sha&&!switchingProvider?state:{}),
      schema:'mel.sov-backup-restore-stage/v4',
      source_sha,
      provider:'google-drive-oauth',
      pd_account_id:null,
      pd_project_id:null,
      pd_environment:null,
      resolved:true,
      resolved_at:new Date(now).toISOString(),
      updated_at:new Date(now).toISOString(),
    };
    await writeBackupRestoreStage(env,source_sha,state);
    return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_RESOLVED',stage,provider:state.provider,secret_values_exposed:false};
  }

  if(!state?.resolved||state?.source_sha!==source_sha||!state?.provider){
    fail('SOV_BACKUP_STAGE_RESOLVE_REQUIRED',409);
  }

  const native=state.provider==='google-drive-oauth'&&stage!=='finalize'
    ? await resolveNativeDrive(env,{fetchImpl}) : null;
  const pd=state.provider==='google-drive-via-pipedream'&&stage!=='finalize'
    ? await resolvePipedreamDrive(env,{fetchImpl,accountId:state.pd_account_id}) : null;
  if(stage!=='finalize'&&state.provider==='google-drive-oauth'&&!native)fail('SOV_BACKUP_GOOGLE_DRIVE_RECONSENT_REQUIRED',409);
  if(stage!=='finalize'&&state.provider==='google-drive-via-pipedream'&&!pd)fail('SOV_BACKUP_PIPEDREAM_DRIVE_REQUIRED',409);

  if(stage==='prepare'){
    if(state.prepared===true&&state.drive_file_id&&state.source_object_key){
      return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_PREPARED',stage,provider:state.provider,snapshot_id:state.snapshot_id,secret_values_exposed:false};
    }
    const backup=await loadBackupSource(env);
    if(!backup?.snapshot_id||!backup?.object_key)fail('SOV_BACKUP_SOURCE_REQUIRED',409);
    const name=`MEL-SOV-01-${backup.snapshot_id}-${source_sha.slice(0,12)}.enc.json`;
    let created;
    if(native){
      created=await driveCreateMetadata({
        token:native.token,name,folderId:driveFolder(env),fetchImpl,
      });
      try{
        const written=await driveWriteMedia({
          token:native.token,fileId:created.id,body:backup.body,
          byteLength:backup.byte_length,fetchImpl,
        });
        created={...created,name:written.name||created.name};
      }catch(error){
        await driveDelete({token:native.token,fileId:created.id,fetchImpl}).catch(()=>{});
        throw error;
      }
    }else{
      const ticket=await createSovBackupDownloadTicket(env,{
        objectKey:backup.object_key,sourceSha:source_sha,byteLength:backup.byte_length,now,
      });
      created=await pipedreamDriveActionUploadUrl({
        pd,name,fileUrl:ticket.url,mimeType:'application/json',fetchImpl,
      });
    }
    Object.assign(state,{
      snapshot_id:backup.snapshot_id,
      source_object_key:backup.object_key,
      source_byte_length:Number(backup.byte_length||0),
      drive_file_id:created.id,
      drive_name:created.name||name,
      ciphertext_sha256:null,
      prepared:true,
      readback_verified:false,
      restore_verified:false,
      rollback_verified:false,
      prepared_at:new Date(now).toISOString(),
      updated_at:new Date(now).toISOString(),
    });
    await writeBackupRestoreStage(env,source_sha,state);
    return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_PREPARED',stage,provider:state.provider,snapshot_id:state.snapshot_id,secret_values_exposed:false};
  }

  if(!state?.prepared||!state?.drive_file_id||!state?.source_object_key){
    fail('SOV_BACKUP_STAGE_PREPARE_REQUIRED',409);
  }

  if(stage==='readback'){
    if(state.readback_verified===true&&state.restore_verified===true){
      return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_READBACK_VERIFIED',stage,provider:state.provider,snapshot_id:state.snapshot_id,secret_values_exposed:false};
    }
    const sourceBytes=await readR2ObjectBytes(env,state.source_object_key);
    if(Number(state.source_byte_length||0)>0&&sourceBytes.byteLength!==Number(state.source_byte_length)){
      fail('SOV_BACKUP_SOURCE_LENGTH_MISMATCH',409);
    }
    const ciphertext_sha256=await sha256Hex(sourceBytes);
    const readbackBytes=native
      ? await driveReadBytes({token:native.token,fileId:state.drive_file_id,fetchImpl})
      : await pipedreamDriveProxyReadBytes({pd,fileId:state.drive_file_id,fetchImpl});
    if(Number(state.source_byte_length||0)>0&&readbackBytes.byteLength!==Number(state.source_byte_length)){
      fail('SOV_BACKUP_DRIVE_READBACK_LENGTH_MISMATCH',409);
    }
    const readback_sha256=await sha256Hex(readbackBytes);
    if(readback_sha256!==ciphertext_sha256)fail('SOV_BACKUP_DRIVE_READBACK_INTEGRITY_MISMATCH',409);
    const readback=new TextDecoder().decode(readbackBytes);
    let envelope;
    try{envelope=JSON.parse(readback);}catch{fail('SOV_BACKUP_DRIVE_READBACK_JSON_INVALID',409);}
    if(envelope?.schema!==ENCRYPTED_BACKUP_SCHEMA)fail('SOV_BACKUP_DRIVE_READBACK_SCHEMA_INVALID',409);
    const snapshot=await createEnvBackupEncryptionCodec(env).open(envelope);
    const restore=await verifyRestoreCandidate(snapshot);
    if(restore?.ok!==true)fail(restore?.code||'SOV_BACKUP_RESTORE_DRILL_FAILED',409);
    if(String(snapshot.id||'')!==String(state.snapshot_id||''))fail('SOV_BACKUP_RESTORE_SNAPSHOT_MISMATCH',409);
    Object.assign(state,{
      ciphertext_sha256,readback_sha256,readback_verified:true,restore_verified:true,
      restore_code:restore.code||'RESTORE_CANDIDATE_VERIFIED',
      readback_verified_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString(),
    });
    await writeBackupRestoreStage(env,source_sha,state);
    return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_READBACK_VERIFIED',stage,provider:state.provider,snapshot_id:state.snapshot_id,secret_values_exposed:false};
  }

  if(stage==='rollback'){
    if(state.readback_verified!==true||state.restore_verified!==true)fail('SOV_BACKUP_STAGE_READBACK_REQUIRED',409);
    if(state.rollback_verified===true){
      return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_ROLLBACK_VERIFIED',stage,provider:state.provider,snapshot_id:state.snapshot_id,secret_values_exposed:false};
    }
    let probe;
    let afterDelete;
    if(native){
      probe=await driveUpload({
        token:native.token,
        name:`MEL-SOV-01-rollback-probe-${crypto.randomUUID()}.json`,
        content:JSON.stringify({schema:'mel.sov-backup-rollback-probe/v1',source_sha}),
        folderId:driveFolder(env),fetchImpl,
      });
      await driveDelete({token:native.token,fileId:probe.id,fetchImpl});
      afterDelete=await driveRead({token:native.token,fileId:probe.id,fetchImpl,allowNotFound:true});
    }else{
      probe=await pipedreamDriveActionCreateText({
        pd,
        name:`MEL-SOV-01-rollback-probe-${crypto.randomUUID()}.txt`,
        content:JSON.stringify({schema:'mel.sov-backup-rollback-probe/v1',source_sha}),
        fetchImpl,
      });
      await pipedreamDriveActionDelete({pd,fileId:probe.id,fetchImpl});
      afterDelete=await pipedreamDriveProxyRead({pd,fileId:probe.id,fetchImpl,allowNotFound:true});
    }
    if(afterDelete!==null)fail('SOV_BACKUP_DRIVE_ROLLBACK_NOT_CONFIRMED',409);
    Object.assign(state,{rollback_verified:true,rollback_verified_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()});
    await writeBackupRestoreStage(env,source_sha,state);
    return{ok:true,skipped:false,status:'BACKUP_RESTORE_STAGE_ROLLBACK_VERIFIED',stage,provider:state.provider,snapshot_id:state.snapshot_id,secret_values_exposed:false};
  }

  if(state.readback_verified!==true||state.restore_verified!==true||state.rollback_verified!==true){
    fail('SOV_BACKUP_STAGE_EVIDENCE_INCOMPLETE',409);
  }
  const proof=stagedProofFromState(state,now);
  const validation=await validateSovereigntyCandidates({
    candidateStore,registryStore,env,now,limit:1,
    resolveCandidate:async candidate=>{
      if(candidate.layer!=='backup_restore'||candidate.id!==GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID)return{descriptor:null,adapter:null};
      const d=descriptor({
        pipedream:state.provider==='google-drive-via-pipedream',
        nativeOauth:state.provider==='google-drive-oauth',
      });
      return{descriptor:d,adapter:Object.freeze({id:d.adapter_id,provider:d.provider}),env,prevalidated:true,proof};
    },
  });
  if(validation.prevalidated<1)fail('SOV_BACKUP_STAGE_FINALIZE_FAILED',409);
  Object.assign(state,{finalized:true,finalized_at:new Date(now).toISOString(),updated_at:new Date(now).toISOString()});
  await writeBackupRestoreStage(env,source_sha,state);
  return{
    ok:true,skipped:false,status:'BACKUP_RESTORE_SOVEREIGNTY_ADVANCED',stage,
    processed:validation.processed,prevalidated:validation.prevalidated,blocked:validation.blocked,
    results:validation.results,
    proof:{
      provider:proof.provider,snapshot_id:proof.snapshot_id,ciphertext_sha256:proof.ciphertext_sha256,
      readback_verified:true,restore_verified:true,rollback_verified:true,source_sha:proof.source_sha,
      evidence_ref:proof.evidence_ref,secret_values_exposed:false,
    },
  };
}

function descriptor({pipedream=false,nativeOauth=false}={}){
  return{
    id:GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID,
    provider:pipedream?'google-drive-via-pipedream':nativeOauth?'google-drive-oauth':'google-drive',
    adapter_id:'google-drive-backup-restore-v1',
    added_cost_eur:0,
    required_config_refs:['MEL_BACKUP_ENCRYPTION_KEY_ID'],
    required_secret_refs:pipedream||nativeOauth
      ? ['MEL_BACKUP_ENCRYPTION_KEY_B64']
      : ['GOOGLE_DRIVE_ACCESS_TOKEN','MEL_BACKUP_ENCRYPTION_KEY_B64'],
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
  loadBackupSource=loadLatestEncryptedSystemBackupSource,
  resolvePipedreamDrive=pipedreamDriveContext,
  resolveNativeDrive=nativeGoogleDriveContext,
  stage='all',
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

  if(stage!=='all'){
    return runPipedreamBackupRestoreStage(env,{
      stage,sourceSha:sourceSha||env.MEL_DEPLOYED_GIT_SHA,now,fetchImpl,loadBackupSource,
      resolvePipedreamDrive,resolveNativeDrive,candidateStore:scopedStore,registryStore:registry,
    });
  }

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
