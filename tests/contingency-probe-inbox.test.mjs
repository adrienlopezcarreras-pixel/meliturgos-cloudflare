import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { sqliteD1 } from './helpers/sqlite-d1.mjs';
import { signContingencyProbeReport, verifyContingencyProbeReports } from '../src/continuity/contingency-probe-auth.js';
import { acceptContingencyProbe, readContingencyProbeInbox, CONTINGENCY_PERSISTED_PROBE_MAX_AGE_MS } from '../src/continuity/contingency-probe-inbox.js';
import { classifyHttpAuthSurface } from '../src/security/http-auth-policy.js';

const secret = 'test-only-signed-external-monitor-0123456789-abcdefghijklmnopqrstuvwxyz';
const now = Date.parse('2026-11-03T21:00:00Z');
const url = 'https://mel.example.net/api/internal/contingency-probe';
async function signed(up, time, part = 'cloudflare') {
  return signContingencyProbeReport({
    part, up, observer:'github-actions-external-monitor',
    evidence_id:'github-run-synthetic-' + time, observed_at:new Date(time).toISOString(),
  }, {secret,cryptoImpl:webcrypto});
}
function request(report, method='POST') {
  return new Request(url,{method,headers:{'content-type':'application/json'},body:method==='POST'?JSON.stringify(report):undefined});
}
function db() { return sqliteD1({maintenanceFence:true}); }
async function ingest(database, report, key = secret) {
  return acceptContingencyProbe(request(report),{DB:database,MEL_CONTINGENCY_PROBE_HMAC_KEY:key},
    {now,cryptoImpl:webcrypto});
}

test('ingestion is specifically delegated to HMAC validation, never public anonymous write',async()=>{
  assert.equal(classifyHttpAuthSurface(new Request(url,{method:'POST'})).kind,'DELEGATED_STRONG_AUTH');
  assert.equal(classifyHttpAuthSurface(new Request('https://mel.example.net/api/internal/other',{method:'POST'})).kind,'OWNER_AUTH');
  const database=db();
  try {
    const fresh=await signed(false,now-1000);
    assert.equal((await ingest(database,fresh,'no')).status,503);
    assert.equal((await acceptContingencyProbe(request(fresh),{MEL_CONTINGENCY_PROBE_HMAC_KEY:secret},{now,cryptoImpl:webcrypto})).status,503);
    const forged=await ingest(database,{...fresh,up:true});
    assert.equal(forged.status,401);
    assert.deepEqual(await readContingencyProbeInbox(database),[]);
    const invalid=await acceptContingencyProbe(new Request(url,{method:'POST',body:'{invalid'}),{DB:database,MEL_CONTINGENCY_PROBE_HMAC_KEY:secret},{now,cryptoImpl:webcrypto});
    assert.equal(invalid.status,400);
  }finally {database.close();}
});

test('fresh HMAC report is committed to D1 once and remains only authenticated, scoped evidence',async()=>{
  const database=db();
  try {
    const first=await signed(false,now-5000,'github');
    const saved=await ingest(database,first);
    assert.equal(saved.status,202);
    assert.equal((await saved.json()).failover_performed,false);
    const rows=await readContingencyProbeInbox(database);
    assert.equal(rows.length,1);
    assert.equal(rows[0].evidence_id,first.evidence_id);
    const verified=await verifyContingencyProbeReports(rows,{secret,now,cryptoImpl:webcrypto});
    assert.equal(verified.verified_count,1);
    assert.equal(verified.observed.githubUp,false);
    assert.equal((await ingest(database,first)).status,409,'replay does not refresh last_seen');
    const stale=await signed(false,now-181000,'github');
    assert.equal((await ingest(database,stale)).status,401,'stale cannot be accepted');
    const older=await signed(true,now-6000,'github');
    assert.equal((await ingest(database,older)).status,409,'older signed UP cannot hide newer DOWN');
    const newest=await signed(true,now-1000,'github');
    assert.equal((await ingest(database,newest)).status,202);
    const latest=await readContingencyProbeInbox(database);
    assert.equal(latest.length,1);
    assert.equal(latest[0].up,true);
    assert.equal(latest[0].observed_at,newest.observed_at);
  }finally {database.close();}
});

test('actual Worker refuses anonymous/tampered signed reports, accepts only a valid HMAC',async()=>{
  const database=db();
  try {
    const valid=await signed(true,Date.now()-1000);
    const env={DB:database,MEL_CONTINGENCY_PROBE_HMAC_KEY:secret};
    const fake=await worker.fetch(request({...valid,signature:'0'.repeat(64)}),env);
    assert.equal(fake.status,401);
    const verified=await worker.fetch(request(valid),env);
    assert.equal(verified.status,202);
    assert.equal((await verified.json()).status,'SIGNED_PROBE_PERSISTED');
  }finally {database.close();}
});

