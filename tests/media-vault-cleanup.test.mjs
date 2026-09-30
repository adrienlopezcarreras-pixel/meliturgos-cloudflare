import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runExpiredMediaCleanup } from '../src/media/media-vault-cleanup.js';

test('media cleanup skips cleanly when R2 is unavailable', async () => {
  const result = await runExpiredMediaCleanup({ MELITURGOS_USER:'adrien' });
  assert.equal(result.ok, true);
  assert.equal(result.skipped, true);
  assert.equal(result.deleted, 0);
});

test('media cleanup deletes only expired objects owned by current owner', async () => {
  const deleted=[];
  const now=Date.parse('2026-10-01T00:00:00Z');
  const env={
    MELITURGOS_USER:'adrien',
    MEDIA_BUCKET:{
      async list(options){
        assert.equal(options.prefix,'uploads/');
        assert.deepEqual(options.include,['customMetadata']);
        return {
          truncated:false,
          objects:[
            {key:'uploads/old.bin',customMetadata:{owner:'adrien',expiresAt:'2026-09-30T23:59:59Z'}},
            {key:'uploads/future.bin',customMetadata:{owner:'adrien',expiresAt:'2026-10-02T00:00:00Z'}},
            {key:'uploads/other.bin',customMetadata:{owner:'other',expiresAt:'2026-09-30T23:59:59Z'}},
            {key:'uploads/legacy.bin',customMetadata:{owner:'adrien'}},
          ],
        };
      },
      async delete(keys){ deleted.push(...keys); },
    },
  };

  const result=await runExpiredMediaCleanup(env,{now});
  assert.deepEqual(deleted,['uploads/old.bin']);
  assert.equal(result.scanned,4);
  assert.equal(result.deleted,1);
  assert.equal(result.status,'MEDIA_CLEANUP_COMPLETE');
});

test('media cleanup scan stays bounded', async () => {
  let requestedLimit=0;
  const env={
    MELITURGOS_USER:'adrien',
    MEDIA_BUCKET:{
      async list(options){
        requestedLimit=options.limit;
        return {
          truncated:false,
          objects:Array.from({length:3},(_,i)=>({
            key:'uploads/'+i+'.bin',
            customMetadata:{owner:'adrien',expiresAt:'2026-09-30T00:00:00Z'},
          })),
        };
      },
      async delete(){},
    },
  };
  const result=await runExpiredMediaCleanup(env,{now:Date.parse('2026-10-01T00:00:00Z'),maxObjects:3});
  assert.equal(requestedLimit,3);
  assert.equal(result.scanned,3);
  assert.equal(result.deleted,3);
});

test('hourly maintenance wires the Media Vault cleanup into the canonical Worker', async () => {
  const source=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
  assert.match(source,/import \{ runExpiredMediaCleanup \} from "\.\/media\/media-vault-cleanup\.js";/);
  assert.match(source,/runExpiredMediaCleanup\(env\)\.catch/);
  assert.match(source,/\[MEL MediaVault\] expired media cleanup failed/);
});
