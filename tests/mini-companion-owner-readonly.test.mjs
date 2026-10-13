import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('src/devices/computer-companion-api.js','utf8');
const companion=readFileSync('dist/MEL-Computer-Companion.ps1','utf8');
const asset=readFileSync('assets/MEL-Computer-Companion.ps1','utf8');
const relay=readFileSync('scripts/cloudflare-api-relay-runner.mjs','utf8');
test('both packaged Companion sources implement exactly owner-gated MINI read-only actions',()=>{
 assert.equal(asset,companion);
 for(const action of ['mini.readonly.discover','mini.readonly.security','mini.readonly.backup']){
  assert.ok(companion.includes('"'+action+'" { return PcControl-MiniReadOnly'));
  assert.ok(api.includes('"'+action+'"'));
 }
 assert.match(api,/action\.startsWith\("mini\.readonly\."\)&&a\.kind!=="owner"/);
 assert.match(api,/MINI_BOOTLOADER_RESET_ACK_REQUIRED/);
 assert.match(api,/MINI_BACKUP_ACK_REQUIRED/);
});
test('GitHub OIDC schedules do not gain reset or backup privileges',()=>{
 const allowed=api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1].split(';')[0];
 assert.ok(!allowed.includes('mini.readonly'));
 assert.ok(!relay.includes("action:'mini.readonly."));
 assert.match(companion,/if \(\$config\.remote_access_enabled -ne \$true\)/);
 assert.match(companion,/ack_bootloader_reset -ne \$true/);
 assert.match(companion,/ack_local_backup -ne \$true/);
});
test('MINI readback uses immutable COM3 evidence and pinned Espressif executable',()=>{
 assert.match(companion,/069db0f1e4d8f929f36d0f60243499eb670626c03a686376728998aaaad2f664/);
 assert.match(companion,/1834b10629687fcd519a35bbb87765d2a2c31ca90d002ce6fe3d037c0122a258/);
 assert.match(companion,/8ba3b110139f45443d4f268d1a3373ef99a1718b71d51664531b83ee2d4b91a3/);
 assert.match(companion,/USB\\\\VID_303A&PID_1001/);
 assert.match(companion,/ota_0-backup-0x20000-6291456/);
 assert.match(companion,/backup_image_validated=\$false; rollback_tested=\$false/);
 assert.match(companion,/flash_performed=\$false; flash_allowed=\$false/);
 const region=companion.slice(companion.indexOf('# Owner-only MINI diagnostics'),companion.indexOf('function Perform-PcControl('));
 assert.ok(!region.includes('write_flash'));
 assert.ok(!region.includes('erase_flash'));
});
