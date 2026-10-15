import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const path of [
  '.github/workflows/lora-kaggle-free-collect.yml',
  '.github/workflows/lora-promote-from-huggingface.yml',
]) {
  test(`LoRA uploader supports scoped Workers AI token without changing preview auth: ${path}`, () => {
    const workflow = readFileSync(path, 'utf8');
    const upload = workflow.split('- name: Upload exact adapter to Cloudflare fine-tunes')[1]?.split('\n      - name:')[0] || '';
    const preview = workflow.split(/- name: Derive (?:isolated )?preview credential/i)[1]?.split('\n      - name:')[0] || '';
    assert.match(upload, /secrets\.CLOUDFLARE_FINETUNES_API_TOKEN\s*\|\|\s*secrets\.CLOUDFLARE_API_TOKEN/);
    assert.match(preview, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
    assert.doesNotMatch(preview, /CLOUDFLARE_FINETUNES_API_TOKEN/);
  });
}
