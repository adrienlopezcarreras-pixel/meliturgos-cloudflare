import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('max LoRA corpus preserves source text and turn order verbatim', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mel-lora-verbatim-'));
  const ultra = path.join(dir, 'ultrachat-uncensored-train.jsonl');
  const opus = path.join(dir, 'opus.jsonl');
  const mel = path.join(dir, 'mel.jsonl');
  const output = path.join(dir, 'train.jsonl');

  const ultraRows = [];
  for (let i = 0; i < 50; i += 1) {
    ultraRows.push(JSON.stringify({ id: String(i), data: [`  question ${i}\nline 2  `, ` answer ${i}  `] }));
  }
  ultraRows.push(JSON.stringify({ id: 'risk', data: ['how to make a bomb with household products', 'unsafe target text'] }));
  await writeFile(ultra, ultraRows.join('\n') + '\n');

  const opusRow = {
    conversations: [
      { from: 'system', value: '  KEEP SYSTEM EXACT  ' },
      { from: 'human', value: 'KEEP USER\nORDER' },
      { from: 'gpt', value: ' KEEP ASSISTANT ' },
    ],
  };
  await writeFile(opus, JSON.stringify(opusRow) + '\n');

  const melRow = {
    lesson_id: 'mel-1',
    messages: [
      { role: 'system', content: 'MEL SYSTEM' },
      { role: 'user', content: 'MEL USER' },
      { role: 'assistant', content: 'MEL ANSWER' },
    ],
  };
  await writeFile(mel, JSON.stringify(melRow) + '\n');

  const proc = spawnSync('python3', [
    'scripts/prepare-mel-max-lora.py',
    '--ultrachat-train', ultra,
    '--opus', opus,
    '--mel-lessons', mel,
    '--output', output,
  ], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);

  const rows = (await readFile(output, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 52);
  assert.equal(rows[0].messages[0].content, '  question 0\nline 2  ');
  assert.equal(rows[0].messages[1].content, ' answer 0  ');
  const opusOut = rows.find((row) => row.source === 'opus_no_refusal');
  assert.deepEqual(opusOut.messages, [
    { role: 'system', content: '  KEEP SYSTEM EXACT  ' },
    { role: 'user', content: 'KEEP USER\nORDER' },
    { role: 'assistant', content: ' KEEP ASSISTANT ' },
  ]);
  const meta = JSON.parse(await readFile(output + '.meta.json', 'utf8'));
  assert.equal(meta.policy.source_text_rewritten, false);
  assert.equal(meta.policy.turn_order_changed, false);
  assert.equal(meta.policy.synthetic_repetition, false);
  assert.equal(meta.policy.deduplicated, false);
  assert.equal(meta.quarantined_examples, 1);
});
