import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createVerifiedBackupService } from '../../src/backup/backup-service.js';
import { createBackupEncryptionCodec } from '../../src/backup/encrypted-backup-storage.js';
import { createAlternativeRegistry } from '../../src/portability/prevalidated-alternative-registry.js';
import {
  GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID,
  proveGoogleDriveBackupRestoreAlternative,
  provePipedreamDriveBackupRestoreAlternative,
  runGoogleDriveBackupRestorePrevalidationRuntime,
} from '../../src/portability/google-drive-backup-restore-prevalidation-runtime.js';

function memoryStorage(){
  const rows=new Map();
  return{
    rows,
    async put(snapshot){rows.set(snapshot.id,structuredClone(snapshot));},
    async get(id){return rows.has(id)?structuredClone(rows.get(id)):null;},
    async list(){return[...rows.values()];},
  };
}

async function snapshotFixture(){
  const storage=memoryStorage();
  const service=createVerifiedBackupService({
    storage,
    now:()=> '2026-10-01T20:45:00.000Z',
    sources:{
      database:async()=>({
        type:'MEL_D1_LOGICAL_EXPORT_V1',
        tableCount:1,
        tables:[{name:'memories',schema:'CREATE TABLE memories(id TEXT)',rowCount:1,rows:[{id:'m1'}]}],
      }),
      r2_inventory:async()=>({
        type:'MEL_R2_INVENTORY_V1',
        objectCount:1,
        objects:[{key:'media/a',size:12,etag:'etag-a',uploaded:null}],
      }),
      runtime:async()=>({
        type:'MEL_RUNTIME_DESCRIPTOR_V1',
        appVersion:'0.6.0',
        dbSchemaVersion:15,
        worker:'meliturgos',
        deployedGitSha:'a'.repeat(40),
        deployedGitBranch:'candidate/mel-clean-autonomy',
      }),
    },
  });
  const created=await service.create({id:'sov-drive-fixture'});
  return storage.rows.get(created.id);
}

function envFixture(){
  const keyBytes=new Uint8Array(32);keyBytes.fill(7);
  return{
    GOOGLE_DRIVE_ACCESS_TOKEN:'test-drive-token',
    MEL_BACKUP_ENCRYPTION_KEY_ID:'test-key-1',
    MEL_BACKUP_ENCRYPTION_KEY_B64:Buffer.from(keyBytes).toString('base64'),
    MEL_DEPLOYED_GIT_SHA:'b'.repeat(40),
    MEL_PUBLIC_ORIGIN:'https://mel.example',
    keyBytes,
  };
}

function driveFetchFixture(encryptedText){
  const calls=[];
  const deleted=new Set();
  let postCount=0;
  const fetchImpl=async(url,init={})=>{
    const method=init.method||'GET';
    calls.push({url:String(url),method});
    if(method==='POST'&&String(url).includes('/upload/drive/v3/files')){
      postCount+=1;
      return Response.json({
        id:postCount===1?'drive-backup-1':'drive-rollback-probe-1',
        name:postCount===1?'backup.enc.json':'rollback.json',
        createdTime:'2026-10-01T20:46:00.000Z',
      });
    }
    if(method==='DELETE'&&String(url).includes('/files/drive-rollback-probe-1')){
      deleted.add('drive-rollback-probe-1');
      return new Response(null,{status:204});
    }
    if(method==='GET'&&String(url).includes('/files/drive-backup-1?alt=media')){
      return new Response(encryptedText,{status:200,headers:{'content-type':'application/json'}});
    }
    if(method==='GET'&&String(url).includes('/files/drive-rollback-probe-1?alt=media')){
      return new Response(deleted.has('drive-rollback-probe-1')?'not found':'{}',{status:deleted.has('drive-rollback-probe-1')?404:200});
    }
    return new Response('unexpected',{status:500});
  };
  return{fetchImpl,calls};
}

