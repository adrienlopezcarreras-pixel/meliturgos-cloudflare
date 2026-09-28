import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('autonomy API exposes authenticated live technical sovereignty status', async()=>{
  const source=await readFile(new URL('../../src/evolution/autonomy-api.js',import.meta.url),'utf8');
  assert.match(source,/\/api\/gen2\/autonomy\/sovereignty/);
  assert.match(source,/D1AlternativeRegistryStore/);
  assert.match(source,/sovereigntyCoverageFromRegistry/);
  assert.match(source,/liveTechnicalSovereigntyReport/);
  assert.match(source,/TECHNICAL_SOVEREIGNTY_STATUS/);
  assert.match(source,/planSovereigntyGapClosure/);
  assert.match(source,/gap_plan:/);
  assert.match(source,/SovereigntyCandidateStore/);
  assert.match(source,/replacement_candidates:/);
  assert.match(source,/configured_ai_readiness:/);
  assert.match(source,/secret_values_exposed:\s*false/);
  assert.match(source,/missing_credentials:/);
  assert.match(source,/localSovereigntyProfile/);
  assert.match(source,/local_sovereignty:/);
  assert.match(source,/fully_sovereign:/);
});

test('sovereignty status remains behind normal autonomy authentication', async()=>{
  const source=await readFile(new URL('../../src/evolution/autonomy-api.js',import.meta.url),'utf8');
  const sovereignty=source.indexOf("const isSovereignty");
  const auth=source.indexOf("const auth = requireAuth(request, env);");
  const handler=source.indexOf("if (isSovereignty)");
  assert.ok(sovereignty>0);
  assert.ok(auth>sovereignty);
  assert.ok(handler>auth);
});