test('GitHub monitor delivers the signed envelope without claiming automatic failover',()=>{
  const runner=readFileSync(new URL('../scripts/run-external-contingency-monitor.mjs',import.meta.url),'utf8');
  const workflow=readFileSync(new URL('../.github/workflows/contingency-external-monitor.yml',import.meta.url),'utf8');
  const runtime=readFileSync(new URL('../src/evolution/autonomy-runtime.js',import.meta.url),'utf8');
  assert.match(runner,/\/api\/internal\/contingency-probe/);
  assert.match(runner,/method: 'POST', redirect: 'manual'/);
  assert.match(runner,/JSON\.stringify\(signed\)/);
  assert.match(workflow,/artifacts\/contingency\/probe-delivery\.json/);
  assert.match(runtime,/readContingencyProbeInbox\(env\?\.DB\)/);
  assert.match(runtime,/replacementAttestations: Array\.isArray\(job\?\.result_json\?\.replacement_probes\)/);
  assert.match(runtime,/MEL_REPLACEMENT_PROBE_HMAC_KEY/);
  assert.match(runtime,/expectedSourceSha: deployedCandidateSha\(env\)/);
  assert.match(runtime,/verifyContingencyProbeReports\(\[\.\.\.externalReports, \.\.\.jobReports\]/);
  assert.match(runner,/Failover performed: \*\*No\*\*/);
});

test('probe ingress enforces 4 KiB during streaming without relying on Content-Length or character count', async () => {
  const database=db();
  try {
    const env={DB:database,MEL_CONTINGENCY_PROBE_HMAC_KEY:secret};
    const utf8 = new Request(url,{method:'POST',body:'é'.repeat(3000)});
    assert.equal(utf8.headers.get('content-length'),null);
    const response=await acceptContingencyProbe(utf8,env,{now,cryptoImpl:webcrypto});
    assert.equal(response.status,413);
    assert.equal((await response.json()).code,'PROBE_BODY_TOO_LARGE');

    const chunks = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(2500));
        controller.enqueue(new Uint8Array(2500));
        controller.close();
      },
    });
    const streaming = new Request(url,{method:'POST',body:chunks,duplex:'half'});
    const streamed = await acceptContingencyProbe(streaming,env,{now,cryptoImpl:webcrypto});
    assert.equal(streamed.status,413);
    assert.equal((await streamed.json()).code,'PROBE_BODY_TOO_LARGE');
    assert.deepEqual(await readContingencyProbeInbox(database),[]);
  } finally {database.close();}
});

test('persisted signed proof spans the 15-minute monitor cadence, not a skipped-interval outage',async()=>{
  assert.equal(CONTINGENCY_PERSISTED_PROBE_MAX_AGE_MS,20*60_000);
  const lastScheduledReport=await signed(false,now-16*60_000,'github');
  // A delayed POST cannot inject old evidence into D1.
  const database=db();
  try{
    assert.equal((await ingest(database,lastScheduledReport)).status,401);
  }finally{database.close();}
  // But previously accepted, HMAC-verified D1 observations remain usable until
  // the next scheduled monitor run, with no automatic failover permission.
  const withinWindow=await verifyContingencyProbeReports([lastScheduledReport],{
    secret,now,maxAgeMs:CONTINGENCY_PERSISTED_PROBE_MAX_AGE_MS,cryptoImpl:webcrypto,
  });
  assert.equal(withinWindow.verified_count,1);
  assert.equal(withinWindow.observed.githubUp,false);
  const oldDefault=await verifyContingencyProbeReports([lastScheduledReport],{
    secret,now,cryptoImpl:webcrypto,
  });
  assert.equal(oldDefault.verified_count,0);
  const tooOld=await signed(false,now-21*60_000,'github');
  const expired=await verifyContingencyProbeReports([tooOld],{
    secret,now,maxAgeMs:CONTINGENCY_PERSISTED_PROBE_MAX_AGE_MS,cryptoImpl:webcrypto,
  });
  assert.equal(expired.verified_count,0);
  assert.equal(expired.details.github.status,'UNKNOWN');
  const runtime=readFileSync(new URL('../src/evolution/autonomy-runtime.js',import.meta.url),'utf8');
  assert.match(runtime,/maxAgeMs: CONTINGENCY_PERSISTED_PROBE_MAX_AGE_MS/);
});