function stores(){
  const candidates=[];
  let registry=createAlternativeRegistry([]);
  return{
    candidateStore:{
      async upsertFromWatch(report){
        for(const row of report?.results||[])for(const hint of row?.candidate_hints||[]){
          const existing=candidates.find(item=>item.layer===row.layer&&item.id===hint.id);
          if(!existing)candidates.push({layer:row.layer,id:hint.id,status:'UNVERIFIED',metadata:{}});
          else if(!['PREVALIDATED','REJECTED'].includes(existing.status))existing.status='UNVERIFIED';
        }
        return{ok:true};
      },
      async list({layer=null,status=null,limit=200}={}){
        return candidates.filter(row=>(!layer||row.layer===layer)&&(!status||row.status===status)).slice(0,limit);
      },
      async setStatus({layer,id,status,metadata={}}){
        const row=candidates.find(item=>item.layer===layer&&item.id===id);
        if(row){row.status=status;row.metadata=metadata;}
        return{ok:true,changed:row?1:0};
      },
    },
    registryStore:{
      async load(){return registry;},
      async save(next){registry=next;return{ok:true};},
      get registry(){return registry;},
    },
    candidates,
  };
}

test('MEL-SOV-01 copies encrypted backup to Drive, verifies readback, restore and rollback semantics',async()=>{
  const snapshot=await snapshotFixture();
  const env=envFixture();
  const codec=createBackupEncryptionCodec({keyBytes:env.keyBytes,keyId:env.MEL_BACKUP_ENCRYPTION_KEY_ID});
  const encryptedText=JSON.stringify(await codec.seal(snapshot));
  const drive=driveFetchFixture(encryptedText);

  const proof=await proveGoogleDriveBackupRestoreAlternative({
    env,
    backup:{snapshot_id:snapshot.id,encrypted_text:encryptedText},
    fetchImpl:drive.fetchImpl,
    sourceSha:env.MEL_DEPLOYED_GIT_SHA,
    now:Date.parse('2026-10-01T20:47:00.000Z'),
  });

  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'google-drive');
  assert.equal(proof.encrypted,true);
  assert.equal(proof.readback_verified,true);
  assert.equal(proof.restore_verified,true);
  assert.equal(proof.rollback_verified,true);
  assert.equal(proof.export_verified,true);
  assert.equal(proof.import_verified,true);
  assert.equal(proof.activation_semantics_verified,true);
  assert.equal(proof.activation_performed,false);
  assert.equal(proof.production_mutation,false);
  assert.equal(proof.secret_values_exposed,false);
  assert.equal(proof.ciphertext_sha256,proof.readback_sha256);
  assert.match(proof.ciphertext_sha256,/^[0-9a-f]{64}$/);
  assert.ok(drive.calls.some(row=>row.method==='DELETE'));
});

function pipedreamDriveProxyFixture(encryptedText,{backupId='pd-drive-backup-1'}={}){
  const calls=[];
  const deleted=new Set();
  let creations=0;
  const decodeTarget=url=>{
    const match=String(url).match(/\/proxy\/([^?]+)/);
    if(!match)return'';
    return Buffer.from(match[1].replaceAll('-','+').replaceAll('_','/'),'base64').toString('utf8');
  };
  const fetchImpl=async(url,init={})=>{
    const method=init.method||'GET';
    if(String(url).endsWith('/actions/run')){
      const payload=JSON.parse(String(init.body||'{}'));
      calls.push({target:'action:'+String(payload.id||''),method,body_kind:'action'});
      if(payload.id==='google_drive-upload-file'){
        assert.deepEqual(payload.configured_props.google_drive,{authProvisionId:'apn_drive'});
        assert.match(String(payload.configured_props.filePath||''),/^https:\/\/mel\.example\/api\/internal\/sov-backup-download\?/);
        return Response.json({exports:{$return_value:{id:backupId,name:'backup.enc.json'}}});
      }
      if(payload.id==='google_drive-create-file-from-text'){
        creations+=1;
        return Response.json({exports:{$return_value:{id:'pd-drive-rollback-'+creations,name:'rollback.txt'}}});
      }
      if(payload.id==='google_drive-delete-file'){
        deleted.add(String(payload.configured_props.fileId||''));
        return Response.json({exports:{$return_value:{success:true,fileId:payload.configured_props.fileId}}});
      }
      return Response.json({error:'unexpected-action'},{status:500});
    }
    const target=decodeTarget(url);
    calls.push({target,method,body_kind:init.body?.constructor?.name||typeof init.body});
    if(method==='POST'&&target.includes('/upload/drive/v3/files?uploadType=media')){
      creations+=1;
      const id=creations===1?backupId:'pd-drive-rollback-'+creations;
      return Response.json({id,name:creations===1?'backup.enc.json':'rollback.json'});
    }
    if(method==='GET'&&target.includes('/files/'+backupId+'?alt=media')){
      return new Response(encryptedText,{status:200,headers:{'content-type':'application/json'}});
    }
    const rollbackMatch=target.match(/\/files\/(pd-drive-rollback-\d+)/);
    if(method==='DELETE'&&rollbackMatch){
      deleted.add(rollbackMatch[1]);
      return new Response(null,{status:204});
    }
    if(method==='GET'&&rollbackMatch){
      return deleted.has(rollbackMatch[1])
        ?new Response('not found',{status:404})
        :new Response('{}',{status:200});
    }
    return Response.json({error:'unexpected',target,method},{status:500});
  };
  return{fetchImpl,calls};
}

