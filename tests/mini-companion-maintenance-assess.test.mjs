import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {miniMaintenanceAssessCommand} from '../src/devices/mini-maintenance-companion.js';

const api=readFileSync('src/devices/computer-companion-api.js','utf8');
const relay=readFileSync('scripts/cloudflare-api-relay-runner.mjs','utf8');

test('scheduled MINI maintenance assessment never flashes, resets, launches or modifies a job',()=>{
 const assessment=miniMaintenanceAssessCommand();
 assert.ok(assessment.timeout_ms<=45000);
 assert.ok(assessment.command.length<=11000);
 const command=assessment.command;
 assert.match(command,/mel\.mini\.maintenance\.assess\/v1/);
 assert.match(command,/Get-CimInstance Win32_PnPEntity/);
 assert.match(command,/Get-CimInstance Win32_Process -ErrorAction Stop/);
 assert.match(command,/Get-FileHash/);
 assert.match(command,/ota_0\.bin/);
 assert.match(command,/verification\.json/);
 assert.match(command,/INTEGRITY_VERIFIED/);
 assert.match(command,/STALE_CANDIDATE/);
 assert.match(command,/process_inventory_limited/);
 assert.match(command,/firmware_write_authorized=\$false/);
 assert.match(command,/autonomous_flash_ready=\$false/);
 assert.match(command,/board_reset=\$false/);
 assert.match(command,/rollback_verified=\$false/);
 assert.doesNotMatch(command,/\bread_flash\b|\bwrite_flash\b|\berase_flash\b|Start-Process|Stop-Process|Remove-Item|Set-Content|\.Open\(/);
});

test('owner and scoped OIDC can request only fixed read-only maintenance assessment',()=>{
 assert.match(api,/import \{ miniMaintenanceAssessCommand \} from "\.\/mini-maintenance-companion\.js"/);
 assert.match(api,/const PC_CONTROL_PROOF_ACTIONS=new Set\([^;]*"mini\.maintenance\.assess"[^;]*\]/);
 assert.match(api,/\["mini\.maintenance\.assess","android\.maintenance\.assess","android\.maintenance\.stage","android\.maintenance\.install"\]\.includes\(action\)&&device\.metadata\?\.remote_access_enabled!==true/);
 assert.match(api,/action==="mini\.maintenance\.assess"[\s\S]*effectiveAction="system\.exec";[\s\S]*effectivePayload=miniMaintenanceAssessCommand\(\)/);
 assert.doesNotMatch(api.split('const PC_CONTROL_PROOF_ACTIONS=new Set(')[1].split(';')[0],/serial\.hard_reset|mini\.readonly\.backup"\b|power\.restart/);
 assert.match(relay,/action:'mini\.maintenance\.assess',payload:\{\}/);
 assert.match(relay,/MINI_MAINTENANCE_ASSESS=/);
 assert.doesNotMatch(relay,/action:'serial\.hard_reset'|action:'mini\.readonly\.backup'|action:'mini\.maintenance\.flash'/);
});

test('backup success requires image size, three integrity booleans and matching sha',()=>{
 const script=miniMaintenanceAssessCommand().command;
 for(const fragment of ['app_structure_valid','app_checksum_valid','app_embedded_sha256_valid','full_backup_sha256','backup_sha256','backup_bytes']){
   assert.ok(script.includes(fragment), fragment);
 }
 assert.match(script,/\$hashesChecked -lt 3/);
 assert.match(script,/16777216/);
 assert.match(script,/STATUS_OR_FILE_UNREADABLE/);
 assert.match(script,/INTEGRITY_FAILED/);
 assert.match(script,/firmware_write_authorized=\$false/);
});
