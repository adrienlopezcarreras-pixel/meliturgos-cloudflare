import { validateR2CopyInventory, MAX_R2_SNAPSHOT_OBJECTS, MAX_R2_SNAPSHOT_BYTES, MAX_R2_SNAPSHOT_OBJECT_BYTES } from './r2-copy.mjs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifySnapshot } from '../../src/backup/backup-service.js';
import { inspectRestoreCandidate } from '../../src/backup/restore-service.js';
import { restoreR2ObjectBytes, R2_BYTE_BACKUP_SCHEMA } from '../../src/backup/r2-byte-backup.js';
import { proveD1SnapshotRestore } from './d1-restore-proof.mjs';

const fail=(code,diagnostic)=>{throw Object.assign(new Error(code),{code,...(diagnostic?{diagnostic}:{})});};
// Source exposes GET only. Target paths are generated locally, never supplied by
// a snapshot. No Cloudflare target, activation, SQL remote execution or deletion.
export async function proveSystemSnapshotRestore(snapshot, source, {maxBytes=MAX_R2_SNAPSHOT_BYTES,maxObjects=MAX_R2_SNAPSHOT_OBJECTS}={}) {
  const integrity=await verifySnapshot(snapshot);
  if (integrity.ok!==true) fail('ISOLATED_SNAPSHOT_INTEGRITY_FAILED');
  if (inspectRestoreCandidate(snapshot,{integrity}).ok!==true) fail('ISOLATED_SNAPSHOT_INVALID');
  const manifest=snapshot.exports.r2_objects;
  if(manifest?.type!==R2_BYTE_BACKUP_SCHEMA || !Array.isArray(manifest.objects)) {
    let diagnostic={source:'SNAPSHOT_INVENTORY',created_at:snapshot.createdAt};
    try {
      const inspected=validateR2CopyInventory({inventory:snapshot.exports.r2_inventory,snapshotId:snapshot.id});
      diagnostic={...diagnostic,object_count:inspected.objects.length,total_bytes:inspected.total,largest_object_bytes:inspected.largest};
    }catch(error){diagnostic={...diagnostic,...error.diagnostic,preflight_code:error.code};}
    fail('ISOLATED_R2_BYTES_MANIFEST_REQUIRED',diagnostic);
  }
  const inventory=snapshot.exports.r2_inventory.objects;
  const descriptors=new Map();
  let bytes=0;
  for(const object of manifest.objects) {
    if(typeof object.key!=='string'||descriptors.has(object.key)||!Number.isSafeInteger(object.size)||object.size<0||
       !/^[a-f0-9]{64}$/.test(object.sha256||'')||!String(object.backup_key||'').startsWith('backups/system/r2-bytes/')) fail('ISOLATED_R2_MANIFEST_INVALID');
    if(object.size>MAX_R2_SNAPSHOT_OBJECT_BYTES)fail('ISOLATED_RESTORE_BUDGET_EXCEEDED');
    descriptors.set(object.key,object); bytes+=object.size;
  }
  if(manifest.objectCount!==descriptors.size||manifest.totalBytes!==bytes) fail('ISOLATED_R2_MANIFEST_INVALID');
  // No excluded prefix can silently become "full R2 restored".
  if(inventory.length!==descriptors.size||new Set(inventory.map(x=>x.key)).size!==inventory.length||
     inventory.some(x=>!descriptors.has(x.key)||descriptors.get(x.key).size!==x.size)) fail('ISOLATED_R2_COVERAGE_INCOMPLETE');
  if(!Number.isSafeInteger(maxBytes)||maxBytes<0||maxBytes>MAX_R2_SNAPSHOT_BYTES||!Number.isSafeInteger(maxObjects)||maxObjects<0||maxObjects>MAX_R2_SNAPSHOT_OBJECTS||bytes>maxBytes||descriptors.size>maxObjects) fail('ISOLATED_RESTORE_BUDGET_EXCEEDED');
  if(typeof source?.get!=='function') fail('ISOLATED_R2_SOURCE_REQUIRED');
  const database=await proveD1SnapshotRestore(snapshot.exports.database);
  const directory=await mkdtemp(join(tmpdir(),'mel-isolated-restore-'));
  const pathFor=key=>join(directory,createHash('sha256').update(key).digest('hex'));
  const target={
    async put(key,value){await writeFile(pathFor(key),new Uint8Array(value),{mode:0o600});},
    async get(key){try{const data=await readFile(pathFor(key));return {arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}catch(error){if(error.code==='ENOENT')return null;throw error;}},
    async delete(key){await rm(pathFor(key),{force:true});},
  };
  try {
    const r2=await restoreR2ObjectBytes({get:key=>source.get(key)},target,manifest,{concurrency:4});
    return {ok:true,status:'ISOLATED_RESTORE_VERIFIED',snapshot_id:snapshot.id,integrity_sha256:snapshot.integritySha256,
      database,r2:{object_count:r2.objectCount,total_bytes:r2.totalBytes,target:'ISOLATED_FILESYSTEM'},production_written:false,
      cleanup_authorized:false};
  } finally {await rm(directory,{recursive:true,force:true});}
}

// Only internal identifiers, never provider messages, paths, object keys or data.
export function isolatedRestoreFailure(error, stage) {
  const stages=['CONFIGURATION','DOWNLOAD','DECRYPT','RESTORE'];
  const candidate=String(error?.code || error?.message || '');
  const code=/^(?:ISOLATED|BACKUP|SNAPSHOT|RESTORE)_[A-Z0-9_]{1,80}$/.test(candidate)
    ? candidate : ['ERR_STRING_TOO_LONG','ERR_OUT_OF_RANGE'].includes(candidate)
      ? candidate : 'ISOLATED_RESTORE_FAILED';
  const diagnostic={};
  if(error?.diagnostic?.source==='SNAPSHOT_INVENTORY') {
    diagnostic.source='SNAPSHOT_INVENTORY';
    const date=error.diagnostic.created_at;
    if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(date))diagnostic.created_at=date;
    for(const key of ['object_count','total_bytes','largest_object_bytes','limit_bytes','object_index']) {
      const value=error.diagnostic[key];if(Number.isSafeInteger(value)&&value>=0)diagnostic[key]=value;
    }
    if(/^BACKUP_R2_[A-Z0-9_]+$/.test(error.diagnostic.preflight_code||''))diagnostic.preflight_code=error.diagnostic.preflight_code;
    if(['INVALID_KEY','DUPLICATE_KEY','BACKUP_PREFIX','MISSING_ETAG','INVALID_SIZE'].includes(error.diagnostic.reason))diagnostic.reason=error.diagnostic.reason;
  }
  return {ok:false,status:'BLOCKED',code,...(Object.keys(diagnostic).length?{diagnostic}:{}),stage:stages.includes(stage)?stage:'UNKNOWN',
    error_kind:['Error','RangeError','SyntaxError','TypeError'].includes(error?.name)?error.name:'Error',
    production_written:false,cleanup_authorized:false};
}
