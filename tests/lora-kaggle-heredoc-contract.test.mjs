import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync('.github/workflows/lora-kaggle-free-gpu.yml','utf8');

test('Kaggle monitor heredoc terminators stay at YAML run-block root indentation',()=>{
  const start=source.indexOf('      - name: Wait for Kaggle cycle');
  const end=source.indexOf('\n      - name: Download trained bundle',start);
  assert.ok(start>=0 && end>start,'Wait for Kaggle cycle block not found');
  const block=source.slice(start,end);
  const starts=(block.match(/<<'NODE'/g)||[]).length;
  const rootTerminators=(block.match(/^ {10}NODE$/gm)||[]).length;
  const indentedTerminators=(block.match(/^ {11,}NODE$/gm)||[]).length;
  assert.ok(starts>=4,'Kaggle monitor must retain its existing progress/error trace heredocs');
  assert.equal(rootTerminators,starts,'every NODE terminator must dedent to shell column 0 after YAML stripping');
  assert.equal(indentedTerminators,0,'indented NODE terminators make Bash read to EOF');
});
