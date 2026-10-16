import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('browser.inspect reports usable client bounds separately from whole-window bounds', async () => {
  const src = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(src, dist);
  const start = src.indexOf('"browser.inspect" {');
  const end = src.indexOf('"app.open" {', start);
  assert.ok(start > 0 && end > start);
  const inspect = src.slice(start, end);
  const pointerStart = src.indexOf('function Assert-BrowserClickTarget(');
  const pointerEnd = src.indexOf('function Type-BrowserText(', pointerStart);
  const guard = src.slice(pointerStart, pointerEnd);
  for (const value of [
    'GetWindowRect($windowHandle, [ref]$rect)',
    'SystemInformation]::VirtualScreen',
    'GetClientRect($windowHandle, [ref]$client)',
    'ClientToScreen($windowHandle, [ref]$origin)',
    'BROWSER_INSPECT_CLIENT_BOUNDS_REQUIRED',
    'BROWSER_INSPECT_FOCUS_CHANGED',
    'visible_bounds=@{ left=$left; top=$top;',
    'interaction_bounds=@{ left=$clientLeft; top=$clientTop;',
    'coordinate_space="virtual-screen-pixels"',
  ]) assert.ok(inspect.includes(value), value);
  assert.ok(inspect.indexOf('GetClientRect(') < inspect.indexOf('BROWSER_INSPECT_FOCUS_CHANGED'));
  for (const operation of ['GetWindowRect', 'GetClientRect', 'ClientToScreen']) {
    assert.ok(guard.includes(operation), 'pointer bounds: ' + operation);
    assert.ok(inspect.includes(operation), 'inspection bounds: ' + operation);
  }
  assert.ok(inspect.includes('[Math]::Max([Math]::Max($rect.Left, $virtual.Left), [long]$origin.X)'));
  assert.ok(inspect.includes('[Math]::Min([Math]::Min($rect.Right, $virtual.Right), ([long]$origin.X + [long]$client.Right))'));
  assert.doesNotMatch(inspect, /Get-Clipboard|Upload-Screenshot|Invoke-WebRequest|Get-Credential/);
});
