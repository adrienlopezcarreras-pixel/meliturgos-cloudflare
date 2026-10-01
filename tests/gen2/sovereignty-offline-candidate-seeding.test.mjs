import test from 'node:test';
import assert from 'node:assert/strict';
import { sqliteD1 } from '../helpers/sqlite-d1.mjs';
import { SovereigntyCandidateStore } from '../../src/portability/sovereignty-candidate-store.js';
import {
  runCompanionInfrastructurePrevalidationRuntime,
  COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES,
} from '../../src/portability/companion-infrastructure-prevalidation-runtime.js';
import { runCompanionSourceControlPrevalidationRuntime } from '../../src/portability/companion-source-control-prevalidation-runtime.js';

async function offlineCompanionDb(){
  const db=sqliteD1();
  await db.prepare(`CREATE TABLE computer_devices (
    id TEXT PRIMARY KEY,
    last_seen_at INTEGER NOT NULL,
    halted INTEGER NOT NULL DEFAULT 0,
    platform TEXT NOT NULL
  )`).run();
  return db;
}

test('offline Companion still persists all eight infrastructure alternatives as UNVERIFIED candidates',async()=>{
  const db=await offlineCompanionDb();
  try{
    const now=Date.parse('2026-10-01T06:00:00Z');
    const result=await runCompanionInfrastructurePrevalidationRuntime({DB:db},{now,force:true});
    assert.equal(result.ok,true);
    assert.equal(result.skipped,true);
    assert.equal(result.reason,'COMPANION_OFFLINE');
    assert.equal(result.candidate_count,COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES.length);

    const rows=await new SovereigntyCandidateStore(db).list({limit:50});
    assert.equal(rows.length,8);
    assert.equal(rows.every(row=>row.status==='UNVERIFIED'),true);
    assert.deepEqual(
      rows.map(row=>row.layer).sort(),
      COMPANION_INFRASTRUCTURE_LOCAL_CANDIDATES.map(row=>row.layer).sort(),
    );
  }finally{db.close();}
});

test('offline Companion still persists local Git alternative without inventing a live proof',async()=>{
  const db=await offlineCompanionDb();
  try{
    const now=Date.parse('2026-10-01T06:00:00Z');
    const result=await runCompanionSourceControlPrevalidationRuntime(
      {DB:db},
      {now,force:true,sourceSha:'a'.repeat(40)},
    );
    assert.equal(result.ok,true);
    assert.equal(result.skipped,true);
    assert.equal(result.reason,'COMPANION_OFFLINE');
    assert.equal(result.candidate_count,1);

    const rows=await new SovereigntyCandidateStore(db).list({layer:'source_control'});
    assert.equal(rows.length,1);
    assert.equal(rows[0].id,'companion-local-git');
    assert.equal(rows[0].status,'UNVERIFIED');
    assert.equal(rows[0].metadata.prevalidated,false);
    assert.equal(rows[0].metadata.activation_allowed,false);
  }finally{db.close();}
});
