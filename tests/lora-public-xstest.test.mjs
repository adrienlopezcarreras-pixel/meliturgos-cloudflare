import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('every LoRA cycle is scored on the public XSTest sample, baseline and adapter', async () => {
  const impact = await readFile('scripts/run-local-lora-impact.py', 'utf8');
  assert.match(impact, /github\.com\/paul-rottger\/xstest/);
  assert.equal((impact.match(/"id": "xstest-\d+"/g) || []).length, 30);
  assert.match(impact, /"public":run_public_xstest\(model,tokenizer,torch\)/);
  assert.match(impact, /"public_benchmarks":public/);
  const kaggle = await readFile('kaggle/mel-lora-uncensored/run.py', 'utf8');
  assert.match(kaggle, /"public_benchmarks": impact\.get\("public_benchmarks", \{\}\)/);
  const workflow = await readFile('.github/workflows/lora-kaggle-free-gpu.yml', 'utf8');
  assert.match(workflow, /public_benchmarks:run\.public_benchmarks\|\|\{\}/);
});
