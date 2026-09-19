import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/full-interface-v2.js';

test('full mode exposes phone-only autonomy controls without replacing desktop layout', async () => {
  const response = await onRequestGet();
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /id="autonomyBadge"/);
  assert.match(html, /id="autonomyMode"/);
  assert.match(html, /id="autonomyNext"/);
  assert.match(html, /class="mobile-home-controls"/);
  assert.match(html, /id="mobileMaxAutonomy"/);
  assert.match(html, /id="mobileStartCycle"/);
  assert.match(html, /id="mobilePauseAutonomy"/);
  assert.match(html, /id="mobileResumeAutonomy"/);
  assert.match(html, /id="mobileActivityAutonomy"/);
  assert.match(html, /\/api\/gen2\/autonomy\/max/);
  assert.match(html, /\/api\/gen2\/autonomy\/tick/);
  assert.match(html, /\/api\/gen2\/autonomy\/pause/);
  assert.match(html, /\/api\/gen2\/autonomy\/resume/);
  assert.match(html, /\.mobile-home-controls\{display:none\}/);
  assert.match(html, /@media\(max-width:960px\)[\s\S]*\.mobile-home-controls\{display:grid/);
  assert.match(html, /production verrouillée/i);
});
