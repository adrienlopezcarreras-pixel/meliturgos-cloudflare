import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/professor-live-learning-entry.js',import.meta.url),'utf8');
test('Abliteration GPU reports readiness blocker without dispatching or claiming proof',()=>{
  assert.match(source,/ABLITERATION_GPU_DISPATCH_NOT_CONFIGURED/);
  assert.ok(source.includes('scripts/abliteration-gpu-runner.py'));
  assert.match(source,/GPU with >=40 GiB VRAM/);
  assert.match(source,/gpu_training_performed:false/);
  assert.match(source,/checkpoint_verified:false,model_activated:false/);
  assert.doesNotMatch(source,/ABLITERATION_GPU_EXECUTOR_NOT_IMPLEMENTED/);
});
