import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI web preview cannot open Android private file/content resources',async()=>{
  const src=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const start=src.indexOf('private fun renderWebPage(');
  const end=src.indexOf('private fun createMediaStoreEntry(',start);
  assert.ok(start>=0 && end>start);
  const render=src.slice(start,end);
  const load=render.indexOf('web.loadUrl(url)');
  assert.ok(load>0);
  const config=render.slice(0,load);
  for (const setting of ['allowFileAccess','allowContentAccess','allowFileAccessFromFileURLs','allowUniversalAccessFromFileURLs']) {
    assert.match(config,new RegExp('web\\.settings\\.'+setting+' = false'));
  }
  assert.match(config,/web\.settings\.mixedContentMode = android\.webkit\.WebSettings\.MIXED_CONTENT_NEVER_ALLOW/);
  const browser=src.slice(src.indexOf('private fun receiveBrowser('),start);
  assert.match(browser,/url\.startsWith\("https:\/\/"\)/);
  assert.match(browser,/url\.startsWith\("http:\/\/"\)/);
});
