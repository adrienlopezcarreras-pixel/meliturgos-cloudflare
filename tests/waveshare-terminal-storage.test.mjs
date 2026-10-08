import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MINI uses internal flash FAT storage for assets and rendered media', async () => {
  const [runtime, cmake, header, partitions, api, workflow] = await Promise.all([
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.cpp', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/CMakeLists.txt', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/main/mel_terminal.h', import.meta.url), 'utf8'),
    readFile(new URL('../firmware/waveshare-terminal/partitions.csv', import.meta.url), 'utf8'),
    readFile(new URL('../src/devices/waveshare-terminal-api.js', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/waveshare-terminal-firmware.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(partitions, /^storage,\s+data,\s+fat,/m);
  assert.match(runtime, /esp_vfs_fat_spiflash_mount_rw_wl\(\s*"\/melstore",\s*"storage"/);
  assert.match(runtime, /INTERNAL STORAGE PASS/);
  assert.match(runtime, /\/melstore\/mel\/web-card\.mimg/);
  assert.match(runtime, /std::string\("\/melstore\/mel\/"\)/);
  assert.doesNotMatch(runtime, /\/sdcard\/mel/);
  assert.match(runtime, /"internal_storage"/);
  assert.match(runtime, /"storage_total_bytes"/);
  assert.match(runtime, /"storage_free_bytes"/);
  assert.match(cmake, /\bfatfs\b/);
  assert.match(cmake, /\bwear_levelling\b/);
  assert.match(header, /MEL_FW_VERSION "0\.6\.10-es8311-volume-gate"/);
  assert.match(api, /"storage\.internal"/);
  assert.match(api, /internal_storage: body\.internal_storage/);
  assert.match(workflow, /"version": "0\.6\.10-es8311-volume-gate"/);
  assert.match(runtime, /esp_vfs_fat_spiflash_unmount_rw_wl\("\/melstore", g_storage_wl\)/);
  assert.match(runtime, /static void storage_reset_after_failure\(\)/);
  assert.match(runtime, /static void storage_refresh_info\(\)/);
  assert.match(runtime, /if \(g_storage_ok\) storage_refresh_info\(\);[\s\S]*"storage_free_bytes"/);
});
