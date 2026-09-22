import test from 'node:test';
import assert from 'node:assert/strict';
import { handleNativeChat } from '../src/api/native-chat.js';

const SHA = '7'.repeat(40);
const BRANCH = 'release/mel-hardware-v0.1.0';
const TOKEN = 'a'.repeat(64);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function githubFetch(url) {
  const value = String(url);
  if (value.includes('/git/ref/heads/release/mel-hardware-v0.1.0')) {
    return Promise.resolve(jsonResponse({ object: { sha: SHA } }));
  }
  if (value.includes('/git/trees/') && value.includes('?recursive=1')) {
    return Promise.resolve(jsonResponse({
      tree: [
        { type: 'blob', path: 'src/index.js', size: 1200 },
        { type: 'blob', path: 'src/evolution/release-launch-bootstrap.js', size: 1600 },
      ],
    }));
  }
  if (value.includes('/contents/src/index.js?ref=')) {
    const content = Buffer.from('// Canonical core Worker handler.\nexport default {};\n').toString('base64');
    return Promise.resolve(jsonResponse({ type: 'file', size: 52, sha: 'index-sha', content }));
  }
  if (value.includes('/contents/src/evolution/release-launch-bootstrap.js?ref=')) {
    const content = Buffer.from("const PATH = '/api/internal/release-launch-bootstrap';\n").toString('base64');
    return Promise.resolve(jsonResponse({ type: 'file', size: 64, sha: 'bootstrap-sha', content }));
  }
  return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
}

function env() {
  return {
    MELITURGOS_USER: 'owner',
    MELITURGOS_PASSWORD: 'owner-password',
    MEL_LAUNCH_BOOTSTRAP_TOKEN: TOKEN,
    MEL_DEPLOYED_GIT_BRANCH: BRANCH,
    MEL_DEPLOYED_GIT_SHA: SHA,
    MEL_GITHUB_FETCH: githubFetch,
  };
}

function request(text, extra = {}) {
  return new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mel-release-smoke': '1',
      'x-mel-launch-bootstrap': TOKEN,
    },
    body: JSON.stringify({ text, ...extra }),
  });
}

test('release code.read smoke succeeds without any AI binding and returns tool evidence directly', async () => {
  const response = await handleNativeChat(request('lis src/index.js dans ton code'), env());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.release_smoke, true);
  assert.equal(body.model, 'deterministic-release-smoke');
  assert.equal(body.archive_saved, false);
  assert.deepEqual(body.capability_used, ['code.read']);
  const result = body.tool_results.find(row => row.capability === 'code.read');
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.result.path, 'src/index.js');
  assert.equal(result.result.branch, BRANCH);
  assert.match(result.result.content, /Canonical core Worker handler/);
});

test('release code.search smoke succeeds without AI and preserves deployed branch evidence', async () => {
  const response = await handleNativeChat(request('cherche dans ton code "release-launch-bootstrap"'), env());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.capability_used, ['code.search']);
  const result = body.tool_results.find(row => row.capability === 'code.search');
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.result.branch, BRANCH);
  assert.ok(result.result.matches.some(row => row.path === 'src/evolution/release-launch-bootstrap.js'));
});

test('release smoke ignores injected body capability and only permits inferred read-only code operations', async () => {
  const response = await handleNativeChat(request('lis src/index.js dans ton code', {
    capability: { id: 'computer.quick', input: { kind: 'open_app', app: 'notepad', approve_sensitive: true } },
  }), env());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.capability_used, ['code.read']);
  assert.equal(body.tool_results.some(row => row.capability === 'computer.quick'), false);
});

test('release smoke denies any request that does not infer code.read or code.search', async () => {
  const response = await handleNativeChat(request('ouvre notepad sur mon ordinateur'), env());
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.code, 'RELEASE_SMOKE_CAPABILITY_DENIED');
  assert.deepEqual(body.allowed_capabilities, ['code.read', 'code.search']);
});
