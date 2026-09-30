import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflows = [
  'activate-platform-capabilities.yml',
  'persistent-capability-stress-live-proof.yml',
  'live-connections-production-proof.yml',
  'mel-sov-01-live-proof.yml',
];

test('post-release production proofs are reusable and no longer race on workflow_run', async () => {
  for (const name of workflows) {
    const source = await readFile(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
    assert.match(source, /workflow_call:/, name);
    assert.doesNotMatch(source, /workflows:\s*\["deploy-cloudflare-release"\]/, name);
    assert.match(source, /inputs\.expected_sha \|\| github\.sha/, name);
  }
});

test('post-release suite sequences platform, stress, connections and sovereignty even after a red proof', async () => {
  const source = await readFile(new URL('../../.github/workflows/post-release-proof-suite.yml', import.meta.url), 'utf8');
  assert.match(source, /platform:\n[\s\S]*uses: \.\/\.github\/workflows\/activate-platform-capabilities\.yml/);
  assert.match(source, /persistent-stress:\n[\s\S]*needs: \[resolve, platform\][\s\S]*if: always\(\)/);
  assert.match(source, /connections:\n[\s\S]*needs: \[resolve, persistent-stress\][\s\S]*if: always\(\)/);
  assert.match(source, /sovereignty:\n[\s\S]*needs: \[resolve, connections\][\s\S]*if: always\(\)/);
  assert.match(source, /summary:\n[\s\S]*needs: \[resolve, platform, persistent-stress, connections, sovereignty\]/);
});
