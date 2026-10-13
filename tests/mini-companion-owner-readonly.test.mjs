import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {miniReadOnlyPcCommand} from '../src/devices/mini-readonly-companion.js';
const api=readFileSync('src/devices/computer-companion-api.js','utf8');
const companion=readFileSync('dist/MEL-Computer-Companion.ps1','utf8');
const asset=readFileSync('assets/MEL-Computer-Companion.ps1','utf8');
const relay=readFileSync('scripts/cloudflare-api-relay-runner.mjs','utf8');
test('existing Companion is unchanged and supports pinned owner-only security via system.exec',()=>{
 assert.equal(companion,asset);
 assert.ok(companion.includes('"system.exec" { return PcControl-SystemExec $payload }'));
 assert.ok(api.includes('effectiveAction="system.exec"'));
 assert.ok(api.includes('miniReadOnlyPcCommand(action,port)'));
 assert.match(api,/action\.startsWith\("mini\.readonly\."\)&&a\.kind!=="owner"/);
 assert.match(api,/MINI_BOOTLOADER_RESET_ACK_REQUIRED/);
 assert.match(api,/MINI_BACKUP_NEEDS_ASYNC_WORKER/);
});
test('OIDC cannot invoke disruptive MINI commands',()=>{
 const allowed=api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1].split(';')[0];
 assert.ok(!allowed.includes('mini.readonly'));
 assert.ok(!relay.includes("action:'mini.readonly"));
});
test('fixed read-only commands reject path injection and never approve flashing',()=>{
 for(const mode of ['mini.readonly.discover','mini.readonly.security']){
  const {command,timeout_ms}=miniReadOnlyPcCommand(mode,'COM3');
  assert.ok(command.length<8192);
  assert.ok(timeout_ms<=120000);
  assert.match(command,/069db0f1e4d8f929f36d0f60243499eb670626c03a686376728998aaaad2f664/);
  assert.match(command,/USB\\VID_303A/);
  assert.ok(!command.includes('write_flash'));
  assert.ok(!command.includes('erase_flash'));
 }
 const discovery=miniReadOnlyPcCommand('mini.readonly.discover','COM3').command;
 assert.match(discovery,/board_reset=\$false/);
 const security=miniReadOnlyPcCommand('mini.readonly.security','COM3').command;
 assert.match(security,/get_security_info/);
 assert.match(security,/board_reset_possible=\$true/);
 assert.throws(()=>miniReadOnlyPcCommand('mini.readonly.backup','COM3'),/MINI_READONLY_ACTION_NOT_IMPLEMENTED/);
 assert.throws(()=>miniReadOnlyPcCommand('mini.readonly.discover',"COM3';evil"),/MINI_READONLY_PORT_INVALID/);
});
