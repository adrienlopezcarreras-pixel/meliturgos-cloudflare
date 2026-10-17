import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Windows companion retries the immutable execution outcome rather than reporting delivery as execution failure',()=>{
 const ps=readFileSync(new URL('../dist/MEL-Computer-Companion.ps1',import.meta.url),'utf8');
 const fn=ps.split('function Submit-CommandResult($body) {')[1]?.split('\nfunction Process-Command')[0];
 assert.ok(fn,'result delivery must have one function');
 assert.match(fn,/for \(\$attempt=1; \$attempt -le 3; \$attempt\+\+\)/);
 assert.match(fn,/Invoke-MelJson -Path "\/api\/computer\/v1\/result"/);
 assert.match(fn,/MEL_RESULT_DELIVERY_UNCONFIRMED/);
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
