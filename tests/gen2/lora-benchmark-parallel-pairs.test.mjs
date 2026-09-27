import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA canonical and impact baseline/candidate pairs run concurrently', async () => {
  const source=await readFile(new URL('../../src/learning/operator-actions.js', import.meta.url),'utf8');
  const start=source.indexOf('export async function runOperatorLoraBenchmark');
  const end=source.indexOf('export async function prepareOperatorLora', start);
  const block=source.slice(start,end);

  assert.match(block,/const \[baseline, candidate\] = await Promise\.all\(\[/);
  assert.match(block,/trigger: 'lora-gate-baseline'/);
  assert.match(block,/trigger: 'lora-gate-candidate'/);
  assert.match(block,/const \[impactBaseline, impactCandidate\] = await Promise\.all\(\[/);
  assert.match(block,/compareLoraImpact\(impactBaseline, impactCandidate\)/);
  assert.match(block,/canonical_gate_passed: decision\.promote === true/);
  assert.match(block,/impact_gate_passed: impactGatePassed/);
});
