import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SYSTEM_BACKUP_PREFIX,
  exportD1SystemState,
  exportR2Inventory,
  createR2D1BackupStorage,
  runScheduledSystemBackup,
} from '../src/backup/system-backup-runtime.js';

function d1ExportMock() {
  const tables = {
    beta: [{ id: 2, value: 'z' }, { id: 1, value: 'a' }],
    alpha: [{ id: 1, value: 'x' }],
  };
  return {
    prepare(sql) {
      if (sql.includes('sqlite_master')) return { async all(){ return {results:[{name:'alpha',sql:'CREATE TABLE alpha'},{name:'beta',sql:'CREATE TABLE beta'}]}; } };
      const match = sql.match(/FROM "([^"]+)" LIMIT (\?|1)/);
      if (!match) throw new Error(`unexpected sql ${sql}`);
      const table = match[1];
      return {
        bind(...args) {
          return {
            async all() {
              const source = tables[table] || [];
              if (sql.includes('LIMIT 1 OFFSET')) return { results: source.slice(args[0], args[0] + 1) };
              const [limit, offset] = args;
              return { results: source.slice(offset, offset + limit) };
            }
          };
        }
      };
    }
  };
}

test('GEN2-47 exports all discovered D1 tables deterministically', async () => {
  const out = await exportD1SystemState(d1ExportMock(), { pageSize: 1, maxRowsPerTable: 10 });
  assert.equal(out.type, 'MEL_D1_LOGICAL_EXPORT_V1');
  assert.deepEqual(out.tables.map(t=>t.name), ['alpha','beta']);
  assert.deepEqual(out.tables[1].rows.map(r=>r.id), [1,2]);
  assert.equal(out.tableCount, 2);
});

test('GEN2-47 fails closed instead of silently truncating a D1 table', async () => {
  await assert.rejects(
    () => exportD1SystemState(d1ExportMock(), { pageSize: 1, maxRowsPerTable: 1 }),
    /BACKUP_TABLE_ROW_LIMIT:beta/
  );
});

test('GEN2-47 inventories R2 across pages and excludes its own backup namespace', async () => {
  const calls = [];
  const bucket = {
    async list(args) {
      calls.push(args);
      if (!args.cursor) return { truncated:true, cursor:'next', objects:[
        {key:'media/a',size:3,etag:'a'},
        {key:`${SYSTEM_BACKUP_PREFIX}old.json`,size:99,etag:'skip'},
      ]};
      return { truncated:false, objects:[{key:'docs/b',size:4,etag:'b'}] };
    }
  };
  const out = await exportR2Inventory(bucket);
  assert.deepEqual(out.objects.map(x=>x.key), ['docs/b','media/a']);
  assert.equal(out.objectCount, 2);
  assert.equal(calls.length, 2);
});

function storageMocks() {
  const index = new Map();
  const objects = new Map();
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.startsWith('SELECT object_key')) {
                const row = index.get(args[0]);
                return row ? { object_key: row.object_key } : null;
              }
              return null;
            },
            async run() {
              if (sql.startsWith('INSERT INTO backup_objects')) {
                const [id, object_key, metadata_json, created_at] = args;
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
            }
          };
        }
      };
    }
  };
  const bucket = {
    async put(key,value){ objects.set(key,String(value)); },
    async get(key){ const value=objects.get(key); return value == null ? null : { async text(){return value;} }; },
    async delete(key){ objects.delete(key); },
  };
  return {db,bucket,index,objects};
}

test('GEN2-47 stores verified snapshots in R2 and indexes metadata in D1', async () => {
  const {db,bucket,index,objects}=storageMocks();
  const storage=createR2D1BackupStorage({db,bucket});
  const snapshot={id:'system-20260916123000',schema:'MEL_VERIFIED_SNAPSHOT_V1',createdAt:'2026-09-16T12:30:00.000Z',integritySha256:'abc',sourceCount:3,verified:true};
  await storage.put(snapshot);
  assert.equal(index.size,1);
  assert.equal(objects.size,1);
  assert.deepEqual(await storage.get(snapshot.id),snapshot);
  const listed=await storage.list({limit:1});
  assert.equal(listed[0].id,snapshot.id);
  assert.equal(listed[0].verified,true);
});

test('GEN2-47 scheduled control verifies current backup instead of creating every minute', async () => {
  let creates=0, verifies=0;
  const service={
    async list(){ return [{id:'current',createdAt:'2026-09-16T10:00:00.000Z'}]; },
    async verify(){ verifies++; return {ok:true,integritySha256:'ok'}; },
    async create(){ creates++; throw new Error('should not create'); },
  };
  const result=await runScheduledSystemBackup({}, {now:()=> '2026-09-16T12:00:00.000Z', intervalMs:24*60*60*1000, service});
  assert.equal(result.status,'VERIFIED_CURRENT');
  assert.equal(verifies,1);
  assert.equal(creates,0);
});

test('GEN2-47 scheduled control replaces missing or invalid backup with a verified snapshot', async () => {
  let verifyCalls=0;
  const service={
    async list(){ return [{id:'broken',createdAt:'2026-09-15T12:00:00.000Z'}]; },
    async verify({id}){ verifyCalls++; return id==='broken'?{ok:false}:{ok:true,integritySha256:'new-hash'}; },
    async create({id}){ return {id,integritySha256:'new-hash',sourceCount:3}; },
  };
  const result=await runScheduledSystemBackup({}, {now:()=> '2026-09-16T12:30:00.000Z', service});
  assert.equal(result.status,'CREATED_VERIFIED');
  assert.match(result.id,/^system-/);
  assert.equal(verifyCalls,2);
});

test('GEN2-47 scheduled backups stay disabled in isolated preview', async () => {
  const result=await runScheduledSystemBackup({MEL_PREVIEW_ISOLATED:'true'}, {service:{}});
  assert.deepEqual(result,{ok:true,status:'SKIPPED_PREVIEW'});
});

test('GEN2-47 is wired to the canonical scheduled entry and roadmap source', async () => {
  const [entry, roadmap] = await Promise.all([
    readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/roadmap/master-roadmap.js', import.meta.url), 'utf8'),
  ]);
  assert.match(entry, /backup\/system-backup-runtime\.js/);
  assert.match(entry, /runScheduledSystemBackup/);
  assert.match(roadmap, /GEN2-47[\s\S]*Snapshots D1 complets \+ inventaire R2 automatisés et vérifiés/);
  assert.match(roadmap, /GEN2-47[\s\S]*copie des octets R2, chiffrement et drill de restauration/);
});
