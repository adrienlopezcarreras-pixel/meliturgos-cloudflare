import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('browser typing only restores clipboard if it still owns the last update', async () => {
  const asset = await readFile(new URL('../assets/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  const dist = await readFile(new URL('../dist/MEL-Computer-Companion.ps1', import.meta.url), 'utf8');
  assert.equal(asset, dist, 'packaged Companion must match source exactly');
  assert.ok(asset.includes('public static extern uint GetClipboardSequenceNumber();'));
  const start = asset.indexOf('function Type-BrowserText(');
  const end = asset.indexOf('function Perform-Step(', start);
  assert.ok(start > 0 && end > start);
  const fn = asset.slice(start, end);
  const clipboardWrite = fn.indexOf('[System.Windows.Forms.Clipboard]::SetText($text)');
  const capturedSequence = fn.indexOf('$writtenSequence = [MelNative]::GetClipboardSequenceNumber()');
  const paste = fn.indexOf('SendWait("^v")');
  const finallyBlock = fn.slice(fn.indexOf('} finally {'));
  const restore = finallyBlock.indexOf('SetDataObject($priorClipboard, $true)');
  const guard = finallyBlock.indexOf('[MelNative]::GetClipboardSequenceNumber() -eq $writtenSequence');
  const identity = finallyBlock.indexOf('[System.Windows.Forms.Clipboard]::GetText() -ceq $text');
  assert.ok(clipboardWrite >= 0 && capturedSequence > clipboardWrite);
  assert.ok(paste > capturedSequence);
  assert.ok(guard >= 0 && identity > guard && restore > identity);
  assert.ok(finallyBlock.includes('[System.Windows.Forms.Clipboard]::ContainsText()'));
  assert.ok(finallyBlock.includes('if ($writtenSequence -ne 0'));
  assert.ok(finallyBlock.includes('[System.Windows.Forms.Clipboard]::Clear()'));
  assert.ok(fn.includes('Assert-BrowserShortcutTarget $window $browser'));
  assert.ok(fn.includes('BROWSER_TYPE_CLIPBOARD_RESTORE_FAILED'));
});