function stagedBucket(initial={}){
  const objects=new Map(Object.entries(initial));
  const objectFor=value=>{
    const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(String(value));
    return{
      size:bytes.byteLength,
      body:new Blob([bytes]).stream(),
      async arrayBuffer(){return bytes.slice().buffer;},
      async text(){return new TextDecoder().decode(bytes);},
    };
  };
  return{
    objects,
    async get(key){return objects.has(key)?objectFor(objects.get(key)):null;},
    async put(key,value){
      if(value instanceof Uint8Array)objects.set(key,value.slice());
      else objects.set(key,String(value));
    },
  };
}

test('MEL-SOV-01 can prove encrypted backup/restore through the existing Pipedream Google Drive account via raw proxy',async()=>{
  const snapshot=await snapshotFixture();
  const env=envFixture();
  delete env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const codec=createBackupEncryptionCodec({keyBytes:env.keyBytes,keyId:env.MEL_BACKUP_ENCRYPTION_KEY_ID});
  const encryptedText=JSON.stringify(await codec.seal(snapshot));
  const proxy=pipedreamDriveProxyFixture(encryptedText);
  const context={
    owner:'adrien',
    config:{project_id:'proj_demo123',environment:'production'},
    account_id:'apn_drive',
    access_token:'server-token',
  };

  const proof=await provePipedreamDriveBackupRestoreAlternative({
    env,
    backup:{snapshot_id:snapshot.id,encrypted_text:encryptedText},
    fetchImpl:proxy.fetchImpl,
    sourceSha:env.MEL_DEPLOYED_GIT_SHA,
    now:Date.parse('2026-10-01T20:47:30.000Z'),
    context,
  });

  assert.equal(proof.ok,true);
  assert.equal(proof.provider,'google-drive-via-pipedream');
  assert.equal(proof.readback_verified,true);
  assert.equal(proof.restore_verified,true);
  assert.equal(proof.rollback_verified,true);
  assert.equal(proof.ciphertext_sha256,proof.readback_sha256);
  assert.match(proof.evidence_ref,/pipedream-proxy-file/);
  assert.deepEqual(proxy.calls.map(row=>row.method),['POST','GET','POST','DELETE','GET']);
  assert.ok(proxy.calls[0].target.includes('/upload/drive/v3/files?uploadType=media'));
  assert.ok(proxy.calls[1].target.includes('/drive/v3/files/pd-drive-backup-1?alt=media'));
  assert.doesNotMatch(JSON.stringify(proxy.calls),/server-token/);
});

