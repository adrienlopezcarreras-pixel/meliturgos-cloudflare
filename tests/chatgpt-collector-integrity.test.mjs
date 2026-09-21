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
  assert.match(background, /WATCHDOG_IDLE_MS=30\*1000/);
  assert.match(background, /NETWORK_TIMEOUT_MS=30\*1000/);
  assert.match(background, /PROBE_TIMEOUT_MS=7000/);
  assert.match(background, /DOM_STABLE_MAX_MS=25\*1000/);
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


test('collector self-recovers a stalled large conversation without manual pause/resume', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const popup = await readFile(new URL('../browser-companion/chatgpt-collector/popup.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../browser-companion/chatgpt-collector/manifest.json', import.meta.url), 'utf8'));

  assert.match(background, /async function tabMessage\(tabId,payload,attempts=8,timeoutMs=MESSAGE_TIMEOUT_MS\)/);
  assert.match(background, /waitForDomStable\(tabId,ecoMode=true,generation=null\)/);
  assert.match(background, /Math\.min\(PROBE_TIMEOUT_MS,remaining\)/);
  assert.match(background, /probeFailures>=2/);
  assert.match(background, /captureStable\(tabId,cfg\.ecoMode\?1:2\)/);
  assert.match(background, /waitForExpectedConversation\(tabId,sourceId,8000\)/);
  assert.match(background, /throw codedError\('DOM_NOT_STABLE'\)/);
  assert.match(background, /const autoRecoverable=\[[^\]]*'DOM_NOT_STABLE'[^\]]*\]\.includes\(code\)/s);
  assert.match(background, /if\(attempts<maxAttempts\)\{\s*if\(!nextQueue\.includes\(url\)\)nextQueue\.push\(url\);/s);
  assert.match(background, /await recoverTab\(tabId,code\);\s*continue;/s);
  assert.match(background, /await api\.tabs\.update\(tabId,\{url:'about:blank'\}\)/);
  assert.match(popup, /Relances automatiques/);
  assert.equal(manifest.version, '0.6.3');
});


test('collector runner is asynchronous, single-flight and rate-limit aware', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const content = await readFile(new URL('../browser-companion/chatgpt-collector/content.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../browser-companion/chatgpt-collector/manifest.json', import.meta.url), 'utf8'));

  assert.match(background, /const RUNNER_GLOBAL_GAP_MS=60\*1000/);
  assert.match(background, /const RUNNER_PER_TAB_COOLDOWN_MS=90\*1000/);
  assert.match(background, /let runnerTickPromise=null/);
  assert.match(background, /if\(runnerTickPromise\)return runnerTickPromise/);
  assert.match(background, /nextGlobalSendAt:sentAt\+RUNNER_GLOBAL_GAP_MS/);
  assert.match(background, /nextEligibleAt:sentAt\+RUNNER_PER_TAB_COOLDOWN_MS/);
  assert.match(background, /\['USAGE_LIMIT','RATE_LIMIT'\]\.includes/);
  assert.match(background, /paused:true[\s\S]*blockedReason:/);
  assert.match(content, /SEND_NOT_CONFIRMED/);
  assert.ok(manifest.permissions.includes('alarms'));
});

test('collector runner only controls currently open explicitly armed tabs', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const popup = await readFile(new URL('../browser-companion/chatgpt-collector/popup.html', import.meta.url), 'utf8');
  const popupJs = await readFile(new URL('../browser-companion/chatgpt-collector/popup.js', import.meta.url), 'utf8');

  const resolveStart = background.indexOf('async function resolveRunnerTab');
  const resolveEnd = background.indexOf('function isHardRunnerBlock', resolveStart);
  const resolveBody = background.slice(resolveStart, resolveEnd);
  assert.match(resolveBody, /api\.tabs\.get\(Number\(target\.tabId\)\)/);
  assert.doesNotMatch(resolveBody, /api\.tabs\.query/);
  assert.doesNotMatch(resolveBody, /api\.tabs\.create/);

  assert.match(background, /api\.tabs\.onRemoved\.addListener/);
  assert.match(background, /delete targets\[sourceId\]/);
  assert.match(background, /api\.tabs\.onUpdated\.addListener/);
  assert.match(background, /if\(idFromUrl\(tab\?\.url\)!==sourceId\)delete targets\[sourceId\]/);
  assert.match(background, /COLLECTOR_TAB_RESERVED/);
  assert.match(background, /!\['cycle','go'\]\.includes\(command\)/);

  assert.match(popup, /uniquement sur les conversations ChatGPT actuellement ouvertes/i);
  assert.match(popupJs, /mel\.runner\.mark-current/);
  assert.match(popupJs, /armRunner\('cycle'\)/);
  assert.match(popupJs, /armRunner\('go'\)/);
});


