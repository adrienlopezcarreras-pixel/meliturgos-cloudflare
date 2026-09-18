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