test('MEL-SOV-01 runtime uses Pipedream Drive raw proxy when direct token is absent but linked Drive is healthy',async()=>{
  const snapshot=await snapshotFixture();
  const env=envFixture();
  delete env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const codec=createBackupEncryptionCodec({keyBytes:env.keyBytes,keyId:env.MEL_BACKUP_ENCRYPTION_KEY_ID});
  const encryptedText=JSON.stringify(await codec.seal(snapshot));
  const s=stores();
  const proxy=pipedreamDriveProxyFixture(encryptedText,{backupId:'pd-drive-runtime-1'});

  const result=await runGoogleDriveBackupRestorePrevalidationRuntime(env,{
    now:Date.parse('2026-10-01T20:48:30.000Z'),
    force:true,
    sourceSha:env.MEL_DEPLOYED_GIT_SHA,
    fetchImpl:proxy.fetchImpl,
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    loadBackup:async()=>({snapshot_id:snapshot.id,encrypted_text:encryptedText}),
    resolvePipedreamDrive:async()=>({
      owner:'adrien',
      config:{project_id:'proj_demo123',environment:'production'},
      account_id:'apn_drive',
      access_token:'server-token',
    }),
  });

  assert.equal(result.prevalidated,1);
  assert.equal(result.blocked,0);
  assert.equal(result.proof.provider,'google-drive-via-pipedream');
  const row=s.registryStore.registry.layers.backup_restore.find(item=>item.id===GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID);
  assert.ok(row);
  assert.equal(row.prevalidated,true);
  assert.equal(row.provider,'google-drive-via-pipedream');
});

test('MEL-SOV-01 staged release proof requires native Google Drive OAuth and never falls back to Pipedream writes',async()=>{
  const env=envFixture();
  delete env.GOOGLE_DRIVE_ACCESS_TOKEN;
  env.MEDIA_BUCKET=stagedBucket();
  const s=stores();
  let pipedreamResolved=false;
  let backupLoaded=false;

  await assert.rejects(
    runGoogleDriveBackupRestorePrevalidationRuntime(env,{
      force:true,
      sourceSha:env.MEL_DEPLOYED_GIT_SHA,
      candidateStore:s.candidateStore,
      registryStore:s.registryStore,
      stage:'resolve',
      resolveNativeDrive:async()=>null,
      resolvePipedreamDrive:async()=>{
        pipedreamResolved=true;
        return{
          owner:'adrien',
          config:{project_id:'proj_demo123',environment:'production'},
          account_id:'apn_drive',
          access_token:'server-token',
        };
      },
      loadBackupSource:async()=>{backupLoaded=true;throw new Error('backup must not be loaded');},
    }),
    error=>error?.code==='SOV_BACKUP_GOOGLE_DRIVE_RECONSENT_REQUIRED'&&error?.status===409,
  );

  assert.equal(pipedreamResolved,false);
  assert.equal(backupLoaded,false);
  const persisted=[...env.MEDIA_BUCKET.objects.values()].map(String).join('\n');
  assert.doesNotMatch(persisted,/server-token|access_token|client_secret/i);
});

test('MEL-SOV-01 resolve replaces stale Pipedream stage state with native Google OAuth',async()=>{
  const env=envFixture();
  delete env.GOOGLE_DRIVE_ACCESS_TOKEN;
  env.MEDIA_BUCKET=stagedBucket();
  const s=stores();
  const key='sovereignty/backup-restore-prevalidation/'+env.MEL_DEPLOYED_GIT_SHA+'.json';
  await env.MEDIA_BUCKET.put(key,JSON.stringify({
    schema:'mel.sov-backup-restore-stage/v3',
    source_sha:env.MEL_DEPLOYED_GIT_SHA,
    provider:'google-drive-via-pipedream',
    pd_account_id:'apn_drive',
    pd_project_id:'proj_demo123',
    pd_environment:'production',
    resolved:true,
    secret_values_exposed:false,
  }));
  let pipedreamCalled=false;
  const result=await runGoogleDriveBackupRestorePrevalidationRuntime(env,{
    force:true,
    sourceSha:env.MEL_DEPLOYED_GIT_SHA,
    stage:'resolve',
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    resolveNativeDrive:async()=>({
      owner:'adrien',
      token:'native-drive-token',
      provider:'google-drive-oauth',
      token_source:'shared_google_grant',
    }),
    resolvePipedreamDrive:async()=>{pipedreamCalled=true;return null;},
  });
  assert.equal(result.provider,'google-drive-oauth');
  assert.equal(pipedreamCalled,false);
  const persisted=JSON.parse(String(env.MEDIA_BUCKET.objects.get(key)));
  assert.equal(persisted.provider,'google-drive-oauth');
  assert.equal(persisted.pd_account_id,null);
  assert.equal(persisted.pd_project_id,null);
  assert.equal(JSON.stringify(persisted).includes('native-drive-token'),false);
});

