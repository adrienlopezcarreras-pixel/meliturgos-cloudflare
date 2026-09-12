import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet as renderNormal } from '../src/pages/mvp-interface.js';
import { onRequestGet as renderFull } from '../src/pages/full-interface-v5.js';

function inlineScripts(html) {
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
}
function ids(html) {
  return [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
}

for (const [name, render] of [['normal', renderNormal], ['full', renderFull]]) {
  test(`${name} interface inline JavaScript compiles exactly as served`, async () => {
    const html = await (await render({})).text();
    const scripts = inlineScripts(html);
    assert.ok(scripts.length >= 1, `${name}: no inline script found`);
    scripts.forEach((source, index) => {
      assert.doesNotThrow(() => new Function(source), `${name}: inline script ${index} must compile`);
    });
  });

  test(`${name} interface emits no duplicate DOM ids`, async () => {
    const html = await (await render({})).text();
    const list = ids(html);
    assert.equal(new Set(list).size, list.length, `${name}: duplicate DOM id detected`);
  });
}

test('full interface static buttons are bound to a behavior', async () => {
  const html = await (await renderFull({})).text();
  for (const id of ['roomSend','workRefresh','workCreate','roadRefresh','systemRefresh']) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, new RegExp(`getElementById\\('${id}'\\)\\.addEventListener`));
  }
  assert.match(html, /button\[data-view\][\s\S]*addEventListener/);
});

test('normal interface primary controls are bound to a behavior', async () => {
  const html = await (await renderNormal({})).text();
  for (const id of ['send','full','avatar','drop','auditRefresh','themeButton']) assert.match(html, new RegExp(`id="${id}"`));
  for (const binding of ['send.addEventListener','full.addEventListener','avatar.addEventListener','drop.addEventListener','auditRefresh.addEventListener','themeButton.addEventListener']) assert.match(html, new RegExp(binding.replace('.', '\\.')));
});
