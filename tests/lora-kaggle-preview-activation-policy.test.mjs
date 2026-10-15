import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('.github/workflows/lora-kaggle-free-collect.yml', 'utf8');
const step = source.split('- name: Benchmark exact Kaggle adapter')[1]?.split('\n      - name:')[0] || '';

test('automatic main push benchmarks LoRA without activating the preview', () => {
  assert.match(step, /ACTIVATE_PREVIEW:\s*\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.activate_preview && 'true' \|\| 'false' \}\}/);
  assert.doesNotMatch(step, /github\.event_name == 'push' && 'true'/);
  assert.match(step, /--allow-not-activated true/);
});

test('explicit manual preview activation must satisfy the finalize authorization guard', () => {
  assert.match(step, /MEL_LORA_ACTIVATION_APPROVED:\s*\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.activate_preview && 'true' \|\| 'false' \}\}/);
  assert.match(step, /--activate "\$ACTIVATE_PREVIEW"/);
});
