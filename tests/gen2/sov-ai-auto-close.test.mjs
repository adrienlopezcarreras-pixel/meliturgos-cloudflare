import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('AI SOV auto-close watches only the missing AI layer and preserves the 10/10 gate', async()=>{
  const source=await readFile(new URL('../../.github/workflows/mel-sov-ai-auto-close.yml',import.meta.url),'utf8');
  assert.match(source,/cron: '11 \\* \\* \\* \\*'/);
  assert.match(source,/refresh=ai_local/);
  assert.match(source,/MEL_SOV_AI_WAITING_FOR_COMPANION/);
  assert.match(source,/MEL_SOV_01_DONE_VERIFIED_ELIGIBLE/);
  assert.match(source,/ready_layer_count\\|\\|0\\)===10/);
  assert.match(source,/layer_count\\|\\|0\\)===10/);
  assert.match(source,/ai_low_refusal_ready===true/);
  assert.doesNotMatch(source,/refresh=source_control/);
  assert.doesNotMatch(source,/refresh=infrastructure/);
  assert.doesNotMatch(source,/refresh=backup_restore/);
});
