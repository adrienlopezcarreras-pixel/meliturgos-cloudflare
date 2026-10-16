import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('MINI browser denies private URLs before WebView and through navigation and subresources', async () => {
  const receiver=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniMediaReceiver.kt',import.meta.url),'utf8');
  const browser=receiver.slice(receiver.indexOf('private fun receiveBrowser('),receiver.indexOf('private fun renderWebPage('));
  assert.match(browser,/!MiniBrowserUrlPolicy\.allows\(url\)/);
  const render=receiver.slice(receiver.indexOf('private fun renderWebPage('),receiver.indexOf('private fun createMediaStoreEntry('));
  assert.match(render,/override fun shouldOverrideUrlLoading\(/);
  assert.match(render,/!MiniBrowserUrlPolicy\.allows\(request\.url\.toString\(\)\)/);
  assert.match(render,/override fun shouldInterceptRequest\(/);
  assert.match(render,/!MiniBrowserUrlPolicy\.allows\(resourceUrl\)/);
  const policy=await readFile(new URL('../android-companion/app/src/main/java/fr/veriteinterdite/mel/MiniBrowserUrlPolicy.kt',import.meta.url),'utf8');
  assert.match(policy,/uri\.rawUserInfo != null/);
  assert.match(policy,/privateSuffixes\.any/);
  assert.match(policy,/numericHost\.matches\(host\)/);
});
