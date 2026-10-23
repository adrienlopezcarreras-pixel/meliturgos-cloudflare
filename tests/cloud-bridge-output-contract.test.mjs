// [GPT6] Regression for the actual Cloud Bridge workflow command runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const workflow = fs.readFileSync('.github/workflows/gen2-42-apply-ready-bridge.yml','utf8');
const blockStart=workflow.indexOf('          function commandEvidence(args){', workflow.indexOf('      - name: Run exact bounded requested tests'));
const blockEnd=workflow.indexOf('          const results=[];',blockStart);
assert.ok(blockStart>=0 && blockEnd>blockStart,'workflows must define Bridge commandEvidence');
const source=workflow.slice(blockStart,blockEnd).split('\n').map(line=>line.startsWith('          ')?line.slice(10):line).join('\n');
const ctx={fsSync:fs,os,path,spawnSync,Buffer,process:{stdout:{write(){}}}};
vm.createContext(ctx);
vm.runInContext(source+'\nthis.executeBridgeCommand=commandEvidence;',ctx);
const run=ctx.executeBridgeCommand;

test('[GPT6] large output does not turn a passing command into failure',()=>{
 const r=run([process.execPath,'-e',"process.stdout.write('x'.repeat(1300000)+'\\nEND_OF_TEST\\n')"]);
 assert.equal(r.status,0);
 assert.equal(r.executed,true);
 assert.equal(r.error_code,null);
 assert.match(r.stdout,/END_OF_TEST/);
 assert.ok(r.stdout.length<=4000);
});

test('[GPT6] large failing output stays failed with meaningful tail',()=>{
 const r=run([process.execPath,'-e',"process.stdout.write('x'.repeat(1300000)+'\\nFAIL_MARKER\\n');process.exit(9)"]);
 assert.equal(r.status,9);
 assert.equal(r.executed,true);
 assert.match(r.stdout,/FAIL_MARKER/);
});

test('[GPT6] launch failure is not misreported as an executed passing test',()=>{
 const r=run(['command-that-does-not-exist-mel-gpt6-20261023']);
 assert.notEqual(r.status,0);
 assert.equal(r.executed,false);
 assert.equal(r.error_code,'ENOENT');
});

test('[GPT6] report explicitly marks requested test commands as executed',()=>{
 assert.match(workflow,/passed:r\.status===0,executed:r\.executed,exit_code:/);
});

test('[GPT6] long full-suite timeout is larger than individual suite timeout',()=>{
 assert.match(workflow,/timeout:args\[1\]==='test'\?600000:180000/);
});

test('[GPT6] already-satisfied reconciliation requires full regression and accurate execution evidence',()=>{
 const start=workflow.indexOf('      - name: Reconcile package already satisfied on main');
 const end=workflow.indexOf('      - name: Report already-satisfied reconciliation',start);
 const stage=workflow.slice(start,end);
 assert.match(stage,/if\(!requested\.some\(spec=>spec\.command==='test'\)\) requested\.unshift/);
 assert.match(stage,/executed:!r\.error/);
});
