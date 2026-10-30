import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/professor-qwen-kaggle-gpu.yml',import.meta.url),'utf8');
test('Kaggle Qwen3 kernel metadata title maps to its stable id slug',()=>{
  const title=workflow.match(/'title':'([^']+)'/);
  const id=workflow.match(/\/mel-qwen3-gated-gpu'/);
  assert.ok(title);
  assert.ok(id);
  assert.equal(title[1].toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),'mel-qwen3-gated-gpu');
  assert.match(workflow,/KAGGLE_GPU_DISPATCHED_UNVERIFIED/);
});
