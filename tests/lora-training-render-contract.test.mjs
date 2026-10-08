import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('LoRA trainer preserves source content and turn order when native chat template rejects roles', async () => {
  const source = await readFile(new URL('../scripts/train-mel-lora.py', import.meta.url), 'utf8');
  assert.ok(source.includes('role_preserving_fallback'), 'trainer lost role-preserving fallback');
  assert.ok(source.includes('source_content_rewritten": False'), 'trainer must record that source content is not rewritten');
  assert.ok(source.includes('turn_order_changed": False'), 'trainer must record preserved turn order');
  assert.ok(source.includes('chunks.append(f"[{role.upper()}]\\n{content}\\n")'), 'fallback must wrap roles without rewriting content');
  assert.ok(!source.includes('content = content.strip()'), 'fallback must not trim source text');
});

test('LoRA status exposes training workflow plus durable daily trace instead of obsolete Collector UI state', async () => {
  const source = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
  assert.match(source, /FREE_LORA_TRAINING_WORKFLOW = 'lora-kaggle-free-gpu\.yml'/);
  assert.match(source, /actions\/workflows\/\$\{workflowName\}\/runs\?per_page=10/);
  assert.match(source, /daily_trace: dailyTrace/);
  assert.match(source, /daily_status: dailyStatus/);
  assert.match(source, /\/api\/learning\/lora\/traces/);
  assert.match(source, /\/api\/learning\/lora\/daily-status/);
  assert.doesNotMatch(source, /FREE_LORA_COLLECTOR_WORKFLOW/);
  assert.doesNotMatch(source, /collector_workflow:/);
});
