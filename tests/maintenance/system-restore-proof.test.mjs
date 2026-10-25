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
 r2_inventory:{type:'MEL_R2_INVENTORY_V1',objectCount:1,objects:[{key:descriptor.key,size:data.length}]},
 runtime:{type:'MEL_RUNTIME_DESCRIPTOR_V1',appVersion:'test',worker:'meliturgos',deployedGitSha:'a'.repeat(40)},
 };
 if(bytes)exports.r2_objects={type:'MEL_R2_BYTE_BACKUP_V1',objectCount:missing?0:1,totalBytes:missing?0:data.length,objects:missing?[]:[descriptor]};
 let snapshot;
 const service=createVerifiedBackupService({sources:Object.fromEntries(Object.entries(exports).map(([key,value])=>[key,async()=>value])),storage:{put:async value=>{snapshot=value;},get:async()=>snapshot}});
 await service.create({id:'isolated-fixture'});
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
