import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as renderSimple } from '../src/pages/mvp-interface-v2.js';
import { onRequestGet as renderFull } from '../src/pages/full-interface-v5.js';

test('MEL status control is exposed in full mode only', async () => {
  const simple = await (await renderSimple({})).text();
  assert.doesNotMatch(simple, /melBriefStatus/);
  assert.doesNotMatch(simple, /mel-status-button-runtime/);

  const full = await (await renderFull({})).text();
  assert.match(full, /id=\\?"melStatusBtnV5\\?"|melStatusBtnV5/);
  assert.match(full, /Statut MEL/);
  assert.match(full, /STATUS_PROMPT/);
  assert.match(full, /api\/professor\/dev\/jobs/);
});
