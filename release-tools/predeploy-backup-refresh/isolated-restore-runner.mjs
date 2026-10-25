import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBackupEncryptionCodec, decodeBackupEncryptionKey } from '../../src/backup/encrypted-backup-storage.js';
import { proveSystemSnapshotRestore } from './system-restore-proof.mjs';
const directory=await mkdtemp(join(tmpdir(),'mel-restore-input-'));
let sequence=0;
try {
 const bucket='meliturgos-private-media';
 const key=process.env.MEL_RESTORE_SNAPSHOT_KEY||'';
 if(!/^backups\/system\/[A-Za-z0-9._-]+\.enc\.json$/.test(key)) throw Error('ISOLATED_SNAPSHOT_KEY_INVALID');
 async function download(objectKey){
  const file=join(directory,String(sequence++));
  const run=spawnSync('npx',['--no-install','wrangler','r2','object','get',`${bucket}/${objectKey}`,'--remote','--file',file],{stdio:'pipe',timeout:120000,maxBuffer:1024*1024});
  if(run.status!==0)throw Error('ISOLATED_R2_DOWNLOAD_FAILED');
  try{return await readFile(file);}finally{await rm(file,{force:true});}
 }
 const envelope=JSON.parse((await download(key)).toString('utf8'));
 const codec=createBackupEncryptionCodec({keyId:process.env.MEL_BACKUP_ENCRYPTION_KEY_ID,keyBytes:decodeBackupEncryptionKey(process.env.MEL_BACKUP_ENCRYPTION_KEY_B64)});
 const snapshot=await codec.open(envelope);
 const proof=await proveSystemSnapshotRestore(snapshot,{async get(key){const data=await download(key);return {arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}});
 await writeFile('isolated-restore-proof.json',JSON.stringify(proof,null,2),{mode:0o600});
 console.log('ISOLATED_RESTORE_VERIFIED; production_written=false; cleanup_authorized=false');
}catch(error){
 // Never print upstream bodies, object keys, decrypted data or secret material.
 const code=/^ISOLATED_[A-Z_]+$/.test(error.message||'')?error.message:'ISOLATED_RESTORE_FAILED';
 await writeFile('isolated-restore-proof.json',JSON.stringify({ok:false,status:'BLOCKED',code,production_written:false,cleanup_authorized:false}),{mode:0o600});
 console.error(code);process.exitCode=1;
}finally{await rm(directory,{recursive:true,force:true});}
