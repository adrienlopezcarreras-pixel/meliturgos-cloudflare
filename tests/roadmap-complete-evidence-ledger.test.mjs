import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenRoadmap } from '../src/roadmap/master-roadmap.js';
import { ROADMAP_PROOF_SOURCES } from '../src/roadmap/roadmap-truth.js';
import { createCompleteEvidenceLedger } from '../scripts/roadmap-complete-evidence-ledger.mjs';
test('every roadmap entry receives a separate evidence row',()=>{
  const items=flattenRoadmap();
  const ledger=createCompleteEvidenceLedger();
  assert.equal(ledger.summary.total,items.length);
  assert.equal(ledger.items.length,items.length);
  assert.equal(new Set(ledger.items.map(x=>x.id)).size,items.length);
  assert.equal(ledger.summary.mapped_not_certified+ledger.summary.without_source,items.length);
});
test('mapping never becomes fake production certification',()=>{
  const ledger=createCompleteEvidenceLedger();
  assert.equal(ledger.summary.verified_live,0);
  assert.equal(ledger.summary.production_not_evaluated,ledger.summary.total);
  assert.ok(ledger.items.every(x=>x.verified_live===false && x.production_receipt===null));
  for(const row of ledger.items){
    if(Object.hasOwn(ROADMAP_PROOF_SOURCES,row.id)){const source=ROADMAP_PROOF_SOURCES[row.id];const hasRuntime=Boolean((source.capabilities?.length||0)+(source.computerActions?.length||0));assert.equal(row.source_mapping,hasRuntime?'MAPPED_NOT_CERTIFIED':'NO_SOURCE');}
  }
});
test('orphan proof sources are highlighted explicitly',()=>{
  const ledger=createCompleteEvidenceLedger([{id:'sample',title:'Sample',status:'DONE_VERIFIED',priority:'P1'}],{orphan:{capabilities:['test']}});
  assert.deepEqual(ledger.orphan_mappings,['orphan']);
  assert.equal(ledger.summary.without_source,1);
  assert.equal(ledger.summary.orphan_mapping_count,1);
});

test('full roadmap includes 133 historic rows and 43 open software contracts',()=>{
  const ledger=createCompleteEvidenceLedger();
  assert.equal(ledger.summary.total,176,'All 176 roadmap objectives must be individually present');
  const historical=ledger.items.filter(x=>x.declared_status==='DONE_VERIFIED');
  const open=ledger.items.filter(x=>x.declared_status!=='DONE_VERIFIED');
  assert.equal(historical.length,133);
  assert.equal(open.length,43);
  assert.equal(ledger.summary.production_not_evaluated,176);
  assert.equal(ledger.summary.verified_live,0);
});

test('computerActions evidence is indexed but never certified without production execution',()=>{
 const ledger=createCompleteEvidenceLedger([{id:'computer-test',title:'Computer action',status:'DONE_VERIFIED',priority:'P1'}],{'computer-test':{computerActions:['screen.capture']}});
 assert.equal(ledger.items[0].source_mapping,'MAPPED_NOT_CERTIFIED');
 assert.deepEqual(ledger.items[0].required_computer_actions,['screen.capture']);
 assert.equal(ledger.items[0].verified_live,false);
 assert.equal(ledger.summary.verified_live,0);
});
