import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// 30/10: the Kaggle CLI exited 0 on "Kernel push error: Maximum weekly GPU
// quota of 30.00 hours reached"; the chain then validated the previous
// kernel's output and failed on KAGGLE_SOURCE_SHA_MISMATCH, hiding the cause.
const workflow = await readFile(new URL('../.github/workflows/lora-kaggle-free-gpu.yml', import.meta.url), 'utf8');
const step = workflow.slice(workflow.indexOf('- name: Submit free offline Kaggle T4 training'), workflow.indexOf('- name: Trace Kaggle training submission'));
const script = step.slice(step.indexOf('run: |') + 'run: |'.length).split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');

function submit(cliOutput) {
  const fake = `kaggle(){ printf '%s\\n' "$FAKE_OUT"; return 0; }\nexport -f kaggle\n`;
  return spawnSync('bash', ['-c', fake + script], { encoding: 'utf8', env: { ...process.env, FAKE_OUT: cliOutput, KERNEL_REF: 'o/k', CYCLE: '28', KAGGLE_KERNEL_TIMEOUT_SECONDS: '60' } });
}

test('a refused Kaggle push stops the cycle with the quota named, before any monitoring', () => {
  const quota = submit('Kernel push error: Maximum weekly GPU quota of 30.00 hours reached.');
  assert.notEqual(quota.status, 0);
  assert.match(quota.stdout, /KAGGLE_GPU_WEEKLY_QUOTA_EXHAUSTED/);
  const other = submit('Kernel push error: Notebook not found');
  assert.notEqual(other.status, 0);
  assert.match(other.stdout, /KAGGLE_KERNEL_PUSH_REJECTED/);
  const ok = submit('Kernel version 42 successfully pushed.  Please check progress at https://www.kaggle.com/code/o/k');
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /Submitted o\/k cycle 28/);
});
