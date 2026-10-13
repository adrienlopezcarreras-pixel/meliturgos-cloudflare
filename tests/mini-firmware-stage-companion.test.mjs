import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {miniFirmwareStageCommand} from '../src/devices/mini-firmware-stage-companion.js';

const api=readFileSync('src/devices/computer-companion-api.js','utf8');
test('MINI firmware staged by owner through a fixed, SHA verified copy; no serial writes',()=>{
 const r=miniFirmwareStageCommand({filename:'mel-mini-0.6.14.bin',sha256:'f'.repeat(64)});
 assert.ok(r.command.length<=8192);
 assert.equal(r.timeout_ms,120000);
 for(const word of ['Downloads','Get-FileHash','mini-firmware','Copy-Item',
  'Move-Item','MINI_FIRMWARE_CHIP_OR_EMBEDDED_HASH_MISSING',
  'flash_allowed=$false','flash_performed=$false','board_reset=$false']){
  assert.ok(r.command.includes(word),word);
 }
 assert.doesNotMatch(r.command,/erase_flash|write_flash|esptool|serial\.Open|Start-Process|Stop-Process/);
 assert.throws(()=>miniFirmwareStageCommand({filename:'../wrong.bin',sha256:'f'.repeat(64)}),/MINI_FIRMWARE_FILENAME_INVALID/);
 assert.throws(()=>miniFirmwareStageCommand({filename:'mini.bin',sha256:'ff'}),/MINI_FIRMWARE_SHA256_INVALID/);
});
test('MINI stage requires owner, explicit consent, local opt-in and strict exit',()=>{
 const proof=api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1].split(';')[0];
 assert.doesNotMatch(proof,/mini\.maintenance\.stage/);
 assert.match(api,/MINI_FIRMWARE_STAGE_OWNER_CONFIRMATION_REQUIRED/);
 assert.match(api,/ack_local_firmware_stage/);
 assert.match(api,/miniFirmwareStageCommand/);
 assert.match(api,/action==="mini\.maintenance\.stage"&&a\.kind==="owner"/);
 assert.match(api,/require_success_exit:true/);
 assert.match(api,/remote_access_enabled!==true/);
});
