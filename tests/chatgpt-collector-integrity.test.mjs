import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('collector passive captures can never mark a partial conversation complete', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const content = await readFile(new URL('../browser-companion/chatgpt-collector/content.js', import.meta.url), 'utf8');

  assert.match(content, /PASSIVE_TAIL_MESSAGES = 24/);
  assert.match(content, /capture\(\{tailLimit:PASSIVE_TAIL_MESSAGES\}\)/);
  assert.match(content, /partial:tailLimit > 0/);

  assert.match(background, /const partialCapture=msg\.conversation\.collector\?\.partial===true/);
  assert.match(background, /if\(partialCapture\)\{\s*partial\[sourceId\]=record;\s*\}else\{\s*done\[sourceId\]=record;/s);
  assert.doesNotMatch(
    background,
    /const done=\{\.\.\.\(s\.done\|\|\{\}\),\[sourceId\]:\{[^}]*messages:count/s,
    'partial auto-capture must not unconditionally write completion state',
  );
  assert.match(background, /const partial=\{\.\.\.\(s\.partial\|\|\{\}\)\};delete partial\[sourceId\]/);
});

test('collector batch path verifies conversation identity and remains resumable', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');

  assert.match(background, /if\(String\(cap\.conversation\.id\|\|''\)!==sourceId\) throw codedError\('CAPTURE_ID_MISMATCH'\)/);
  assert.match(background, /let processPromise=null/);
  assert.match(background, /let processGeneration=0/);
  assert.match(background, /if\(processPromise\)/);
  assert.match(background, /processPromise=process\(tab\.id,generation\)/);
  assert.match(background, /generation!==processGeneration/);
  assert.match(background, /activeAbortController\?\.abort\(\)/);
  assert.match(background, /WATCHDOG_IDLE_MS=8\*60\*1000/);
  assert.match(background, /NETWORK_TIMEOUT_MS=6\*60\*1000/);
  assert.match(background, /DOM_STABLE_MAX_MS=3\*60\*1000/);
});

test('collector can retry every unresolved recoverable item and counts them in discovery truth', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const popup = await readFile(new URL('../browser-companion/chatgpt-collector/popup.html', import.meta.url), 'utf8');

  assert.match(background, /const unresolved=\{\.\.\.failed,\.\.\.deferred\}/);
  assert.match(background, /delete deferred\[key\]/);
  assert.match(background, /delete failed\[key\]/);
  assert.match(background, /Object\.values\(deferred\)\.map\(x=>x\.url\)/);
  assert.match(background, /Object\.values\(failed\)\.map\(x=>x\.url\)/);
  assert.match(popup, /Réessayer échecs \/ différées/);
});

test('collector partial state forces full recapture when newer than the last completed snapshot', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const popup = await readFile(new URL('../browser-companion/chatgpt-collector/popup.js', import.meta.url), 'utf8');

  assert.match(background, /partial:\{\}/);
  assert.match(background, /const completedMessages=Number\(done\[id\]\?\.messages\|\|0\)/);
  assert.match(background, /const partialMessages=Number\(partial\[id\]\?\.messages\|\|0\)/);
  assert.match(background, /const needsFullCapture=!done\[id\]\|\|partialMessages>completedMessages/);
  assert.match(background, /s\.done\?\.\[sourceId\]&&partialMessages<=completedMessages/);
  assert.match(background, /if\(s\.done\?\.\[sourceId\]&&Number\(s\.done\[sourceId\]\.messages\|\|0\)>=count\)return\{ok:true,skipped:'ALREADY_CAPTURED'\}/);
  assert.match(popup, /Captures partielles/);
});

test('collector performs bounded deep sidebar discovery and includes partials in coverage truth', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const content = await readFile(new URL('../browser-companion/chatgpt-collector/content.js', import.meta.url), 'utf8');

  assert.match(background, /deepDiscoveryDone:false/);
  assert.match(background, /mergeDiscovery\(tabId,deep\)/);
  assert.match(background, /deep\?120000:60000/);
  assert.match(background, /Object\.values\(partial\)\.map\(x=>x\.url\)/);
  assert.match(background, /deepDiscoveryDone:deep&&page\.ok\?true:s\.deepDiscoveryDone/);
  assert.match(content, /DEEP_DISCOVERY_MAX_ROUNDS = 60/);
  assert.match(content, /for \(let i = 0; i < DEEP_DISCOVERY_MAX_ROUNDS; i\+\+\)/);
});
