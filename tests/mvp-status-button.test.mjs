import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as renderSimple } from '../src/pages/mvp-interface-v2.js';
import { onRequestGet as renderFull } from '../src/pages/full-interface-v5.js';

test('runtime status detail stays in full mode while simple mode remains uncluttered', async () => {
  const simple = await (await renderSimple({})).text();
  assert.doesNotMatch(simple, /proofCode|mentorBadge|refreshAll/);

  const full = await (await renderFull({})).text();
  assert.match(full, /id="refreshAll"/);
  assert.match(full, /État vérifié/);
  assert.match(full, /api\/gen2\/code\/self-check/);
  assert.match(full, /api\/gen2\/mentor\/status/);
  assert.doesNotMatch(full, /melStatusBtnV5|Statut MEL/);
});
