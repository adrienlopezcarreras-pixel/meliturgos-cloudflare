import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter, classifyTask } from '../src/models/ModelRouter.js';

test('canonical model router replaces the old static specialist selector', () => {
  assert.equal(classifyTask('écris du code JavaScript'),'coding');
  assert.equal(classifyTask('explique pourquoi cela arrive'),'reasoning');
  assert.equal(classifyTask('bonjour'),'conversation');
  const router=new ModelRouter({invoke:async()=>({response:'ok'})});
  assert.equal(router.normalizeTask('coding'),'CODE');
  assert.equal(router.normalizeTask('reasoning'),'REASONING');
  assert.equal(router.normalizeTask('conversation'),'GENERAL');
});

test('missing model provider fails closed instead of pretending a specialist ran', async () => {
  const router=new ModelRouter();
  await assert.rejects(()=>router.execute({task:'GENERAL',messages:[{role:'user',content:'test'}]}),/MODEL_PROVIDER_UNCONFIGURED/);
});
