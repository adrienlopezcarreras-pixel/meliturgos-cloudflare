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
 assert.ok(api.includes('!["mini.readonly.discover","mini.readonly.backup.audit"].includes(action)'));
 assert.match(api,/MINI_BOOTLOADER_RESET_ACK_REQUIRED/);
 assert.match(api,/mini.readonly.backup.status/);
});
test('OIDC permits discovery and fixed audit, not security or flash backup',()=>{
 const allowed=api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1].split(';')[0];
 assert.ok(allowed.includes('mini.readonly.discover'));
 assert.ok(!allowed.includes('mini.readonly.security'));
 assert.ok(!allowed.includes('"mini.readonly.backup"'));
 assert.ok(!allowed.includes('"mini.readonly.backup.status"'));
 assert.ok(allowed.includes('"mini.readonly.backup.audit"'));
 assert.match(api,/action==="mini.readonly.discover"&&device\.metadata\?\.remote_access_enabled!==true/);
 assert.ok(relay.includes("action:'mini.readonly.discover'"));
 assert.ok(!relay.includes("action:'mini.readonly.security'"));
 assert.ok(!relay.includes("action:'mini.readonly.backup'"));
});
test('fixed read-only commands reject path injection and never approve flashing',()=>{
 for(const mode of ['mini.readonly.discover','mini.readonly.security']){
  const {command,timeout_ms}=miniReadOnlyPcCommand(mode,'COM3');
  assert.ok(command.length<8192);
  assert.ok(timeout_ms<=120000);
  assert.match(command,/069db0f1e4d8f929f36d0f60243499eb670626c03a686376728998aaaad2f664/);
  assert.ok(command.includes('VID_303A&PID_1001'));
  assert.ok(!command.includes('write_flash'));
  assert.ok(!command.includes('erase_flash'));
 }
 const discovery=miniReadOnlyPcCommand('mini.readonly.discover','COM3').command;
 assert.match(discovery,/board_reset=\$false/);
 const security=miniReadOnlyPcCommand('mini.readonly.security','COM3').command;
 assert.match(security,/get_security_info/);
 assert.match(security,/board_reset_possible=\$true/);
 assert.match(miniReadOnlyPcCommand('mini.readonly.backup','COM3').command,/ota_backup_worker.py/);
 assert.throws(()=>miniReadOnlyPcCommand('mini.readonly.discover',"COM3';evil"),/MINI_READONLY_PORT_INVALID/);
});

test('fixed stale-job audit is read-only and does not use COM3',()=>{
 const audit=miniReadOnlyPcCommand('mini.readonly.backup.audit','COM3');
 assert.ok(audit.timeout_ms<=20000);
 assert.match(audit.command,/STALE_CANDIDATE/);
 assert.match(audit.command,/Get-CimInstance Win32_Process/);
 assert.match(audit.command,/status.json/);
 assert.doesNotMatch(audit.command,/read_flash|write_flash|erase_flash|Stop-Process|SerialPort/);
 assert.match(relay,/MINI_BACKUP_STALE_AUDIT=/);
});
