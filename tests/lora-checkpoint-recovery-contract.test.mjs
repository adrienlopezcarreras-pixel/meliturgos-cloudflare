import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('verified LoRA weights are preserved as an Actions artifact before GitHub Releases', () => {
  const yaml = readFileSync('.github/workflows/lora-kaggle-free-gpu.yml', 'utf8');
  const backup = yaml.indexOf('- name: Preserve verified checkpoint as private workflow artifact');
  const release = yaml.indexOf('- name: Save immutable checkpoint release');
  const trainingEvidence = yaml.indexOf('- name: Trace verified training result and artifacts');
  assert.ok(trainingEvidence >= 0 && trainingEvidence < backup && backup < release);
  const section = yaml.slice(backup, release);
  assert.match(section, /actions\/upload-artifact@/);
  assert.match(section, /artifacts\/mel-lora-bundle\.tar\.gz/);
  assert.match(section, /artifacts\/kaggle-run\.json/);
  assert.match(section, /if-no-files-found: error/);
  assert.match(section, /retention-days: 30/);
  assert.doesNotMatch(section, /activate true|gh release create/);
});
