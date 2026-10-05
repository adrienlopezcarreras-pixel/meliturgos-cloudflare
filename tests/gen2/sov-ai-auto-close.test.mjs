import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI SOV auto-close watches only the missing AI layer and preserves the 10/10 gate', async()=>{
  const source=await readFile(new URL('../../.github/workflows/mel-sov-ai-auto-close.yml',import.meta.url),'utf8');
  assert.ok(source.includes("cron: '11 * * * *'"));
  assert.ok(source.includes('refresh=ai_local'));
  assert.ok(source.includes('MEL_SOV_AI_WAITING_FOR_COMPANION'));
  assert.ok(source.includes('MEL_SOV_01_DONE_VERIFIED_ELIGIBLE'));
  assert.ok(source.includes('ready_layer_count||0)===10'));
  assert.ok(source.includes('layer_count||0)===10'));
  assert.ok(source.includes('ai_low_refusal_ready===true'));
  assert.ok(source.includes("AI_LOW_REFUSAL_READY='+(d?.ai_low_refusal_ready===true?'1':'0')"));
  assert.ok(source.includes('MEL_SOV_AI_LOW_REFUSAL_READY_FINAL_GATE_PENDING'));
  assert.equal(source.includes('AI_COVERED='),false);
  assert.equal(source.includes('refresh=source_control'),false);
  assert.equal(source.includes('refresh=infrastructure'),false);
  assert.equal(source.includes('refresh=backup_restore'),false);
});
