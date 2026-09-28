import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlternativeRegistry } from '../../src/portability/prevalidated-alternative-registry.js';
import { liveTechnicalSovereigntyReport } from '../../src/portability/technical-sovereignty-live.js';

const now=Date.now();
const proof={
  isolated_test:true,smoke:true,rollback:true,export:true,import:true,activate:true,
  verified_at:new Date(now-1000).toISOString(),
  expires_at:new Date(now+86400000).toISOString(),
  evidence_ref:'ci://proof',source_sha:'a'.repeat(40),
};

test('live sovereignty report consumes validated registry alternatives instead of static placeholders',()=>{
  const registry=createAlternativeRegistry([
    {id:'ai.alt',layer:'ai',provider:'alt-ai',adapter_id:'ai.http.alt',added_cost_eur:0,proof},
    {id:'backup.alt',layer:'backup_restore',provider:'drive',adapter_id:'drive.cold',added_cost_eur:0,proof},
  ]);
  const report=liveTechnicalSovereigntyReport(registry,{maxAutonomy:true});
  assert.ok(report.layers.ai.alternative_adapters.includes('ai.http.alt'));
  assert.ok(report.layers.backup_restore.alternative_adapters.includes('drive.cold'));
  assert.equal(report.layers.ai.ready,true);
  assert.equal(report.layers.backup_restore.ready,true);
});

test('live sovereignty report still refuses full sovereignty when capabilities themselves are incomplete',()=>{
  const rows=[
    ['ai','a'],['runtime','r'],['storage','s'],['database','d'],['source_control','g'],
    ['ci_cd','c'],['secrets_identity','i'],['scheduler','q'],['observability','o'],['backup_restore','b'],
  ].map(([layer,id])=>({id:'alt.'+id,layer,provider:'p.'+id,adapter_id:'adapter.'+id,added_cost_eur:0,proof}));
  const report=liveTechnicalSovereigntyReport(createAlternativeRegistry(rows),{maxAutonomy:true});
  assert.equal(report.fully_sovereign,false);
  assert.ok(report.blocked_layers.some(row=>row.id==='runtime'));
  assert.ok(report.blocked_layers.some(row=>row.id==='secrets_identity'));
});
