import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the LoRA panel never assigns a link that is not in the page', async () => {
  const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
  for (const [, id] of page.matchAll(/qs\('#(freeLora[A-Za-z]+)'\)\.href\s*=/g)) {
    assert.ok(page.includes(`id="${id}"`), `#${id} is assigned but missing from the page`);
  }
  assert.match(page, /function setLoraLink\(selector,url\)\{const link=document\.querySelector\(selector\);if\(link\)link\.href=url\}/);
});
