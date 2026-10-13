import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {miniReadOnlyPcCommand} from '../src/devices/mini-readonly-companion.js';
const api=readFileSync('src/devices/computer-companion-api.js','utf8');
test('backup launch is owner-only, detached and never flashes',()=>{
 const launch=miniReadOnlyPcCommand('mini.readonly.backup','COM3');
 assert.match(launch.command,/Start-Process/);
 assert.match(launch.command,/ota_backup_worker.py/);
 assert.match(launch.command,/MINI_BACKUP_WORKER_NOT_INSTALLED/);
 assert.match(launch.command,/--ack-bootloader-reset/);
 assert.doesNotMatch(launch.command,/write_flash|erase_flash/);
 assert.match(api,/mini.readonly.backup.status/);
 assert.match(api,/MINI_BACKUP_ACK_REQUIRED/);
});
test('status query is constrained to a generated hex job id',()=>{
 const id='a'.repeat(32);
 const status=miniReadOnlyPcCommand('mini.readonly.backup.status','COM3',id);
 assert.match(status.command,/status.json/);
 assert.match(status.command,/backup_sha256/);
 assert.doesNotMatch(status.command,/Start-Process/);
 assert.throws(()=>miniReadOnlyPcCommand('mini.readonly.backup.status','COM3','../bad'),/MINI_BACKUP_JOB_ID_INVALID/);
});
