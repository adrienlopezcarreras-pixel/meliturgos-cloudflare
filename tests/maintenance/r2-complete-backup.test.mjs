import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{copyBackupR2Object} from '../../release-tools/predeploy-backup-refresh/worker.js';
import {copyR2Inventory} from '../../release-tools/predeploy-backup-refresh/r2-copy.mjs';
const id='system-20261025063233609';
function fixture(){
 const objects=new Map([['media/original',{bytes:new TextEncoder().encode('hello'),etag:'original'}]]);
 const deleted=[];
 const bucket={
  async get(key){const item=objects.get(key);if(!item)return null;return {etag:item.etag,arrayBuffer:async()=>item.bytes.buffer};},
  async put(key,value){objects.set(key,{bytes:new Uint8Array(value),etag:'copied'});},
  async delete(key){deleted.push(key);objects.delete(key);},
 };
 const inventory={objectCount:1,objects:[{key:'media/original',size:5,etag:'original'}]};
 return {bucket,inventory,objects,deleted};
}
test('complete backup coordinator reuses canonical byte copy and preserves original objects',async()=>{
 const {bucket,inventory,objects,deleted}=fixture();
 const manifest=await copyR2Inventory({inventory,snapshotId:id,copyObject:input=>copyBackupR2Object({MEDIA_BUCKET:bucket},input)});
 assert.equal(manifest.objectCount,1);assert.equal(manifest.totalBytes,5);
 assert.equal(manifest.objects[0].key,'media/original');
 assert.match(manifest.objects[0].sha256,/^[a-f0-9]{64}$/);
 assert.deepEqual(objects.get('media/original').bytes,new TextEncoder().encode('hello'));
 assert.deepEqual(deleted,[]);assert.equal(objects.size,2);
});
test('budget and invalid inventory fail before any write or copy request',async()=>{
 const {inventory}=fixture();let calls=0;
 await assert.rejects(copyR2Inventory({inventory,snapshotId:id,maxBytes:4,copyObject:async()=>{calls++;}}),/BUDGET_EXCEEDED/);
 await assert.rejects(copyR2Inventory({inventory:{objectCount:2,objects:[...inventory.objects,...inventory.objects]},snapshotId:id,copyObject:async()=>{calls++;}}),/INVENTORY_INVALID/);
 assert.equal(calls,0);
});
test('changed source ETag and backup source prefix cannot generate a false copy',async()=>{
 const {bucket,objects,deleted}=fixture();
 assert.equal((await copyBackupR2Object({MEDIA_BUCKET:bucket},{snapshot_id:id,key:'media/original',size:5,etag:'stale'})).status,'BACKUP_R2_SOURCE_CHANGED');
 assert.equal((await copyBackupR2Object({MEDIA_BUCKET:bucket},{snapshot_id:id,key:'backups/system/keep',size:5,etag:'original'})).ok,false);
 assert.equal(objects.size,1);assert.deepEqual(deleted,[]);
});
test('copy endpoint requires the existing strong sidecar authentication',async()=>{
 const {bucket}=fixture();
 const response=await worker.fetch(new Request('https://sidecar.invalid/r2-copy',{method:'POST',body:'{}'}),{MEDIA_BUCKET:bucket,MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN:'a'.repeat(64)});
 assert.equal(response.status,401);
});

test('authenticated endpoint copies exactly one source through the real sidecar route',async()=>{
 const {bucket,objects}=fixture();const token='a'.repeat(64);
 const response=await worker.fetch(new Request('https://sidecar.invalid/r2-copy',{
  method:'POST',headers:{'x-mel-predeploy-backup-refresh':token,'content-type':'application/json'},
  body:JSON.stringify({snapshot_id:id,key:'media/original',size:5,etag:'original'}),
 }),{MEDIA_BUCKET:bucket,MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN:token});
 assert.equal(response.status,200);
 const result=await response.json();assert.equal(result.manifest.objectCount,1);assert.equal(objects.size,2);
});

test('realistic 7378 object R2 inventory stays bounded by bytes and rejects malformed inventories',async()=>{
 const objects=Array.from({length:7378},(_,i)=>({key:'media/object-'+i,size:1,etag:'etag-'+i}));
 let copied=0;
 const manifest=await copyR2Inventory({inventory:{objectCount:objects.length,objects},snapshotId:id,copyObject:async input=>{
  copied++;
  return {ok:true,manifest:{snapshot_id:id,objectCount:1,totalBytes:input.size,objects:[{key:input.key,size:input.size,etag:input.etag,sha256:'a'.repeat(64),backup_key:'backups/system/r2-bytes/'+id+'/'+input.key}]}};
 }});
 assert.equal(manifest.objectCount,7378);
 assert.equal(copied,7378);
 let rejectedCopies=0;
 await assert.rejects(copyR2Inventory({inventory:{objectCount:objects.length,objects},snapshotId:id,maxBytes:7377,copyObject:async()=>{rejectedCopies++;}}),/BUDGET_EXCEEDED/);
 await assert.rejects(copyR2Inventory({inventory:{objectCount:10001,objects:[...objects,...Array.from({length:2623},(_,i)=>({key:'extra/'+i,size:0,etag:'etag'}))]},snapshotId:id,copyObject:async()=>{rejectedCopies++;}}),/INVENTORY_INVALID/);
 assert.equal(rejectedCopies,0);
});
