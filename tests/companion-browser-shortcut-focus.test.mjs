import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url);
const packaged = new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url);

test('Windows Companion checks local access and stable foreground window before browser keystrokes', async () => {
  const source = await readFile(src, 'utf8');
  const dist = await readFile(packaged, 'utf8');
  assert.equal(source, dist, 'distributed Companion must match audited source exactly');

  const helper = source.slice(
    source.indexOf('function Assert-BrowserShortcutTarget('),
    source.indexOf('function Perform-Step('),
  );
  assert.ok(helper.startsWith('function Assert-BrowserShortcutTarget('));
  assert.match(helper, /Assert-LocalRemoteAccess/);
  assert.match(helper, /GetForegroundWindow\(\) -ne \$window/);
  assert.match(helper, /Assert-ForegroundBrowser/);
  assert.match(helper, /BROWSER_SHORTCUT_FOCUS_CHANGED/);

  const shortcuts = [
    ['browser.close-tab', 'browser.new-tab', '"^w"'],
    ['browser.new-tab', 'browser.back', '"^t"'],
    ['browser.back', 'browser.forward', '"%{LEFT}"'],
    ['browser.forward', 'browser.reload', '"%{RIGHT}"'],
    ['browser.reload', 'browser.capture', '"{F5}"'],
  ];
  for (const [action, nextAction, sequence] of shortcuts) {
    const start = source.indexOf(`"${action}" {`);
    const end = source.indexOf(`"${nextAction}" {`, start);
    assert.ok(start >= 0 && end > start, action);
    const handler = source.slice(start, end);
    const windowIndex = handler.indexOf('[MelNative]::GetForegroundWindow()');
    const browserIndex = handler.indexOf('Assert-ForegroundBrowser');
    const guardIndex = handler.indexOf('Assert-BrowserShortcutTarget $window $browser');
    const sendIndex = handler.indexOf('SendWait(' + sequence + ')');
    assert.ok(windowIndex >= 0 && windowIndex < browserIndex, action + ': capture HWND before validation');
    assert.ok(browserIndex < guardIndex && guardIndex < sendIndex, action + ': guard immediately before key injection');
  }
});
