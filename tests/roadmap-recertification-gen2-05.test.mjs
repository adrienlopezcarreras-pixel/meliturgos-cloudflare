import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultCapabilityBus } from '../src/capabilities/default-bus.js';
import { ROADMAP_RECERTIFICATION_PROFILES, executeRuntimeRecertification } from '../src/roadmap/runtime-recertification.js';
import { proofRecipeContract } from '../src/roadmap/proof-recipe-contracts.js';

const CAPABILITY='models.council-contract.verify';

test('GEN2-05 diagnostic uses only core, low-risk, no-input local contract',async()=>{
  let externalCalls=0;
  const bus=createDefaultCapabilityBus({env:{AI:{async run(){externalCalls++;throw Error('EXTERNAL_AI_MUST_NOT_BE_CALLED');}}}});
  const record=bus.describe(CAPABILITY);
  assert.equal(ROADMAP_RECERTIFICATION_PROFILES['GEN2-05'],CAPABILITY);
  assert.equal(record.provider,'core');
  assert.equal(record.category,'diagnostic');
  assert.equal(record.risk,'LOW');
  assert.equal(record.enabled,true);
  assert.deepEqual(record.permissions,[]);
  const result=await bus.execute(CAPABILITY,{}, {owner:'mel-autonomy',permissions:[],requestId:'gen2-05-isolated-test'});
  assert.deepEqual(result,{ok:true,critiques:2,syntheses:1,rejected:1});
  assert.equal(externalCalls,0);
});

test('GEN2-05 recipe remains auxiliary, not a certification of the parent',()=>{
  const contract=proofRecipeContract('ROADMAP-PROOF-GEN2-05');
  assert.equal(contract.mode,'IMPLEMENT');
  assert.equal(contract.required_proof,'DIFF_TESTS_EXACT_SHA_CI');
  assert.ok(contract.code_paths.includes('src/capabilities/default-bus.js'));
  assert.ok(contract.code_paths.includes('src/roadmap/runtime-recertification.js'));
  assert.ok(contract.test_paths.includes('tests/roadmap-recertification-gen2-05.test.mjs'));
  assert.ok(contract.acceptance.some(text=>text.includes('ne valide pas le point parent')));
});

test('GEN2-05 runtime cannot certify without a planning job and owner/runtime evidence',async()=>{
  const job={id:'gen2-05-test',requested_by:'mel-autonomy',status:'WAITING_DEPENDENCY',optional_context:{roadmap_id:'GEN2-05',work_mode:'VERIFY_RUNTIME'}};
  const result=await executeRuntimeRecertification({}, {},job);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.code,'ROADMAP_RECERTIFICATION_ADMISSION_REQUIRED');
});
