import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('legacy MINI updater fails closed before accessing physical flash', async () => {
  const src=await readFile(new URL('../tools/mini-updater/mini_updater.py', import.meta.url),'utf8');
  assert.match(src,/MINI_FLASH_BLOCKED_UNVERIFIED_PARTITION_LAYOUT/);
  assert.match(src,/return 22/);
  assert.doesNotMatch(src,/write_flash|erase_flash|esptool\.main/);
  assert.doesNotMatch(src,/0x20000|0x620000/);
});
