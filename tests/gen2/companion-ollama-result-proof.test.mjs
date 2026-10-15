import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOptionalAiResultProof as check} from '../../src/devices/companion-compute-admission.js';
const plan={schema:'mel.sovereignty.local-command/v1',steps:[{action:'sovereignty.ai.invoke',payload:{}}]};
const output={action:'sovereignty.ai.invoke',backend:'ollama-localhost',text:'Bonjour, comment puis-je aider ?',model:'qwen2.5:1.5b'};
test('Ollama success requires a real usable answer and model evidence',()=>{
 assert.deepEqual(check({plan,result:{outputs:[output]}}),{ok:true,reason:'LOCAL_AI_RESULT_VALID'});
 for(const invalid of [null,{}, {outputs:[]},{outputs:[{}]},
 {outputs:[{...output,text:''}]},{outputs:[{...output,text:'    '}]},
 {outputs:[{...output,model:''}]},{outputs:[{...output,text:'x'.repeat(32001)}]},
 {outputs:[{...output,action:'clipboard.read'}]},
 {outputs:[{...output,backend:'remote-provider'}]},
 {outputs:[output,output]}])
   assert.equal(check({plan,result:invalid}).ok,false);
});
test('explicit requested model must match the model used by local engine',()=>{
 const restricted={...plan,steps:[{...plan.steps[0],payload:{model:'qwen2.5:1.5b'}}]};
 assert.equal(check({plan:restricted,result:{outputs:[output]}}).ok,true);
 assert.equal(check({plan:restricted,result:{outputs:[{...output,model:'other-model'}]}}).code,'LOCAL_AI_RESULT_MODEL_MISMATCH');
});
test('non Ollama command retains separate validation',()=>{
 assert.equal(check({plan:{steps:[{action:'clipboard.read'}]},result:null}).ok,true);
});
