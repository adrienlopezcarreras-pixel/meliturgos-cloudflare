import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCompanionLocalAiAdapter } from '../src/portability/companion-local-ai-adapter.js';

const packet=JSON.parse(readFileSync('prepared/MEL-UI-AUDIT-05.json','utf8'));
const native=packet.changes.find(file=>file.path==='src/api/native-companion-fallback.js');
const fallback=runInNewContext(native.content.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')
 +'\ntryOptionalNativeCompanionFallback;', {createCompanionLocalAiAdapter}, {timeout:1000});

test('the actual prepared UI-05 payload refuses offline, denied and HALT receipts',async()=>{
 assert.equal(packet.roadmap_id,'MEL-UI-AUDIT-05');
 assert.deepEqual(packet.changes.map(file=>file.path).sort(),[
  'src/api/native-companion-fallback.js','tests/full-interface-computer.test.mjs','tests/native-chat-companion-fallback.test.mjs']);
 for(const code of ['COMPUTER_OFFLINE','PERMISSION_DENIED','OWNER_HALT_ACTIVE']){
  let calls=0;
  assert.equal(await fallback({env:{},messages:[{role:'user',content:'bonjour'}],
   execute:async()=>{calls++;return {ok:true,code,text:'obsolete text'};}}),null);
  assert.equal(calls,1);
 }
});

test('the serialized UI-05 payload keeps a software double separate from physical evidence',async()=>{
 const result=await fallback({env:{},messages:[{role:'user',content:'bonjour'}],
  execute:async()=>({ok:true,text:'synthetic text',backend:'software-test-double',hardware_test_performed:true})});
 assert.equal(result.text,'synthetic text');
 assert.equal(result.provenance.hardware_test_performed,false);
 assert.equal(result.provenance.evidence_scope,'INFERENCE_RESPONSE');
});

test('serialized offline classifier cannot certify a fabricated paired-device receipt',()=>{
 const classify=runInNewContext(native.content.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'')
  +'\nclassifyCompanionHardwareControl;',{}, {timeout:1000});
 const result=classify('screen',{source:'paired-windows-companion',status:'SUCCESS',ok:true,
  physical_receipt:{kind:'ON_DEVICE_OBSERVED',control:'screen',device_id:'fixture',observed_at:123}});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.physical_verified,false);
 assert.equal(result.reason,'PHYSICAL_PROOF_UNVERIFIED');
});
