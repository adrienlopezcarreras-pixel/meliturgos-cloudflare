import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverLatestEncryptedSnapshotKey } from '../../release-tools/predeploy-backup-refresh/r2-snapshot-discovery.mjs';

const accountId = 'a'.repeat(32), apiToken = 'test-only-token';
const options = {accountId, apiToken, now:Date.parse('2026-11-03T22:00:00Z')};
const entry = (name, when, size = 128) => ({
  key: 'backups/system/' + name + '.enc.json', last_modified: when, size,
});
const page = (rows, info = {}) =>
  new Response(JSON.stringify({success:true,result:rows,
    result_info:{is_truncated:false,...info}}), {
    status:200,headers:{'content-type':'application/json'},
  });

test('selects the newest encrypted snapshot across paginated read-only R2 listings', async () => {
  const urls=[], reqs=[];
  const result=await discoverLatestEncryptedSnapshotKey({...options,
    fetchImpl:async(url,init)=>{
      const parsed=new URL(url);
      urls.push(parsed);
      reqs.push(init);
      return urls.length===1
        ? page([entry('older','2026-10-30T10:00:00Z')],{is_truncated:true,cursor:'next-1'})
        : page([
          entry('newest','2026-11-03T21:00:00Z'),
          entry('old','2026-10-20T21:00:00Z'),
        ]);
    },
  });
  assert.equal(result,'backups/system/newest.enc.json');
  assert.equal(urls.length,2);
  assert.equal(urls[0].hostname,'api.cloudflare.com');
  assert.equal(urls[0].searchParams.get('prefix'),'backups/system/');
  assert.equal(urls[1].searchParams.get('cursor'),'next-1');
  assert.equal(reqs.every(i=>i.method==='GET'&&i.redirect==='error'),true);
  assert.equal(reqs.every(i=>i.headers.authorization==='Bearer '+apiToken),true);
});

test('ignores nonencrypted data, improper paths, huge objects and invalid dates', async () => {
  const rows=[
    entry('valid','2026-11-03T10:00:00Z'),
    {key:'secrets/master.key',size:100,last_modified:'2026-11-03T10:00:00Z'},
    {key:'backups/system/../../private.enc.json',size:100,last_modified:'2026-11-03T10:00:00Z'},
    {key:'backups/system/incomplete.enc.json',size:0,last_modified:'2026-11-03T10:00:00Z'},
    entry('huge','2026-11-03T22:00:00Z',513*1024*1024),
    entry('date-invalid','invalid'),
  ];
  const key=await discoverLatestEncryptedSnapshotKey({...options,fetchImpl:async()=>page(rows)});
  assert.equal(key,'backups/system/valid.enc.json');
});
test('automatic recovery never silently selects a stale or future-dated snapshot',async()=>{
  const recent = entry('recent','2026-11-03T20:30:00Z');
  assert.equal(await discoverLatestEncryptedSnapshotKey({...options,fetchImpl:async()=>page([
    entry('stale','2026-10-30T10:00:00Z'), recent,
  ])}), recent.key);
  for (const rows of [
    [entry('old','2026-10-30T10:00:00Z')],
    [entry('future','2026-11-04T08:00:00Z'),entry('old','2026-10-30T10:00:00Z')],
  ]) await assert.rejects(discoverLatestEncryptedSnapshotKey({
    ...options,fetchImpl:async()=>page(rows),
  }), error=>error.code==='ISOLATED_R2_SNAPSHOT_STALE');
  await assert.rejects(discoverLatestEncryptedSnapshotKey({
    ...options,maxAgeMs:0,fetchImpl:async()=>{throw Error('should never fetch');},
  }), error=>error.code==='ISOLATED_R2_LIST_CONFIG_INVALID');
});

test('missing, denied and garbled R2 listings fail closed with safe codes',async()=>{
  for(const [response,code] of [
    [page([]),'ISOLATED_R2_SNAPSHOT_NOT_FOUND'],
    [new Response('',{status:403}),'ISOLATED_R2_LIST_ACCESS_DENIED'],
    [new Response('{invalid',{status:200}),'ISOLATED_R2_LIST_RESPONSE_INVALID'],
    [new Response(JSON.stringify({result:[]}),{status:200}),'ISOLATED_R2_LIST_RESPONSE_INVALID'],
  ]) await assert.rejects(discoverLatestEncryptedSnapshotKey({
    ...options,fetchImpl:async()=>response,
  }), error=>error.code===code&&error.message===code);
});
test('missing cursors, repeated cursors and incomplete pagination cannot select old snapshots',async()=>{
  const old=entry('old','2026-10-29T10:00:00Z');
  for(const [reply,code] of [
    [async()=>page([old],{is_truncated:true}),'ISOLATED_R2_LIST_CURSOR_INVALID'],
    [async()=>page([old],{is_truncated:true,cursor:'again'}),'ISOLATED_R2_LIST_CURSOR_INVALID'],
  ]) {
    let n=0;
    await assert.rejects(discoverLatestEncryptedSnapshotKey({
      ...options,maxPages:3,fetchImpl:async()=>{n++;return reply(n);}
    }),e=>e.code===code);
  }
  await assert.rejects(discoverLatestEncryptedSnapshotKey({
    ...options,maxPages:1,fetchImpl:async()=>page([old],{is_truncated:true,cursor:'next'}),
  }),e=>e.code==='ISOLATED_R2_LIST_PAGE_LIMIT');
});
test('unbounded response body and invalid credentials never yield a candidate',async()=>{
  await assert.rejects(discoverLatestEncryptedSnapshotKey({
    ...options,fetchImpl:async()=>new Response('x'.repeat(2*1024*1024+1)),
  }),e=>e.code==='ISOLATED_R2_LIST_BODY_TOO_LARGE');
  for(const cfg of [{accountId:'bad'}, {apiToken:''}, {maxPages:0}]) {
    await assert.rejects(discoverLatestEncryptedSnapshotKey({...options,...cfg,fetchImpl:async()=>{throw Error('not reached')}}),
      e=>e.code==='ISOLATED_R2_LIST_CONFIG_INVALID');
  }
});

test('manual main-branch restore stays read-only and runs targeted checks without full-suite delay', async()=>{
  const {readFile}=await import('node:fs/promises');
  const workflow=await readFile(new URL('../../.github/workflows/mel-res-05-encrypted-backup-ci.yml',import.meta.url),'utf8');
  assert.match(workflow,/if: github\.event_name != 'workflow_dispatch'\n\s+run: npm test/);
  assert.match(workflow,/isolated-snapshot-restore:\n\s+if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/needs: encrypted-backup/);
  assert.match(workflow,/run: node scripts\/runtime-security-gate\.mjs/);
  assert.match(workflow,/run: node release-tools\/predeploy-backup-refresh\/isolated-restore-runner\.mjs/);
  assert.doesNotMatch(workflow,/run:\s*(?:wrangler deploy|npm run deploy|git push)/);
});
