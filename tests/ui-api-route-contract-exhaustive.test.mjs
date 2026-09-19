import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CLIENT_FILES = [
  '../src/pages/mvp-runtime.js',
  '../src/pages/full-interface-v2.js',
  '../src/pages/full-mode-control-enhancer.js',
  '../src/pages/watch-interface.js',
  '../src/professor-live-learning-entry.js',
  '../src/learning-entry.js',
];

const SERVER_FILES = [
  '../src/index.js',
  '../src/router.js',
  '../src/ui-entry.js',
  '../src/professor-live-learning-entry.js',
  '../src/evolution/autonomy-api.js',
  '../src/api/voice-transcribe.js',
  '../src/api/file-upload.js',
  '../src/pages/shardvault-status.js',
  '../src/devices/computer-companion-api.js',
];

test('every fixed API endpoint referenced by canonical UI exists in deployed server routing', async () => {
  const clients = await Promise.all(CLIENT_FILES.map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  const servers = (await Promise.all(SERVER_FILES.map(path => readFile(new URL(path, import.meta.url), 'utf8')))).join('\n');

  const endpoints = new Set();
  for (const source of clients) {
    for (const match of source.matchAll(/['"`]((?:\/api\/)[A-Za-z0-9_./:-]+)['"`]/g)) {
      endpoints.add(match[1]);
    }
  }

  assert.ok(endpoints.size >= 15, 'UI API inventory unexpectedly small');
  const missing = [...endpoints].filter(endpoint => !servers.includes(endpoint));
  assert.deepEqual(missing, [], 'UI references API routes that are not present in deployed server sources');
});
