import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

test('local bootloader preflight requires explicit reset acknowledgement',()=>{
  const r=spawnSync('python3',['tools/mini-updater/local_readonly_preflight.py','--port','COM3','--output','unused'],{encoding:'utf8'});
  assert.notEqual(r.status,0);
  assert.match(r.stderr,/ack-bootloader required/);
});
test('local preflight never contains flash write commands',async()=>{
  const s=await readFile(new URL('../tools/mini-updater/local_readonly_preflight.py',import.meta.url),'utf8');
  assert.match(s,/read_flash/);
  assert.match(s,/flash_allowed.*False/);
  assert.doesNotMatch(s,/write_flash|erase_flash|erase_region/);
});