test('MEL-SOV-01 classifies disabled Google Drive API without leaking provider messages',async()=>{
  const env=envFixture();
  delete env.GOOGLE_DRIVE_ACCESS_TOKEN;
  env.MEDIA_BUCKET=stagedBucket();
  const storesFixture=stores();
  const key='sovereignty/backup-restore-prevalidation/'+env.MEL_DEPLOYED_GIT_SHA+'.json';
  await env.MEDIA_BUCKET.put(key,JSON.stringify({
    schema:'mel.sov-backup-restore-stage/v4',
    source_sha:env.MEL_DEPLOYED_GIT_SHA,
    provider:'google-drive-oauth',
    resolved:true,
    secret_values_exposed:false,
  }));

  await assert.rejects(
    runGoogleDriveBackupRestorePrevalidationRuntime(env,{
      force:true,
      sourceSha:env.MEL_DEPLOYED_GIT_SHA,
      stage:'prepare',
      candidateStore:storesFixture.candidateStore,
      registryStore:storesFixture.registryStore,
      resolveNativeDrive:async()=>({
        owner:'adrien',
        token:'native-drive-token',
        provider:'google-drive-oauth',
        token_source:'shared_google_grant',
      }),
      loadBackupSource:async()=>({
        snapshot_id:'snapshot-api-disabled',
        object_key:'backups/system/snapshot-api-disabled.enc.json',
        byte_length:32,
        body:new Blob(['encrypted']).stream(),
      }),
      fetchImpl:async()=>Response.json({
        error:{
          code:403,
          status:'PERMISSION_DENIED',
          errors:[{reason:'accessNotConfigured'}],
          details:[{reason:'SERVICE_DISABLED'}],
          message:'sensitive provider message must not escape',
        },
      },{status:403}),
    }),
    error=>error?.code==='SOV_BACKUP_GOOGLE_DRIVE_API_DISABLED'
      && !String(error?.code||'').includes('sensitive provider message'),
  );
});

test('MEL-SOV-01 finalize accepts a completed native OAuth proof without legacy GOOGLE_DRIVE_ACCESS_TOKEN',async()=>{
  const env=envFixture();
  delete env.GOOGLE_DRIVE_ACCESS_TOKEN;
  env.MEDIA_BUCKET=stagedBucket();
  const s=stores();
  const key='sovereignty/backup-restore-prevalidation/'+env.MEL_DEPLOYED_GIT_SHA+'.json';
  await env.MEDIA_BUCKET.put(key,JSON.stringify({
    schema:'mel.sov-backup-restore-stage/v4',
    source_sha:env.MEL_DEPLOYED_GIT_SHA,
    provider:'google-drive-oauth',
    resolved:true,
    prepared:true,
    snapshot_id:'snapshot-native-oauth',
    source_object_key:'backups/system/native.enc.json',
    source_byte_length:321,
    drive_file_id:'drive-native-1',
    drive_name:'native.enc.json',
    ciphertext_sha256:'a'.repeat(64),
    readback_sha256:'a'.repeat(64),
    readback_verified:true,
    restore_verified:true,
    restore_code:'RESTORE_CANDIDATE_VERIFIED',
    rollback_verified:true,
    secret_values_exposed:false,
  }));

  const result=await runGoogleDriveBackupRestorePrevalidationRuntime(env,{
    force:true,
    sourceSha:env.MEL_DEPLOYED_GIT_SHA,
    stage:'finalize',
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
  });
  assert.equal(result.status,'BACKUP_RESTORE_SOVEREIGNTY_ADVANCED');
  assert.equal(result.prevalidated,1);
  assert.equal(result.proof.provider,'google-drive-oauth');
  const row=s.registryStore.registry.layers.backup_restore.find(item=>item.id===GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID);
  assert.equal(row.prevalidated,true);
  assert.equal(row.provider,'google-drive-oauth');
});

