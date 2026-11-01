import test from 'node:test';
import assert from 'node:assert/strict';
import {createDefaultCapabilityBus} from '../src/capabilities/default-bus.js';
import {sqliteD1} from './helpers/sqlite-d1.mjs';

test('roadmap.evidence.read returns 176 unverified items when DB is missing',async()=>{
 const bus=createDefaultCapabilityBus({env:{}});
 const ledger=await bus.execute('roadmap.evidence.read',{}, {owner:'test',permissions:[]});
 assert.equal(ledger.summary.total,176);
 assert.equal(ledger.production_truth_available,false);
 assert.equal(ledger.summary.verified_live,0);
 assert.equal(ledger.summary.production_not_evaluated,176);
});
test('roadmap.evidence.read joins recorded D1 capability executions by item ID',async()=>{
 const db=sqliteD1();
 await db.prepare('CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,action TEXT,details_json TEXT,created_at INTEGER)').run();
 await db.prepare('CREATE TABLE computer_commands(id TEXT PRIMARY KEY,device_id TEXT,session_id TEXT,plan_json TEXT,status TEXT,created_at INTEGER,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)').run();
 await db.prepare('INSERT INTO audit_logs(action,details_json,created_at) VALUES(?,?,?)').bind('capability_bus',JSON.stringify({capability:'code.read',status:'SUCCEEDED'}),Date.now()-1000).run();
 const bus=createDefaultCapabilityBus({env:{DB:db}});
 const ledger=await bus.execute('roadmap.evidence.read',{}, {owner:'test',permissions:[]});
 assert.equal(ledger.production_truth_available,true);
 assert.equal(ledger.summary.total,176);
 assert.equal(ledger.items.find(x=>x.id==='MEL-CODE-01').verified_live,true);
 assert.equal(ledger.items.find(x=>x.id==='MEL-CODE-02').verified_live,false);
 assert.equal(ledger.items.find(x=>x.id==='MEL-CODE-01').production_receipt.proofs[0].id,'code.read');
});
