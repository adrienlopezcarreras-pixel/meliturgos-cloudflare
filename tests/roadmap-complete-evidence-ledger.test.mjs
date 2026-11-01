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
    if(Object.hasOwn(ROADMAP_PROOF_SOURCES,row.id))assert.equal(row.source_mapping,'MAPPED_NOT_CERTIFIED');
  }
});
test('orphan proof sources are highlighted explicitly',()=>{
  const ledger=createCompleteEvidenceLedger([{id:'sample',title:'Sample',status:'DONE_VERIFIED',priority:'P1'}],{orphan:{capabilities:['test']}});
  assert.deepEqual(ledger.orphan_mappings,['orphan']);
  assert.equal(ledger.summary.without_source,1);
  assert.equal(ledger.summary.orphan_mapping_count,1);
});
