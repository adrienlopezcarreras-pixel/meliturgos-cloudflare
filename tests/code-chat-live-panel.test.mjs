import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/full-interface-v2.js', import.meta.url), 'utf8');
const stream = await readFile(new URL('../src/pages/mel-chat-stream.js', import.meta.url), 'utf8');

test('Code has a light floating activity window with drag, resize and collapse; assistant mode hides it', () => {
  assert.match(page, /id="melCodeLivePanel"/);
  assert.match(page, /id="melCodeLiveDrag"/);
  assert.match(page, /id="melCodeLiveCollapse"/);
  assert.match(page, /\.mel-code-live-panel\{position:fixed/);
  assert.match(page, /resize:both/);
  assert.match(page, /setPointerCapture\(event\.pointerId\)/);
  assert.match(page, /is-collapsed/);
  assert.match(page, /panel\.hidden=melChatRole!=='code'/);
  assert.match(page, /id="melCodeLiveEvents"/);
});

test('Code Continue and unchecked-by-default auto-continue live next to chat buttons', () => {
  const section=page.slice(page.indexOf('id="chatForm"'),page.indexOf('</form>',page.indexOf('id="chatForm"')));
  assert.match(section,/id="melCodeContinue"/);
  assert.match(section,/id="melCodeAutoContinue" type="checkbox"/);
  assert.match(section,/id="chatInterrupt"/);
  assert.ok(section.indexOf('melCodeContinue')<section.indexOf('chatInterrupt'));
  assert.match(page,/const MEL_CODE_AUTO_MAX=5|let melCodeAutoRemaining=0/);
  assert.match(page,/melCodeAutoRemaining=5/);
  assert.match(page,/if\(d\?\.ok===false\|\|d\?\.stream_error\|\|d\?\.response_truncated===true\|\|d\?\.approval_required/);
  assert.match(page,/if\(melCodeAutoRemaining<=0\)/);
  assert.match(page,/melCodeRequestContinue\('code-auto'\)/);
  assert.match(page,/source==='code-auto'/);
});

test('chat interrupt aborts the response and queued chat turns, never pauses MAX', () => {
  const start=page.indexOf("qs('#chatInterrupt').addEventListener(");
  const end=page.indexOf("qs('#chatForm').addEventListener(",start);
  assert.ok(start>0 && end>start);
  const handler=page.slice(start,end);
  assert.match(handler,/chatActiveController\.abort\(\)/);
  assert.match(handler,/chatPendingTurns\.length=0/);
  assert.match(handler,/melCodeCancelAuto\(/);
  assert.doesNotMatch(handler,/\/api\/gen2\/autonomy\/pause/);
  assert.match(handler,/Autonomie MAX inchangée/);
});

test('Code live view receives only server progress and verified tool receipts',()=>{
  assert.match(stream,/onProgress = null/);
  assert.match(stream,/if\(typeof onProgress==='function'\)onProgress/);
  assert.match(stream,/source:'server'/);
  assert.match(page,/melCodeLiveReceipt\(d\)/);
  assert.match(page,/if\(role==='code'\)melCodeLiveReceipt/);
  assert.match(page,/d\?\.tool_results/);
  assert.match(page,/result\?\.node_counts/);
});
