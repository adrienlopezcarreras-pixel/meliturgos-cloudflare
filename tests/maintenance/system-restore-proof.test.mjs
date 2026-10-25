import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createVerifiedBackupService} from '../../src/backup/backup-service.js';
import {proveSystemSnapshotRestore} from '../../release-tools/predeploy-backup-refresh/system-restore-proof.mjs';
async function fixture({bytes=true,missing=false}={}) {
 const data=Buffer.from('real isolated media bytes');
 const descriptor={key:'../private/media',backup_key:'backups/system/r2-bytes/test/a',size:data.length,sha256:createHash('sha256').update(data).digest('hex')};
 const exports={
 database:{type:'MEL_D1_LOGICAL_EXPORT_V1',tableCount:3,tables:['evolution_ledger','conversations','dev_jobs'].map(name=>({name,schema:`CREATE TABLE ${name}(${name==='evolution_ledger'?'event_id':'id'} TEXT PRIMARY KEY)`,rowCount:1,rows:[{[name==='evolution_ledger'?'event_id':'id']:'preserve'}]}))},
 r2_inventory:{type:'MEL_R2_INVENTORY_V1',objectCount:1,objects:[{key:descriptor.key,size:data.length,etag:'fixture'}]},
 runtime:{type:'MEL_RUNTIME_DESCRIPTOR_V1',appVersion:'test',worker:'meliturgos',deployedGitSha:'a'.repeat(40)},
 };
 if(bytes)exports.r2_objects={type:'MEL_R2_BYTE_BACKUP_V1',objectCount:missing?0:1,totalBytes:missing?0:data.length,objects:missing?[]:[descriptor]};
 let snapshot;
 const service=createVerifiedBackupService({sources:Object.fromEntries(Object.entries(exports).map(([key,value])=>[key,async()=>value])),storage:{put:async value=>{snapshot=value;},get:async()=>snapshot}});
 await service.create({id:'system-20261025063233609'});
 return {snapshot,data};
}
test('combined proof actually restores SQL and filesystem bytes, exposes no content or keys',async()=>{
 const {snapshot,data}=await fixture();let reads=0;
 const proof=await proveSystemSnapshotRestore(snapshot,{get:async()=>{reads++;return {arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}});
 assert.equal(proof.status,'ISOLATED_RESTORE_VERIFIED');assert.equal(proof.database.row_count,3);
 assert.equal(proof.r2.object_count,1);assert.equal(reads,1);assert.equal(proof.production_written,false);assert.equal(proof.cleanup_authorized,false);
 assert.doesNotMatch(JSON.stringify(proof),/private|real isolated media bytes/);
});
test('inventory alone and incomplete byte coverage cannot pass as a full restore',async()=>{
 for(const options of [{bytes:false},{missing:true}]){
  const {snapshot}=await fixture(options);let calls=0;
  await assert.rejects(proveSystemSnapshotRestore(snapshot,{get:async()=>{calls++;}}),/ISOLATED_R2_(BYTES_MANIFEST_REQUIRED|COVERAGE_INCOMPLETE)/);
  assert.equal(calls,0);
 }
});
test('tampered snapshot, corrupt or absent R2 bytes never yield restoration proof',async()=>{
 const {snapshot,data}=await fixture();
 await assert.rejects(proveSystemSnapshotRestore({...snapshot,sourceCount:999},{get:async()=>null}),/INTEGRITY/);
 await assert.rejects(proveSystemSnapshotRestore(snapshot,{get:async()=>null}),/COPY_MISSING/);
 const corrupt=Buffer.from(data);corrupt[0]^=1;
 await assert.rejects(proveSystemSnapshotRestore(snapshot,{get:async()=>({arrayBuffer:async()=>corrupt})}),/INTEGRITY_MISMATCH/);
});
test('bounded drill refuses download budget excess before accessing source',async()=>{
 const {snapshot}=await fixture();let reads=0;
 await assert.rejects(proveSystemSnapshotRestore(snapshot,{get:async()=>{reads++;}},{maxBytes:1}),/BUDGET_EXCEEDED/);assert.equal(reads,0);
});

test('restore diagnostics retain safe internal codes and stage but redact secrets and paths',async()=>{
 const {isolatedRestoreFailure}=await import('../../release-tools/predeploy-backup-refresh/system-restore-proof.mjs');
 const known=Object.assign(new Error('PRIVATE_DATA'),{code:'BACKUP_DECRYPTION_FAILED'});
 assert.equal(isolatedRestoreFailure(known,'DECRYPT').code,'BACKUP_DECRYPTION_FAILED');
 assert.equal(isolatedRestoreFailure(known,'DECRYPT').stage,'DECRYPT');
 assert.equal(isolatedRestoreFailure(new RangeError('PRIVATE_DATA'),'RESTORE').error_kind,'RangeError');
 for(const error of [new Error('https://private.invalid/token'),Object.assign(new Error('PRIVATE_DATA'),{code:'BACKUP_FAILED:private/path'}),new SyntaxError('PRIVATE_JSON')]){
  const proof=isolatedRestoreFailure(error,'DECRYPT');
  assert.equal(proof.code,'ISOLATED_RESTORE_FAILED');
  assert.equal(proof.ok,false);assert.equal(proof.cleanup_authorized,false);
  assert.doesNotMatch(JSON.stringify(proof),/PRIVATE|private|token/);
 }
});

test('missing-byte proof reports only timestamped snapshot inventory counters, never current-state claims or object keys',async()=>{
 const {snapshot,data}=await fixture({bytes:false});
 const {isolatedRestoreFailure}=await import('../../release-tools/predeploy-backup-refresh/system-restore-proof.mjs');
 let error;
 try{await proveSystemSnapshotRestore(snapshot,{get:async()=>{throw Error('no reads expected');}});}catch(caught){error=caught;}
 const proof=isolatedRestoreFailure(error,'RESTORE');
 assert.equal(proof.code,'ISOLATED_R2_BYTES_MANIFEST_REQUIRED');
 assert.equal(proof.diagnostic.source,'SNAPSHOT_INVENTORY');
 assert.equal(proof.diagnostic.created_at,snapshot.createdAt);
 assert.equal(proof.diagnostic.object_count,1);assert.equal(proof.diagnostic.total_bytes,data.length);
 assert.doesNotMatch(JSON.stringify(proof),/private|current_state/);
 assert.equal(proof.cleanup_authorized,false);
});

test('restore admission matches the approved 10000-object creator limit without accepting missing bytes',async()=>{
 const {snapshot}=await fixture();
 const objects=Array.from({length:7378},(_,i)=>({key:'media/'+i,size:0,sha256:'a'.repeat(64),backup_key:'backups/system/r2-bytes/test/'+i}));
 const exports={...snapshot.exports,
  r2_inventory:{type:'MEL_R2_INVENTORY_V1',objectCount:objects.length,objects:objects.map(x=>({key:x.key,size:x.size,etag:'fixture'}))},
  r2_objects:{type:'MEL_R2_BYTE_BACKUP_V1',objectCount:objects.length,totalBytes:0,objects},
 };
 let large;
 const service=createVerifiedBackupService({sources:Object.fromEntries(Object.entries(exports).map(([key,value])=>[key,async()=>value])),storage:{put:async value=>{large=value;},get:async()=>large}});
 await service.create({id:snapshot.id});let reads=0;
 await assert.rejects(proveSystemSnapshotRestore(large,{get:async()=>{reads++;return null;}}),/BACKUP_R2_COPY_MISSING/);
 assert.equal(reads,1);
});

test('real restore CLI publishes a safe failure annotation without reading R2 or leaking environment secrets',async()=>{
 const {spawnSync}=await import('node:child_process');
 const {mkdtemp,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {fileURLToPath}=await import('node:url');
 const directory=await mkdtemp(join(tmpdir(),'mel-restore-notice-test-'));
 try{
  const script=fileURLToPath(new URL('../../release-tools/predeploy-backup-refresh/isolated-restore-runner.mjs',import.meta.url));
  const result=spawnSync(process.execPath,[script],{cwd:directory,encoding:'utf8',timeout:10000,
   env:{...process.env,GITHUB_ACTIONS:'true',MEL_RESTORE_SNAPSHOT_KEY:'invalid',MEL_BACKUP_ENCRYPTION_KEY_B64:'PRIVATE_SENTINEL'}});
  assert.equal(result.status,1);
  const prefix='::notice title=MEL isolated restore::';
  const line=result.stdout.split('\n').find(x=>x.startsWith(prefix));assert.ok(line);
  const proof=JSON.parse(line.slice(prefix.length));
  assert.equal(proof.code,'ISOLATED_SNAPSHOT_KEY_INVALID');assert.equal(proof.stage,'CONFIGURATION');
  assert.equal(proof.cleanup_authorized,false);assert.equal(proof.production_written,false);
  assert.deepEqual(JSON.parse(await readFile(join(directory,'isolated-restore-proof.json'),'utf8')),proof);
  assert.doesNotMatch(result.stdout+result.stderr,/PRIVATE_SENTINEL/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
