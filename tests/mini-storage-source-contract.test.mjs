import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI uses internal flash storage for assets without requiring microSD', async () => {
  const runtime = await readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8');
  const cmake = await readFile(new URL('../firmware/waveshare-terminal/main/CMakeLists.txt', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/devices/waveshare-terminal-api.js', import.meta.url), 'utf8');

  assert.match(runtime, /esp_vfs_fat_spiflash_mount_rw_wl\("\/melstore", "storage"/);
  assert.match(runtime, /\/melstore\/mel\//);
  assert.doesNotMatch(runtime, /\/sdcard\/mel\//);
  assert.match(runtime, /INTERNAL STORAGE PASS/);
  assert.match(cmake, /\bfatfs\b/);
  assert.match(cmake, /\bwear_levelling\b/);
  assert.match(api, /"storage\.internal"/);
});
