import test from 'node:test';
import assert from 'node:assert/strict';
import {sqliteD1} from './helpers/sqlite-d1.mjs';
import {MASTER_ROADMAP,flattenRoadmap} from '../src/roadmap/master-roadmap.js';
import {computeRoadmapTruth} from '../src/roadmap/roadmap-truth.js';
import {createCompleteEvidenceLedger} from '../scripts/roadmap-complete-evidence-ledger.mjs';

test('176-item ledger reflects D1 runtime evidence, not 133 historical declarations',async()=>{
 const db=sqliteD1();
 await db.prepare('CREATE TABLE audit_logs(id INTEGER PRIMARY KEY, action TEXT, details_json TEXT, created_at INTEGER)').run();
 await db.prepare('CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)').run();
 const now=Date.parse('2026-11-01T20:00:00Z');
 const insert=async(cap,status,time)=>db.prepare('INSERT INTO audit_logs(action,details_json,created_at) VALUES(?,?,?)').bind('capability_bus',JSON.stringify({capability:cap,status}),time).run();
 await insert('code.read','SUCCEEDED',now-3600000);
 await insert('code.search','SUCCEEDED',now-9*86400000); // stale; never certify
 await insert('augmentio.fanout','FAILED',now-3600000);
 const truth=await computeRoadmapTruth(db,MASTER_ROADMAP,{now});
 assert.equal(truth.available,true);
 assert.equal(truth.total,176);
 const ledger=createCompleteEvidenceLedger(flattenRoadmap(),undefined,truth);
 assert.equal(ledger.items.length,176);
 assert.equal(ledger.summary.production_not_evaluated,0);
 assert.equal(ledger.items.find(x=>x.id==='MEL-CODE-01').production_verification,'VERIFIED_LIVE');
 assert.equal(ledger.items.find(x=>x.id==='MEL-CODE-01').production_receipt.proofs[0].id,'code.read');
 assert.equal(ledger.items.find(x=>x.id==='MEL-CODE-02').verified_live,false);
 assert.equal(ledger.items.find(x=>x.id==='MEL-AUG-01').production_verification,'BROKEN');
 assert.equal(ledger.items.find(x=>x.id==='MEL-AUG-01').production_receipt,null);
 assert.equal(ledger.summary.verified_live,truth.counts.VERIFIED_LIVE);
 assert.ok(ledger.summary.verified_live<176);
});
test('unavailable D1 never reports a verified roadmap objective',async()=>{
 const truth=await computeRoadmapTruth(null,MASTER_ROADMAP);
 assert.equal(truth.available,false);
 const ledger=createCompleteEvidenceLedger(flattenRoadmap(),undefined,truth);
 assert.equal(ledger.summary.total,176);
 assert.equal(ledger.summary.verified_live,0);
 assert.equal(ledger.summary.production_not_evaluated,176);
});
