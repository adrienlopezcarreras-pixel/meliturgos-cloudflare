import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Windows browser pointer actions reject non-client frame and off-screen coordinates', async () => {
  const src = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(src, dist);
  assert.match(src, /GetClientRect\(IntPtr hwnd, out RECT rect\)/);
  assert.match(src, /ClientToScreen\(IntPtr hwnd, ref POINT point\)/);
  const begin = src.indexOf('function Assert-BrowserClickTarget(');
  const end = src.indexOf('function Type-BrowserText(', begin);
  assert.ok(begin > 0 && end > begin);
  const guard = src.slice(begin, end);
  for (const item of [
    'Assert-LocalRemoteAccess',
    'GetForegroundWindow() -ne $window',
    'Assert-ForegroundBrowser',
    'GetWindowRect($window, [ref]$rect)',
    'GetClientRect($window, [ref]$client)',
    'ClientToScreen($window, [ref]$origin)',
    'SystemInformation]::VirtualScreen',
    'BROWSER_CLICK_CLIENT_BOUNDS_REQUIRED',
    'BROWSER_CLICK_OUTSIDE_WINDOW',
  ]) assert.ok(guard.includes(item), item);
  assert.match(guard, /\[Math\]::Max\(\[Math\]::Max\(\$rect.Left, \$virtual.Left\), \[long\]\$origin.X\)/);
  assert.match(guard, /\[Math\]::Min\(\[Math\]::Min\(\$rect.Right, \$virtual.Right\), \(\[long\]\$origin.X \+ \[long\]\$client.Right\)\)/);
  assert.match(guard, /\$x -lt \$left -or \$x -ge \$right/);
  assert.match(guard, /\$y -lt \$top -or \$y -ge \$bottom/);
  const click = src.slice(src.indexOf('"browser.click" {'), src.indexOf('"browser.scroll" {'));
  const scroll = src.slice(src.indexOf('"browser.scroll" {'), src.indexOf('"browser.type" {'));
  for (const [action, handler, event] of [
    ['click', click, '$MOUSE_LEFTDOWN'],
    ['scroll', scroll, '$MOUSE_WHEEL'],
  ]) {
    assert.ok(handler.includes('Assert-BrowserClickTarget $window $browser $x $y'), action);
    assert.ok(handler.lastIndexOf('Assert-BrowserClickTarget $window $browser $x $y') < handler.indexOf(event), action);
  }
});
