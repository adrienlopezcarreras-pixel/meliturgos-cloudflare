import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('src/router.js','utf8');
const start=source.indexOf('if (path === "/api/gen2/dashboard-summary"');
const end=source.indexOf('if (path === "/api/gen2/',start+30);
const section=source.slice(start,end>start?end:start+5500);
test('dashboard shows registered health rather than claiming actual execution',()=>{
  assert.ok(start>=0,'dashboard route exists');
  assert.match(section,/proof_scope: "REGISTERED_HEALTH_ONLY"/);
  assert.match(section,/individual_execution_proof_included: false/);
  assert.match(section,/saines\/protégées \(statut, non exécution\)/);
  assert.doesNotMatch(section,/fonctionnelles/);
});
test('health summary remains backward compatible but never starts live capability executions',()=>{
  assert.match(section,/\bfunctional, healthy, protected:/);
  assert.match(section,/const functional = healthy \+ protectedCount/);
  assert.doesNotMatch(section,/capability\.audit|capability\.audit\.status/);
});
