import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGitHubCodeReader } from '../src/capabilities/github-code-capabilities.js';

test('autonomy implementation planner forwards the existing MEL GitHub token to its code reader', async () => {
  const source = await readFile(new URL('../src/evolution/autonomy-implementation-planner.js', import.meta.url), 'utf8');
  assert.match(source, /token:\s*String\(env\?\.MEL_GITHUB_TOKEN\s*\|\|\s*''\)/);
});

test('GitHub code head requests use the configured token without exposing it in output', async () => {
  const seen = [];
  const sha = '1111111111111111111111111111111111111111';
  const reader = createGitHubCodeReader({
    repository: 'owner/repo',
    branch: 'candidate/augmentio-core',
    token: 'test-token-value',
    fetchImpl: async (url, options = {}) => {
      seen.push({ url: String(url), authorization: options.headers?.authorization || '' });
      return Response.json({ object: { sha } });
    },
  });
  const head = await reader.head();
  assert.equal(head.sha, sha);
  assert.equal(seen[0].authorization, 'Bearer test-token-value');
  assert.equal(JSON.stringify(head).includes('test-token-value'), false);
});
