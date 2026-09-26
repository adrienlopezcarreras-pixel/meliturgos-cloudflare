import test from 'node:test';
import assert from 'node:assert/strict';

import { createVerifiedBackupService } from '../src/backup/backup-service.js';
import { createRestoreService } from '../src/backup/restore-service.js';
import {
  ENCRYPTED_BACKUP_SCHEMA,
  createBackupEncryptionCodec,
  createEnvBackupEncryptionCodec,
} from '../src/backup/encrypted-backup-storage.js';
import { createR2D1BackupStorage } from '../src/backup/system-backup-runtime.js';

function key(seed = 1) {
  return Uint8Array.from({length:32},(_,index)=>(seed + index) & 0xff);
}

function deterministicIv() {
  return Uint8Array.from({length:12},(_,index)=>index + 10);
}

function storageMocks() {
  const index=new Map();
  const objects=new Map();
  const db={
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.startsWith('SELECT object_key')) {
                const row=index.get(args[0]);
                return row ? {object_key:row.object_key}:null;
              }
              return null;
            },
            async run() {
              if (sql.startsWith('INSERT INTO backup_objects')) {
                const [id,object_key,metadata_json,created_at]=args;
                index.set(id,{id,object_key,metadata_json,created_at});
              }
              return {success:true};
            },
            async all() {
              if (sql.includes('FROM backup_objects')) {
                const limit=args[0];
                return {results:[...index.values()].sort((a,b)=>b.created_at-a.created_at).slice(0,limit)};
              }
              return {results:[]};
            },
          };
        },
      };
    },
  };
  const bucket={
    async put(objectKey,value){ objects.set(objectKey,String(value)); },
    async get(objectKey){
      const value=objects.get(objectKey);
      return value == null ? null : {async text(){return value;}};
    },
    async delete(objectKey){ objects.delete(objectKey); },
  };
  return {db,bucket,index,objects};
}

test('MEL-RES-05 AES-GCM envelope hides plaintext and round-trips exact snapshot', async () => {
  const codec=createBackupEncryptionCodec({
    keyBytes:key(),
    keyId:'backup-key-2026-09',
    randomBytes:deterministicIv,
  });
  const snapshot={
    id:'encrypted-proof',
    schema:'MEL_VERIFIED_SNAPSHOT_V1',
    integritySha256:'a'.repeat(64),
    exports:{memory:{marker:'PLAINTEXT_MUST_NOT_APPEAR'}},
  };

  const envelope=await codec.seal(snapshot);
  assert.equal(envelope.schema,ENCRYPTED_BACKUP_SCHEMA);
  assert.equal(envelope.algorithm,'AES-GCM-256');
  assert.equal(envelope.key_id,'backup-key-2026-09');
  assert.doesNotMatch(JSON.stringify(envelope),/PLAINTEXT_MUST_NOT_APPEAR/);
  assert.deepEqual(await codec.open(envelope),snapshot);
});

test('MEL-RES-05 encrypted envelope fails closed after ciphertext or AAD tampering', async () => {
  const codec=createBackupEncryptionCodec({
    keyBytes:key(),
    keyId:'key-a',
    randomBytes:deterministicIv,
  });
  const snapshot={
    id:'tamper-proof',
    schema:'MEL_VERIFIED_SNAPSHOT_V1',
    integritySha256:'b'.repeat(64),
    exports:{state:{ok:true}},
  };
  const envelope=await codec.seal(snapshot);

  const tamperedCipher=structuredClone(envelope);
  const raw=atob(tamperedCipher.ciphertext_b64);
  tamperedCipher.ciphertext_b64=btoa(String.fromCharCode(raw.charCodeAt(0)^1)+raw.slice(1));
  await assert.rejects(
    ()=>codec.open(tamperedCipher),
    error=>error.code==='BACKUP_ENCRYPTED_CIPHERTEXT_INTEGRITY_MISMATCH'
  );

  const tamperedAad=structuredClone(envelope);
  tamperedAad.aad.snapshot_id='other-id';
  await assert.rejects(
    ()=>codec.open(tamperedAad),
    error=>error.code==='BACKUP_DECRYPTION_FAILED'
  );
});

