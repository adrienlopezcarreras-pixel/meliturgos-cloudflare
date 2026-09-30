import { DatabaseAdapter } from './database-adapter.js';
import { ObjectStorageAdapter } from './object-storage-adapter.js';

function fail(code,status=503){
  const error=new Error(code);
  error.code=code;
  error.status=status;
  throw error;
}

function clean(value,max=300){
  return String(value??'').trim().slice(0,max);
}

function bytes(value){
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  return new TextEncoder().encode(String(value??''));
}

async function sha256Hex(value){
  const digest=await crypto.subtle.digest('SHA-256',bytes(value));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

/**
 * Proves an independent backup/restore path on the paired Companion without
 * mutating production data:
 * scratch DB export -> independent object storage -> readback -> scratch DB
 * restore -> smoke read -> transaction rollback -> cleanup.
 */
export async function proveCompanionBackupRestoreAlternative({
  storageAdapter,
  sourceDatabaseAdapter,
  restoreDatabaseAdapter,
  sourceSha='',
  now=Date.now(),
}={}){
  if(!(storageAdapter instanceof ObjectStorageAdapter))fail('BACKUP_RESTORE_STORAGE_ADAPTER_REQUIRED',400);
  if(!(sourceDatabaseAdapter instanceof DatabaseAdapter))fail('BACKUP_RESTORE_SOURCE_DATABASE_ADAPTER_REQUIRED',400);
  if(!(restoreDatabaseAdapter instanceof DatabaseAdapter))fail('BACKUP_RESTORE_TARGET_DATABASE_ADAPTER_REQUIRED',400);

  const [storageHealth,sourceHealth,restoreHealth]=await Promise.all([
    storageAdapter.health(),
    sourceDatabaseAdapter.health(),
    restoreDatabaseAdapter.health(),
  ]);
  if(storageHealth?.ok===false)fail('BACKUP_RESTORE_STORAGE_UNHEALTHY');
  if(sourceHealth?.ok===false)fail('BACKUP_RESTORE_SOURCE_DATABASE_UNHEALTHY');
  if(restoreHealth?.ok===false)fail('BACKUP_RESTORE_TARGET_DATABASE_UNHEALTHY');

  const nonce=crypto.randomUUID().replaceAll('-','').slice(0,16);
  const table='mel_backup_restore_probe_'+nonce;
  const sentinel='MEL_BACKUP_RESTORE_OK_'+nonce;
  const objectKey='mel-sovereignty-backup-restore/'+nonce+'.json';

  let sourceTx=null;
  let restoreTx=null;
  try{
    sourceTx=await sourceDatabaseAdapter.begin();
    if(!sourceTx)fail('BACKUP_RESTORE_SOURCE_BEGIN_FAILED');
    await sourceDatabaseAdapter.execute({
      tx:sourceTx,
      sql:`CREATE TABLE ${table}(id TEXT PRIMARY KEY,value TEXT NOT NULL)`,
      params:[],
    });
    await sourceDatabaseAdapter.execute({
      tx:sourceTx,
      sql:`INSERT INTO ${table}(id,value) VALUES(?,?)`,
      params:['probe',sentinel],
    });
    const exported=await sourceDatabaseAdapter.exportLogical({tx:sourceTx,tables:[table]});
    if(exported?.ok!==true||!exported.snapshot)fail('BACKUP_RESTORE_EXPORT_FAILED');
    await sourceDatabaseAdapter.rollback(sourceTx);
    sourceTx=null;

    const payload=new TextEncoder().encode(JSON.stringify(exported.snapshot));
    const expectedSha=await sha256Hex(payload);
    const stored=await storageAdapter.put({
      key:objectKey,
      bytes:payload,
      content_type:'application/json',
    });
    if(stored?.ok!==true)fail('BACKUP_RESTORE_STORAGE_WRITE_FAILED');

    const readback=await storageAdapter.get({key:objectKey});
    if(readback?.ok!==true||readback?.bytes==null)fail('BACKUP_RESTORE_STORAGE_READ_FAILED');
    const readbackBytes=bytes(readback.bytes);
    if(await sha256Hex(readbackBytes)!==expectedSha)fail('BACKUP_RESTORE_STORAGE_INTEGRITY_FAILED');

    let snapshot;
    try{snapshot=JSON.parse(new TextDecoder().decode(readbackBytes));}
    catch{fail('BACKUP_RESTORE_SNAPSHOT_INVALID');}

    restoreTx=await restoreDatabaseAdapter.begin();
    if(!restoreTx)fail('BACKUP_RESTORE_TARGET_BEGIN_FAILED');
    const imported=await restoreDatabaseAdapter.importLogical({tx:restoreTx,snapshot});
    if(imported?.ok!==true)fail('BACKUP_RESTORE_IMPORT_FAILED');
    const restored=await restoreDatabaseAdapter.query({
      tx:restoreTx,
      sql:`SELECT id,value FROM ${table} WHERE id=?`,
      params:['probe'],
    });
    if(restored?.ok!==true||restored.rows?.[0]?.value!==sentinel)fail('BACKUP_RESTORE_SMOKE_FAILED');
    if((await restoreDatabaseAdapter.commit(restoreTx))?.ok!==true)fail('BACKUP_RESTORE_COMMIT_FAILED');
    restoreTx=null;

    const rollbackTx=await restoreDatabaseAdapter.begin();
    await restoreDatabaseAdapter.execute({
      tx:rollbackTx,
      sql:`UPDATE ${table} SET value=? WHERE id=?`,
      params:['MUTATED','probe'],
    });
    if((await restoreDatabaseAdapter.rollback(rollbackTx))?.ok!==true)fail('BACKUP_RESTORE_ROLLBACK_FAILED');

    const verifyTx=await restoreDatabaseAdapter.begin();
    const afterRollback=await restoreDatabaseAdapter.query({
      tx:verifyTx,
      sql:`SELECT id,value FROM ${table} WHERE id=?`,
      params:['probe'],
    });
    if(afterRollback?.ok!==true||afterRollback.rows?.[0]?.value!==sentinel)fail('BACKUP_RESTORE_ROLLBACK_VERIFY_FAILED');
    await restoreDatabaseAdapter.execute({tx:verifyTx,sql:`DROP TABLE ${table}`,params:[]});
    if((await restoreDatabaseAdapter.commit(verifyTx))?.ok!==true)fail('BACKUP_RESTORE_CLEANUP_COMMIT_FAILED');

    if((await storageAdapter.deleteObject({key:objectKey}))?.ok!==true)fail('BACKUP_RESTORE_STORAGE_CLEANUP_FAILED');
    const deleted=await storageAdapter.get({key:objectKey});
    if(deleted?.found!==false&&deleted?.status!=='NOT_FOUND')fail('BACKUP_RESTORE_STORAGE_DELETE_VERIFY_FAILED');

    const verifiedAt=new Date(now).toISOString();
    return Object.freeze({
      ok:true,
      status:'BACKUP_RESTORE_ALTERNATIVE_VERIFIED',
      provider:'local-companion-backup-restore',
      storage_adapter_id:storageAdapter.id,
      source_database_adapter_id:sourceDatabaseAdapter.id,
      restore_database_adapter_id:restoreDatabaseAdapter.id,
      export:true,
      independent_storage_roundtrip:true,
      integrity:true,
      import:true,
      smoke:true,
      rollback:true,
      cleanup:true,
      checksum:expectedSha,
      evidence_ref:`runtime://companion-backup-restore/${nonce}/${verifiedAt}`,
      source_sha:/^[0-9a-f]{40}$/i.test(clean(sourceSha,80))?clean(sourceSha,80).toLowerCase():null,
      production_mutation:false,
    });
  }catch(error){
    if(sourceTx)await sourceDatabaseAdapter.rollback(sourceTx).catch(()=>{});
    if(restoreTx)await restoreDatabaseAdapter.rollback(restoreTx).catch(()=>{});
    throw error;
  }
}
