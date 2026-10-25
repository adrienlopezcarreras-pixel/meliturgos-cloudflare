// Coordinator for the existing authenticated backup sidecar. No new engine/store.
export async function copyR2Inventory({inventory,snapshotId,copyObject,maxBytes=256*1024*1024}={}) {
 const objects=inventory?.objects;
 const fail=(code,diagnostic={})=>{throw Object.assign(new Error(code),{code,diagnostic:{stage:'r2-copy-preflight',...diagnostic}});};
 if(!/^system-[0-9]{17}$/.test(snapshotId||'')||!Array.isArray(objects)||inventory.objectCount!==objects.length)fail('BACKUP_R2_COPY_INVENTORY_INVALID');
 const seen=new Set();let total=0,largest=0;
 for(const [index,item] of objects.entries()){
  const reason=typeof item?.key!=='string'||!item.key?'INVALID_KEY':seen.has(item.key)?'DUPLICATE_KEY':item.key.startsWith('backups/system/')?'BACKUP_PREFIX':typeof item.etag!=='string'||!item.etag?'MISSING_ETAG':!Number.isSafeInteger(item.size)||item.size<0?'INVALID_SIZE':null;
  if(reason)fail('BACKUP_R2_COPY_INVENTORY_INVALID',{reason,object_index:index,object_count:objects.length});
  seen.add(item.key);total+=item.size;largest=Math.max(largest,item.size);
 }
 const counts={object_count:objects.length,total_bytes:total,largest_object_bytes:largest};
 if(objects.length>5000)fail('BACKUP_R2_COPY_OBJECT_COUNT_LIMIT',counts);
 if(largest>32*1024*1024)fail('BACKUP_R2_COPY_OBJECT_BYTE_LIMIT',{...counts,limit_bytes:32*1024*1024});
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>256*1024*1024||total>maxBytes)fail('BACKUP_R2_COPY_BUDGET_EXCEEDED',{...counts,limit_bytes:Number.isSafeInteger(maxBytes)?maxBytes:null});
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