test('MEL-SOV-01 runtime persists fresh backup_restore alternative through canonical validator',async()=>{
  const snapshot=await snapshotFixture();
  const env=envFixture();
  const codec=createBackupEncryptionCodec({keyBytes:env.keyBytes,keyId:env.MEL_BACKUP_ENCRYPTION_KEY_ID});
  const encryptedText=JSON.stringify(await codec.seal(snapshot));
  const drive=driveFetchFixture(encryptedText);
  const s=stores();

  const result=await runGoogleDriveBackupRestorePrevalidationRuntime(env,{
    now:Date.parse('2026-10-01T20:48:00.000Z'),
    force:true,
    sourceSha:env.MEL_DEPLOYED_GIT_SHA,
    fetchImpl:drive.fetchImpl,
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    loadBackup:async()=>({snapshot_id:snapshot.id,encrypted_text:encryptedText}),
  });

  assert.equal(result.prevalidated,1);
  assert.equal(result.blocked,0);
  const candidate=s.candidates.find(row=>row.id===GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID);
  assert.equal(candidate.status,'PREVALIDATED');
  const row=s.registryStore.registry.layers.backup_restore.find(item=>item.id===GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID);
  assert.ok(row);
  assert.equal(row.prevalidated,true);
  assert.equal(row.added_cost_eur,0);
  assert.equal(row.proof.source_sha,env.MEL_DEPLOYED_GIT_SHA);
  assert.equal(row.proof.export,true);
  assert.equal(row.proof.import,true);
  assert.equal(row.proof.rollback,true);
  assert.equal(row.proof.activate,true);
});

test('MEL-SOV-01 fails closed before backup or Drive calls when credential is missing',async()=>{
  const env=envFixture();
  delete env.GOOGLE_DRIVE_ACCESS_TOKEN;
  const s=stores();
  let loaded=false;

  const result=await runGoogleDriveBackupRestorePrevalidationRuntime(env,{
    now:Date.parse('2026-10-01T20:49:00.000Z'),
    force:true,
    sourceSha:env.MEL_DEPLOYED_GIT_SHA,
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    loadBackup:async()=>{loaded=true;throw new Error('should not load');},
  });

  assert.equal(result.prevalidated,0);
  assert.equal(result.blocked,1);
  assert.equal(loaded,false);
  const candidate=s.candidates.find(row=>row.id===GOOGLE_DRIVE_BACKUP_RESTORE_CANDIDATE_ID);
  assert.equal(candidate.status,'BLOCKED');
  assert.equal(candidate.metadata.reason,'CREDENTIAL_REQUIRED');
  assert.deepEqual(candidate.metadata.missing_secrets,['GOOGLE_DRIVE_ACCESS_TOKEN']);
  assert.equal(JSON.stringify(candidate.metadata).includes('test-drive-token'),false);
});

test('release sovereignty proof refreshes backup_restore before reading coverage',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/evolution/release-launch-bootstrap.js',import.meta.url),'utf8');
  assert.match(source,/runGoogleDriveBackupRestorePrevalidationRuntime/);
  assert.match(source,/backup_restore:\s*\(runtimeEnv, options\)/);
  assert.match(source,/await runRefresh\(requestedRefresh, refresher\)/);
  assert.match(source,/sourceSha:\s*deployedSha/);
  assert.match(source,/new Set\(\['resolve','prepare','readback','rollback','finalize'\]\)/);
});


test('MEL-SOV-01 Drive proxy forwards upstream headers with Pipedream proxy prefix and respects proxy timeout',async()=>{
  const source=await readFile(new URL('../../src/portability/google-drive-backup-restore-prevalidation-runtime.js',import.meta.url),'utf8');
  assert.match(source,/'x-pd-proxy-accept':'application\/json, text\/plain, \*\/\*'/);
  assert.match(source,/proxyHeaders\['x-pd-proxy-'\+normalized\]=String\(value\)/);
  assert.match(source,/AbortSignal\.timeout\(30_000\)/);
});
