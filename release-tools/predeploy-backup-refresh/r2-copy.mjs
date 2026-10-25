// Coordinator for the existing authenticated backup sidecar. No new engine/store.
export async function copyR2Inventory({inventory,snapshotId,copyObject,maxBytes=256*1024*1024}={}) {
 const objects=inventory?.objects;
 const fail=code=>{throw Error(code);};
 if(!/^system-[0-9]{17}$/.test(snapshotId||'')||!Array.isArray(objects)||inventory.objectCount!==objects.length||objects.length>5000)fail('BACKUP_R2_COPY_INVENTORY_INVALID');
 const seen=new Set();let total=0;
 for(const item of objects){
  if(typeof item?.key!=='string'||!item.key||seen.has(item.key)||item.key.startsWith('backups/system/')||!item.etag||!Number.isSafeInteger(item.size)||item.size<0||item.size>32*1024*1024)fail('BACKUP_R2_COPY_INVENTORY_INVALID');
  seen.add(item.key);total+=item.size;
 }
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>256*1024*1024||total>maxBytes)fail('BACKUP_R2_COPY_BUDGET_EXCEEDED');
 const copied=[];
 for(const item of objects){
  const result=await copyObject({snapshot_id:snapshotId,key:item.key,size:item.size,etag:item.etag});
  const manifest=result?.manifest,row=manifest?.objects?.[0];
  if(result?.ok!==true||manifest?.snapshot_id!==snapshotId||manifest?.objectCount!==1||manifest?.objects?.length!==1||
    row?.key!==item.key||row.size!==item.size||row.etag!==item.etag||manifest.totalBytes!==item.size||!/^[a-f0-9]{64}$/.test(row.sha256||'')||!row.backup_key?.startsWith(`backups/system/r2-bytes/${snapshotId}/`))fail('BACKUP_R2_COPY_NOT_VERIFIED');
  copied.push(row);
 }
 return {type:'MEL_R2_BYTE_BACKUP_V1',snapshot_id:snapshotId,objectCount:copied.length,totalBytes:total,objects:copied};
}
