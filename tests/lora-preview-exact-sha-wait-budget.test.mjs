import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const collector = readFileSync('.github/workflows/lora-kaggle-free-collect.yml', 'utf8');
const preview = readFileSync('.github/workflows/deploy-candidate-preview.yml', 'utf8');
const start = collector.indexOf('- name: Wait for isolated preview exact collector SHA');
const end = collector.indexOf('- name: Benchmark exact Kaggle adapter', start);
const gate = collector.slice(start, end);

test('preview exact-SHA gate spans the preview job time budget without an unbounded wait', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(preview, /timeout-minutes: 40/);
  assert.match(gate, /timeout-minutes: 46/);
  assert.match(gate, /deadline=\$\(\(SECONDS \+ 43 \* 60\)\)/);
  assert.match(gate, /while \[ "\$SECONDS" -lt "\$deadline" \]; do/);
  assert.match(gate, /sleep 15/);
  assert.doesNotMatch(gate, /seq 1 24/);
});
test('timeout cannot become a successful benchmark on a stale preview', () => {
  assert.match(gate, /PREVIEW_EXPECTED_SHA: \$\{\{ github\.sha \}\}/);
  assert.match(gate, /node scripts\/check-lora-preview-version\.mjs \/tmp\/mel-lora-preview-version\.json "\$PREVIEW_EXPECTED_SHA"/);
  assert.match(gate, /if \[ "\$\{STATUS\}" = "200" \] && node/);
  assert.match(gate, /LORA_PREVIEW_EXACT_SHA_TIMEOUT/);
  assert.match(gate, /exit 1/);
});
test('benchmark stays gated behind the completed exact preview proof', () => {
  assert.ok(collector.indexOf('Benchmark exact Kaggle adapter') > end - 50);
  assert.match(collector.slice(end, end + 240), /if: steps\.status\.outputs\.complete == 'true'/);
});

test('an unscheduled preview fails early instead of burning the entire wait budget', () => {
  assert.match(gate, /absent_preview_checks=0/);
  assert.match(gate, /LORA_PREVIEW_WORKFLOW_NOT_FOUND/);
  assert.match(gate, /absent_preview_checks=\$\(\(absent_preview_checks \+ 1\)\)/);
  assert.match(gate, /if \[ "\$absent_preview_checks" -ge 8 \]; then/);
  assert.match(gate, /LORA_PREVIEW_EXACT_SHA_NOT_SCHEDULED/);
  assert.match(gate, /LORA_PREVIEW_WORKFLOW_NOT_SUCCESSFUL/);
  // A pending exact-SHA run must reset the no-run counter and retain
  // the normal 43-minute bounded wait for actual preview validation.
  assert.match(gate, /absent_preview_checks=0\s*fi\s*echo "LORA_PREVIEW_WORKFLOW_NOT_YET_SUCCESSFUL/);
});
