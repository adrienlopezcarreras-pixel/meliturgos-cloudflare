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

test('bounded parallel restore preserves input ordering and verified bytes',async()=>{
 const source=new FakeBucket(Object.fromEntries(Array.from({length:8},(_,i)=>['key-'+i,'value-'+i])));
 const manifest=await backupR2ObjectBytes(source,{snapshotId:'parallel-test'});
 let active=0,maximum=0;const get=source.get.bind(source);
 source.get=async key=>{active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;return get(key);};
 const target=new FakeBucket();
 const result=await restoreR2ObjectBytes(source,target,manifest,{concurrency:4});
 assert.equal(maximum,4);assert.equal(result.objectCount,8);
 assert.deepEqual(result.objects.map(x=>x.key),manifest.objects.map(x=>x.key));
 for(const descriptor of manifest.objects)assert.deepEqual(target.objects.get(descriptor.key).bytes,source.objects.get(descriptor.key).bytes);
});

test('parallel restore waits for in-flight writes before rollback and stops scheduling on failure',async()=>{
 const source=new FakeBucket({first:'first',second:'second',third:'third'});
 const manifest=await backupR2ObjectBytes(source,{snapshotId:'rollback-test'});
 let releaseSecond,startSecond,writeSecond;
 const secondStarted=new Promise(resolve=>{startSecond=resolve;});
 const secondWritten=new Promise(resolve=>{writeSecond=resolve;});
 const gate=new Promise(resolve=>{releaseSecond=resolve;});
 const original=source.get.bind(source),calls=[];
 source.get=async key=>{
  calls.push(key);if(key===manifest.objects[0].backup_key)throw Error('SYNTHETIC_READ_FAILED');
  startSecond();await gate;return original(key);
 };
 const target=new FakeBucket(),put=target.put.bind(target);
 target.put=async(...args)=>{await put(...args);writeSecond();};
 const rejection=assert.rejects(restoreR2ObjectBytes(source,target,manifest,{concurrency:2}),/SYNTHETIC_READ_FAILED/);
 await secondStarted;releaseSecond();await secondWritten;await rejection;
 assert.equal(calls.length,2);assert.equal(target.objects.size,0);
});

test('parallel restore never converts a falsy provider rejection into success',async()=>{
 for(const rejected of [null,undefined,false,0,'']){
  const source=new FakeBucket({a:'one'}),target=new FakeBucket();
  const manifest=await backupR2ObjectBytes(source,{snapshotId:'reject-test'});
  source.get=async()=>{throw rejected;};
  await assert.rejects(restoreR2ObjectBytes(source,target,manifest,{concurrency:4}),error=>error===rejected);
  assert.equal(target.objects.size,0);
 }
});

test('restore refuses target collisions without overwriting or deleting pre-existing data',async()=>{
 const source=new FakeBucket({a:'new',z:'another'}),target=new FakeBucket({a:'keep',unrelated:'keep-too'});
 const manifest=await backupR2ObjectBytes(source,{snapshotId:'collision-test'});
 await assert.rejects(restoreR2ObjectBytes(source,target,manifest,{concurrency:4}),error=>error?.code==='BACKUP_R2_RESTORE_TARGET_NOT_EMPTY');
 assert.deepEqual([...target.objects.keys()].sort(),['a','unrelated']);
 assert.equal(new TextDecoder().decode(target.objects.get('a').bytes),'keep');
});
