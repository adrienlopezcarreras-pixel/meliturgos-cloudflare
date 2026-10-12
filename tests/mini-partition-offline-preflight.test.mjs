import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI preflight reads only an existing partition dump; cannot flash', async()=>{
  const src=await readFile(new URL('../tools/mini-updater/inspect_partitions.py',import.meta.url),'utf8');
  assert.match(src,/PARTITION_OVERLAP/);
  assert.match(src,/PARTITION_TABLE_MAGIC_INVALID/);
  assert.match(src,/flash_allowed.*False/);
  assert.doesNotMatch(src,/serial\.Serial|esptool|write_flash|erase_flash|subprocess|os\.system/);
});
