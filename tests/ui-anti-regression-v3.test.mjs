import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../src/pages/mvp-interface-v3.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';

test('canonical normal UI exposes one responsive MEL surface with no legacy root runtime', async () => {
  const response = await onRequestGet({});
  assert.equal(response.status, 200);
  const html = await response.text();

  assert.match(html, /data-visual-owner="mel-normal-v3"/);
  assert.equal((html.match(/id="mel-normal-v3-style"/g) || []).length, 1);
  assert.equal((html.match(/src="\/normal-runtime\.js\?v=8"/g) || []).length, 1);

  for (const id of ['melAvatar','melAvatarImage','promptInput','previousMessage','drop','fileInput','send','full']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }

  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /@media\(max-width:700px\)/);
  assert.match(NORMAL_RUNTIME_SOURCE, /location\.href='\/professor'/);
  assert.match(NORMAL_RUNTIME_SOURCE, /e\.key==='Enter'&&!e\.shiftKey&&!e\.isComposing/);
  assert.doesNotMatch(html, /interaction_count/i);
  assert.doesNotMatch(html, /ROOT_PAGE_V5_CLASSIC|ROOT_PAGE_PATCHED_V3|MEL_AVATAR_B64/);
});

test('canonical normal UI owns exactly the requested eight visual themes', async () => {
  const html = await (await onRequestGet({})).text();
  const buttons = [...html.matchAll(/data-mel-theme-choice="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(buttons, ['classic','granada','guadix','crusade','aviation','amazon','paladin','futuristic']);
});
