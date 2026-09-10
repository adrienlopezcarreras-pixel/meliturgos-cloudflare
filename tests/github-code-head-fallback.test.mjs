import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubCodeReader } from '../src/capabilities/github-code-capabilities.js';

const SHA = 'e2f546892f2767360b02b6d57e1802146e05a603';

test('head falls back to bounded commits list for slash branch names', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (String(url).includes('/git/ref/heads/')) return { ok: false, status: 404 };
    if (String(url).includes('/commits/candidate%2Faugmentio-core')) return { ok: false, status: 404 };
    if (String(url).includes('/commits?sha=candidate%2Faugmentio-core&per_page=1')) {
      return { ok: true, status: 200, json: async () => [{ sha: SHA }] };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const reader = createGitHubCodeReader({
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: 'candidate/augmentio-core',
    fetchImpl
  });

  assert.deepEqual(await reader.head(), {
    sha: SHA,
    branch: 'candidate/augmentio-core',
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare'
  });
  assert.equal(seen.length, 3);
});

test('head still fails closed when all bounded GitHub head lookups fail', async () => {
  const reader = createGitHubCodeReader({
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: 'candidate/augmentio-core',
    fetchImpl: async () => ({ ok: false, status: 503 })
  });

  await assert.rejects(() => reader.head(), error => error?.code === 'CODE_HEAD_READ_FAILED');
});
