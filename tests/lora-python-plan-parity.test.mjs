import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('Python remote-runner LoRA plan matches canonical JavaScript manifest digest', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mel-lora-plan-parity-'));
  const dataset = path.join(dir, 'dataset.jsonl');
  const jsPlan = path.join(dir, 'js-plan.json');
  const pyPlan = path.join(dir, 'py-plan.json');

  const rows = Array.from({ length: 50 }, (_, i) => JSON.stringify({
    messages: [
      { role: 'user', content: 'question ' + i },
      { role: 'assistant', content: 'answer ' + i },
    ],
  }));
  await writeFile(dataset, rows.join('\n') + '\n');

  const common = ['--dataset', dataset, '--id', 'mel-parity-test', '--epochs', '1', '--rank', '8', '--alpha', '16', '--dropout', '0.05', '--learning-rate', '0.0002', '--seed', '42'];

  const js = spawnSync('node', ['scripts/create-lora-plan.mjs', ...common, '--output', jsPlan], {
    cwd: process.cwd(), encoding: 'utf8',
  });
  assert.equal(js.status, 0, js.stderr || js.stdout);

  const py = spawnSync('python3', ['scripts/create-lora-plan.py', ...common, '--output', pyPlan], {
    cwd: process.cwd(), encoding: 'utf8',
  });
  assert.equal(py.status, 0, py.stderr || py.stdout);

  const a = JSON.parse(await readFile(jsPlan, 'utf8'));
  const b = JSON.parse(await readFile(pyPlan, 'utf8'));
  assert.equal(b.dataset_digest, a.dataset_digest);
  assert.equal(b.training_manifest_digest, a.training_manifest_digest);
  assert.deepEqual(b.training_manifest, a.training_manifest);
  assert.deepEqual(b.readiness, a.readiness);
  assert.equal(b.status, a.status);
});
