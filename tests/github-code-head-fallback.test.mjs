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

  const head = await reader.head();
  assert.equal(head.sha, SHA);
  assert.equal(head.branch, 'candidate/augmentio-core');
  assert.equal(head.repository, 'adrienlopezcarreras-pixel/meliturgos-cloudflare');
  assert.equal(head.source, 'github-commit-list');
  assert.equal(head.remote_verified, true);
  assert.equal(head.pinned, false);
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


test('pinned deployed SHA keeps inspection available when GitHub head endpoints are unavailable', async () => {
  const seen = [];
  const pinned = '3333333333333333333333333333333333333333';
  const reader = createGitHubCodeReader({
    repository: 'adrienlopezcarreras-pixel/meliturgos-cloudflare',
    branch: 'candidate/mel-clean-autonomy',
    pinnedSha: pinned,
    fetchImpl: async (url) => {
      seen.push(String(url));
      return { ok: false, status: 429 };
    },
  });

  const head = await reader.head();
  assert.equal(head.sha, pinned);
  assert.equal(head.source, 'deployed-build-sha');
  assert.equal(head.remote_verified, false);
  assert.equal(head.pinned, true);
  assert.equal(reader.content_ref, pinned);
  assert.equal(seen.length, 3);
});

test('pinned deployed SHA fails closed when reachable canonical branch moved', async () => {
  const pinned = '4444444444444444444444444444444444444444';
  const moved = '5555555555555555555555555555555555555555';
  const reader = createGitHubCodeReader({
    repository: 'owner/repo',
    branch: 'candidate/mel-clean-autonomy',
    pinnedSha: pinned,
    fetchImpl: async () => Response.json({ object: { sha: moved } }),
  });

  await assert.rejects(
    () => reader.head(),
    error => error?.code === 'CODE_HEAD_PIN_MISMATCH'
      && error?.expected_sha === pinned
      && error?.observed_sha === moved,
  );
});

test('pinned SHA is used as immutable source ref for raw fallback reads', async () => {
  const pinned = '6666666666666666666666666666666666666666';
  const seen = [];
  const reader = createGitHubCodeReader({
    repository: 'owner/repo',
    branch: 'candidate/mel-clean-autonomy',
    pinnedSha: pinned,
    fetchImpl: async (url) => {
      seen.push(String(url));
      if (String(url).includes('/contents/')) return { ok: false, status: 503 };
      if (String(url).startsWith('https://raw.githubusercontent.com/')) {
        return new Response('export const pinned = true;\n', { status: 200 });
      }
      return { ok: false, status: 503 };
    },
  });

  const file = await reader.read('src/index.js');
  assert.match(file.content, /pinned = true/);
  assert.ok(seen.some(url => url.includes(`/${pinned}/src/index.js`)));
});
