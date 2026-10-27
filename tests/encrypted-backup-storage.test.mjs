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

test('large encrypted snapshot roundtrip stays within bounded Node heap', async () => {
  const { spawnSync } = await import('node:child_process');
  const moduleUrl = new URL('../src/backup/encrypted-backup-storage.js', import.meta.url).href;
  const code = `
    import {createBackupEncryptionCodec} from ${JSON.stringify(moduleUrl)};
    const codec=createBackupEncryptionCodec({keyId:'synthetic',keyBytes:new Uint8Array(32).fill(7)});
    const snapshot={id:'synthetic-large',schema:'MEL_VERIFIED_SNAPSHOT_V1',integritySha256:'a'.repeat(64),data:'x'.repeat(16*1024*1024)};
    const envelope=await codec.seal(snapshot);
    const restored=await codec.open(envelope);
    if(restored.data!==snapshot.data)process.exit(1);
    console.log('ROUNDTRIP_OK');
  `;
  const child = spawnSync(process.execPath, ['--max-old-space-size=192','--input-type=module','-e',code], {
    encoding:'utf8',timeout:30_000,maxBuffer:1024*1024,
  });
  assert.equal(child.status,0,`bounded codec subprocess failed: status=${child.status}, signal=${child.signal}`);
  assert.equal(child.stdout.trim(),'ROUNDTRIP_OK');
});

test('Node backup encoding bypasses monolithic btoa for multi-megabyte ciphertext', async () => {
  const oldBtoa=globalThis.btoa;
  globalThis.btoa=()=>{throw new Error('MONOLITHIC_BTOA_MUST_NOT_RUN_IN_NODE');};
  try {
    const codec=createBackupEncryptionCodec({
      keyBytes:key(),
      keyId:'large-node-backup',
      randomBytes:deterministicIv,
    });
    const snapshot={
      id:'multi-mib-backup',
      schema:'MEL_VERIFIED_SNAPSHOT_V1',
      integritySha256:'d'.repeat(64),
      exports:{database:'0123456789abcdef'.repeat(512 * 1024)},
    };
    const sealed=await codec.seal(snapshot);
    assert.ok(sealed.ciphertext_b64.length > 8 * 1024 * 1024);
    assert.deepEqual(await codec.open(sealed),snapshot);
  } finally {
    globalThis.btoa=oldBtoa;
  }
});

test('Workers fallback encodes binary across 3-byte-aligned bounded base64 chunks', async () => {
  const oldBuffer=globalThis.Buffer;
  const oldBtoa=globalThis.btoa;
  const observed=[];
  globalThis.Buffer=undefined;
  globalThis.btoa=(binary)=>{
    observed.push(binary.length);
    assert.ok(binary.length <= 0xc000, 'must never call btoa with a giant binary string');
    return oldBtoa(binary);
  };
  try {
    const codec=createBackupEncryptionCodec({
      keyBytes:key(),
      keyId:'workers-chunk-backup',
      randomBytes:deterministicIv,
    });
    const snapshot={
      id:'multi-chunk-backup',
      schema:'MEL_VERIFIED_SNAPSHOT_V1',
      integritySha256:'e'.repeat(64),
      exports:{database:'abc'.repeat(80_000) + 'z'},
    };
    const sealed=await codec.seal(snapshot);
    assert.ok(observed.length >= 4);
    assert.deepEqual(await codec.open(sealed),snapshot);
  } finally {
    globalThis.Buffer=oldBuffer;
    globalThis.btoa=oldBtoa;
  }
});