test('collector runner injects itself into already-open ChatGPT tabs and exposes visible arm feedback', async () => {
  const background = await readFile(new URL('../browser-companion/chatgpt-collector/background.js', import.meta.url), 'utf8');
  const popupJs = await readFile(new URL('../browser-companion/chatgpt-collector/popup.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../browser-companion/chatgpt-collector/manifest.json', import.meta.url), 'utf8'));

  assert.ok(manifest.permissions.includes('scripting'));
  assert.match(background, /async function ensureRunnerContent\(tabId\)/);
  assert.match(background, /api\.scripting\.executeScript\(\{target:\{tabId\},files:\['content\.js'\]\}\)/);
  assert.match(background, /const probe=await ensureRunnerContent\(tab\.id\)/);
  assert.match(popupJs, /Armement de cette page en mode/);
  assert.match(popupJs, /ajoutée à la file asynchrone/);
});


test('collector 0.6.3 reports deep discovery coverage to MEL server and keeps unresolved states explicit', async () => {
  const background=await readFile(new URL('../browser-companion/chatgpt-collector/background.js',import.meta.url),'utf8');
  const content=await readFile(new URL('../browser-companion/chatgpt-collector/content.js',import.meta.url),'utf8');
  const manifest=JSON.parse(await readFile(new URL('../browser-companion/chatgpt-collector/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.version,'0.6.3');assert.match(content,/version:'0\.6\.2'/);assert.match(background,/api\/gen2\/import\/chatgpt-coverage/);assert.match(background,/deep_discovery_done:s\.deepDiscoveryDone===true/);assert.match(background,/coverageItemsFromState/);
  for(const state of ['DONE','PARTIAL','FAILED','UNAVAILABLE','DEFERRED','QUEUED'])assert.match(background,new RegExp("'"+state+"'"));
});


test('collector 0.6.3 performs one-time attachment metadata backfill for already completed conversations', async () => {
  const background=await readFile(new URL('../browser-companion/chatgpt-collector/background.js',import.meta.url),'utf8');
  const content=await readFile(new URL('../browser-companion/chatgpt-collector/content.js',import.meta.url),'utf8');
  const popup=await readFile(new URL('../browser-companion/chatgpt-collector/popup.js',import.meta.url),'utf8');
  const manifest=JSON.parse(await readFile(new URL('../browser-companion/chatgpt-collector/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.version,'0.6.3');
  assert.match(background,/ATTACHMENT_BACKFILL_VERSION='chatgpt-attachments-v1'/);
  assert.match(background,/async function ensureAttachmentBackfillQueue/);
  assert.match(background,/forcedAttachmentBackfill=Boolean\(s\.attachmentBackfillPending\?\.\[sourceId\]\)/);
  assert.match(background,/attachmentBackfillVersion:attachmentBackfillComplete\?ATTACHMENT_BACKFILL_VERSION/);
  assert.match(background,/const isAttachmentBackfill=Boolean\(s\.attachmentBackfillPending\?\.\[key\]\)/);
  assert.match(content,/function attachmentDescriptors\(node\)/);
  assert.match(content,/if \(!text && !attachments\.length\) continue/);
  assert.match(content,/attachments,/);
  assert.match(popup,/Backfill pièces jointes/);
});
