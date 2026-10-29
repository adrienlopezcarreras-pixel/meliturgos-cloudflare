import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/professor-qwen-kaggle-gpu.yml',import.meta.url),'utf8');
test('Kaggle GPU dispatch requires reviewed corpus dry-run first',()=>{
  const preflight=workflow.indexOf('name: Verify Kaggle corpus before requesting GPU');
  const dispatch=workflow.indexOf('name: Authenticate Kaggle and submit GPU notebook');
  assert.ok(preflight>=0 && dispatch>preflight);
  assert.match(workflow,/kaggle datasets download -d "\$DATASET_SLUG"/);
  assert.match(workflow,/QWEN_DATASET_EXACT_FILES_REQUIRED/);
  assert.match(workflow,/scripts\/train-qwen3-lora.py --dataset .* --dry-run/);
});
