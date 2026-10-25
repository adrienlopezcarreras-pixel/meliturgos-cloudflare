import { createR2BackupReader } from './r2-reader.mjs';
import { writeFile } from 'node:fs/promises';
import { createBackupEncryptionCodec, decodeBackupEncryptionKey } from '../../src/backup/encrypted-backup-storage.js';
import { proveSystemSnapshotRestore, isolatedRestoreFailure } from './system-restore-proof.mjs';
let stage='CONFIGURATION';
try {
 const bucket='meliturgos-private-media';
 const key=process.env.MEL_RESTORE_SNAPSHOT_KEY||'';
 if(!/^backups\/system\/[A-Za-z0-9._-]+\.enc\.json$/.test(key)) throw Error('ISOLATED_SNAPSHOT_KEY_INVALID');
 const reader=createR2BackupReader({accountId:process.env.CLOUDFLARE_ACCOUNT_ID,apiToken:process.env.CLOUDFLARE_API_TOKEN,bucket});
 stage='DOWNLOAD';
 const input=await reader.getBytes(key,{maxBytes:512*1024*1024});
 if(input===null)throw Error('ISOLATED_R2_DOWNLOAD_FAILED');
 const envelope=JSON.parse(input.toString('utf8'));
 stage='DECRYPT';
 const codec=createBackupEncryptionCodec({keyId:process.env.MEL_BACKUP_ENCRYPTION_KEY_ID,keyBytes:decodeBackupEncryptionKey(process.env.MEL_BACKUP_ENCRYPTION_KEY_B64)});
 const snapshot=await codec.open(envelope);
 stage='RESTORE';
 const sizes=new Map((Array.isArray(snapshot.exports?.r2_objects?.objects)?snapshot.exports.r2_objects.objects:[]).map(row=>[row.backup_key,row.size]));
 const proof=await proveSystemSnapshotRestore(snapshot,{async get(key){const data=await reader.getBytes(key,{maxBytes:sizes.get(key)??32*1024*1024});return data===null?null:{arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}});
 await writeFile('isolated-restore-proof.json',JSON.stringify(proof,null,2),{mode:0o600});
 console.log('ISOLATED_RESTORE_VERIFIED; production_written=false; cleanup_authorized=false');
}catch(error){
 // Never print upstream bodies, object keys, decrypted data or secret material.
 const proof=isolatedRestoreFailure(error,stage);
 await writeFile('isolated-restore-proof.json',JSON.stringify(proof),{mode:0o600});
 // The failure proof is already allowlisted: only codes, stages, dates and counters.
 // Native annotations remain readable when signed artifact downloads are unavailable.
 if(process.env.GITHUB_ACTIONS==='true')console.log('::notice title=MEL isolated restore::'+JSON.stringify(proof));
 console.error(proof.code+'; stage='+proof.stage+'; kind='+proof.error_kind);process.exitCode=1;
}
