import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/professor-qwen-kaggle-gpu.yml',import.meta.url),'utf8');
test('Kaggle GPU submit blocked behind verified bounded archive',()=>{
 const valid=workflow.indexOf('name: Verify Kaggle corpus before requesting GPU');
 const submit=workflow.indexOf('name: Authenticate Kaggle and submit GPU notebook');
 assert.ok(valid>=0&&submit>valid);
 const gate=workflow.slice(valid,submit);
 assert.match(gate,/sorted\(names\)!=\['dataset.jsonl','sources.json'\]/);
 assert.match(gate,/e\.file_size > 20_000_000/);
 assert.match(gate,/src\.read\(65536\)/);
 assert.match(gate,/total>20_000_000/);
 assert.match(gate,/train-qwen3-lora\.py --dataset .* --dry-run/);
 assert.doesNotMatch(gate,/kaggle kernels push/);
});