test('MEL-RES-05 wrong key and wrong key id cannot decrypt a backup', async () => {
  const source=createBackupEncryptionCodec({
    keyBytes:key(1),
    keyId:'key-a',
    randomBytes:deterministicIv,
  });
  const snapshot={
    id:'wrong-key',
    schema:'MEL_VERIFIED_SNAPSHOT_V1',
    integritySha256:'c'.repeat(64),
  };
  const envelope=await source.seal(snapshot);

  const wrongId=createBackupEncryptionCodec({keyBytes:key(1),keyId:'key-b'});
  await assert.rejects(
    ()=>wrongId.open(envelope),
    error=>error.code==='BACKUP_ENCRYPTION_KEY_ID_MISMATCH'
  );

  const wrongKey=createBackupEncryptionCodec({keyBytes:key(2),keyId:'key-a'});
  await assert.rejects(
    ()=>wrongKey.open(envelope),
    error=>error.code==='BACKUP_DECRYPTION_FAILED'
  );
});

test('MEL-RES-05 encrypted R2 storage keeps only ciphertext while normal backup verification still works', async () => {
  const {db,bucket,index,objects}=storageMocks();
  const codec=createBackupEncryptionCodec({
    keyBytes:key(),
    keyId:'r2-key-1',
    randomBytes:deterministicIv,
  });
  const storage=createR2D1BackupStorage({db,bucket,encryptionCodec:codec});
  const service=createVerifiedBackupService({
    storage,
    now:()=> '2026-09-25T08:40:00.000Z',
    sources:{
      memory:async()=>({facts:['sensitive-memory-marker']}),
      runtime:async()=>({version:'1'}),
    },
  });

  const created=await service.create({id:'encrypted-r2'});
  assert.equal(index.size,1);
  assert.equal(objects.size,1);
  const [objectKey,raw]=[...objects.entries()][0];
  assert.match(objectKey,/\.enc\.json$/);
  assert.doesNotMatch(raw,/sensitive-memory-marker/);
  const envelope=JSON.parse(raw);
  assert.equal(envelope.schema,ENCRYPTED_BACKUP_SCHEMA);

  const verification=await service.verify({id:created.id});
  assert.equal(verification.ok,true);
  const listed=await storage.list({limit:1});
  assert.equal(listed[0].encrypted,true);
  assert.equal(listed[0].encryptionAlgorithm,'AES-GCM-256');
  assert.equal(listed[0].encryptionKeyId,'r2-key-1');
});

test('MEL-RES-05 encrypted backup can be decrypted and passed through the existing restore verifier', async () => {
  const {db,bucket}=storageMocks();
  const codec=createBackupEncryptionCodec({
    keyBytes:key(),
    keyId:'restore-key',
    randomBytes:deterministicIv,
  });
  const storage=createR2D1BackupStorage({db,bucket,encryptionCodec:codec});
  const backups=createVerifiedBackupService({
    storage,
    now:()=> '2026-09-25T08:41:00.000Z',
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
        appVersion:'0.2.5',
        dbSchemaVersion:7,
        worker:'meliturgos',
      }),
    },
  });

  const created=await backups.create({id:'encrypted-restore'});
  const restore=createRestoreService({storage});
  const plan=await restore.plan({id:created.id});
  assert.equal(plan.ok,true);
  assert.equal(plan.verification.code,'RESTORE_CANDIDATE_VERIFIED');
  assert.equal(plan.plan.automatic_activation,false);
  assert.equal(plan.plan.requires_owner_approval,true);
});

test('MEL-RES-05 environment codec requires a named 256-bit key and never silently downgrades', () => {
  assert.throws(
    ()=>createEnvBackupEncryptionCodec({}),
    error=>error.code==='BACKUP_ENCRYPTION_KEY_ID_REQUIRED'
  );
  assert.throws(
    ()=>createEnvBackupEncryptionCodec({
      MEL_BACKUP_ENCRYPTION_KEY_ID:'key-id',
      MEL_BACKUP_ENCRYPTION_KEY_B64:btoa('too-short'),
    }),
    error=>error.code==='BACKUP_ENCRYPTION_KEY_MUST_BE_32_BYTES'
  );

  const valid=createEnvBackupEncryptionCodec({
    MEL_BACKUP_ENCRYPTION_KEY_ID:'key-id',
    MEL_BACKUP_ENCRYPTION_KEY_B64:btoa(String.fromCharCode(...key())),
  });
  assert.equal(valid.key_id,'key-id');
  assert.equal(valid.algorithm,'AES-GCM-256');
});
