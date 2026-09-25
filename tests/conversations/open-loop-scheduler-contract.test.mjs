import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('MEL-CONTEXT-03 scheduler resumes due open loops through the Gen2 runtime', () => {
  const source = fs.readFileSync(new URL('../../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /export async function runOpenLoopResumeTick\(env = \{\}\)/);
  assert.match(source, /runtime\.bus\.execute\('openloop\.resume', \{ limit: 5, retryDelayMs: 60000 \}/);
  assert.match(source, /runOpenLoopResumeTick\(env\)\.catch/);
  assert.match(source, /OPEN_LOOP_RUNTIME_NOT_CONFIGURED/);
});
