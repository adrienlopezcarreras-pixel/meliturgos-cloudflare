import test from 'node:test';
import assert from 'node:assert/strict';

import {
  R2_BYTE_BACKUP_SCHEMA,
  backupR2ObjectBytes,
  restoreR2ObjectBytes,
} from '../src/backup/r2-byte-backup.js';

class FakeBucket {
  constructor(seed={}) {
    this.objects=new Map();
    for(const [key,value] of Object.entries(seed)) this.objects.set(key,{bytes:new TextEncoder().encode(value),httpMetadata:{contentType:'text/plain'}});
  }
  async list({prefix='',cursor}={}) {
    const keys=[...this.objects.keys()].filter(key=>key.startsWith(prefix)).sort();
    const start=cursor?Number(cursor):0;
    const page=keys.slice(start,start+2);
    const next=start+page.length;
    return {
      objects:page.map(key=>({key,size:this.objects.get(key).bytes.byteLength,etag:'etag-'+key,uploaded:'2026-09-26T00:00:00.000Z'})),
      truncated:next<keys.length,
      cursor:next<keys.length?String(next):undefined,
    };
  }
  async get(key) {
    const row=this.objects.get(key);
    if(!row) return null;
    const bytes=new Uint8Array(row.bytes);
    return {
      httpMetadata:row.httpMetadata,
      async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);},
    };
  }
  async put(key,value,options={}) {
    const bytes=value instanceof Uint8Array?new Uint8Array(value):new Uint8Array(value);
    this.objects.set(key,{bytes,httpMetadata:options?.httpMetadata||null,customMetadata:options?.customMetadata||null});
  }
  async delete(key){this.objects.delete(key);}
}

test('GEN2-47 copies every non-backup R2 object and verifies exact bytes',async()=>{
  const bucket=new FakeBucket({
    'media/a.txt':'alpha',
    'docs/b.txt':'beta',
    'backups/system/old.json':'must-skip',
  });
  const out=await backupR2ObjectBytes(bucket,{snapshotId:'system-test'});
  assert.equal(out.type,R2_BYTE_BACKUP_SCHEMA);
  assert.equal(out.objectCount,2);
  assert.deepEqual(out.objects.map(row=>row.key),['docs/b.txt','media/a.txt']);
  assert.ok(out.objects.every(row=>row.backup_key.startsWith('backups/system/r2-bytes/system-test/')));
  assert.equal(out.totalBytes,9);
  for(const row of out.objects) assert.ok(bucket.objects.has(row.backup_key));
});

test('GEN2-47 restores copied R2 bytes into an isolated target and verifies hashes',async()=>{
  const source=new FakeBucket({'media/a.txt':'alpha','docs/b.txt':'beta'});
  const manifest=await backupR2ObjectBytes(source,{snapshotId:'restore-test'});
  const target=new FakeBucket();
  const restored=await restoreR2ObjectBytes(source,target,manifest,{targetPrefix:'drill/'});
  assert.equal(restored.status,'RESTORED_VERIFIED');
  assert.equal(restored.objectCount,2);
  assert.equal(new TextDecoder().decode(target.objects.get('drill/media/a.txt').bytes),'alpha');
  assert.equal(new TextDecoder().decode(target.objects.get('drill/docs/b.txt').bytes),'beta');
});

test('GEN2-47 fails closed and cleans partial copies when an object exceeds bound',async()=>{
  const bucket=new FakeBucket({'a':'ok','b':'this-is-too-large'});
  await assert.rejects(
    ()=>backupR2ObjectBytes(bucket,{snapshotId:'bounded',maxObjectBytes:5}),
    error=>error?.code==='BACKUP_R2_OBJECT_BYTE_LIMIT',
  );
  assert.equal([...bucket.objects.keys()].some(key=>key.startsWith('backups/system/r2-bytes/bounded/')),false);
});

test('GEN2-47 restore refuses tampered backup bytes and cleans target writes',async()=>{
  const source=new FakeBucket({'a':'alpha','b':'beta'});
  const manifest=await backupR2ObjectBytes(source,{snapshotId:'tamper'});
  const victim=manifest.objects.find(row=>row.key==='b');
  source.objects.get(victim.backup_key).bytes=new TextEncoder().encode('evil');
  const target=new FakeBucket();
  await assert.rejects(
    ()=>restoreR2ObjectBytes(source,target,manifest,{targetPrefix:'drill/'}),
    error=>['BACKUP_R2_OBJECT_SIZE_MISMATCH','BACKUP_R2_COPY_INTEGRITY_MISMATCH'].includes(error?.code),
  );
  assert.equal([...target.objects.keys()].some(key=>key.startsWith('drill/')),false);
});
