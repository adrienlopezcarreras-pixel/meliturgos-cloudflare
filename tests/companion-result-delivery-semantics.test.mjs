import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Windows companion journals a single encrypted terminal outcome and replays it before claiming more work',()=>{
 const ps=readFileSync(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 assert.match(ps,/ProtectedData]::Protect/);
 assert.match(ps,/ProtectedData]::Unprotect/);
 assert.match(ps,/function Save-CommandResult\(\$body\)/);
 const save=ps.split('function Save-CommandResult($body) {')[1]?.split('\nfunction Flush-CommandResult')[0];
 assert.ok(save);
 assert.ok(save.indexOf('COMPUTER_RESULT_PENDING_ALREADY') < save.indexOf('[System.IO.File]::WriteAllBytes($temp,$encrypted)'));
 assert.match(save,/finally \{/);
 assert.match(save,/\[System.IO.File\]::Delete\(\$temp\)/);
 assert.match(ps,/function Flush-CommandResult/);
 const flush=ps.split('function Flush-CommandResult {')[1]?.split('\nfunction Submit-CommandResult')[0];
 assert.ok(flush);
 assert.match(flush,/Invoke-MelJson -Path "\/api\/computer\/v1\/result"/);
 assert.match(flush,/\$ack\.ok -ne \$true/);
 assert.match(flush,/File]::Delete\(\$script:ResultJournal\)/);
 assert.match(ps,/if \(-not \(Flush-CommandResult\)\) \{ Start-Sleep -Seconds 2; continue \}/);
 const process=ps.split('function Process-Command($command) {')[1]?.split('\n\$trayResources')[0];
 assert.ok(process);
 assert.equal((process.match(/Submit-CommandResult \$body/g)||[]).length,3);
 assert.doesNotMatch(process,/Invoke-MelJson -Path "\/api\/computer\/v1\/result"/);
});
test('API acknowledges identical previously committed results',()=>{
 const api=readFileSync(new URL('../src/devices/computer-companion-api.js',import.meta.url),'utf8');
 const fn=api.split('async function result(request,env,a){')[1]?.split('\n// A device token')[0];
 assert.ok(fn);
 assert.match(fn,/already_recorded:true/);
 assert.match(fn,/saved\.result_json===JSON\.stringify\(b\.result\?\?null\)/);
 assert.match(fn,/saved\.status===\(b\.ok===true\?COMPUTER_COMMAND_STATUS\.SUCCEEDED:COMPUTER_COMMAND_STATUS\.FAILED\)/);
});

test('delivery errors cannot overwrite a persisted successful result with a failed one',()=>{
 const ps=readFileSync(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 const execution=ps.split('function Process-Command($command) {')[1]?.split('\n$trayResources')[0];
 assert.ok(execution);
 const caught=execution.split('  } catch {').at(-1);
 assert.match(caught,/if \(\[System\.IO\.File\]::Exists\(\$script:ResultJournal\)\) \{ throw \}/);
 assert.ok(caught.indexOf('ResultJournal') < caught.indexOf('ok=$false'));
});
