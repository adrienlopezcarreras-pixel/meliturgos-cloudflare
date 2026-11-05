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

test('[GPT6] exact-main equality is not a completion signal and cannot cancel a roadmap objective',()=>{
 const start=workflow.indexOf('      - name: Reconcile package already satisfied on main');
 const end=workflow.indexOf('      - name: Checkout exact approved candidate',start);
 const stage=workflow.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(stage,/ALREADY_SATISFIED_ON_MAIN_AWAITING_EXACT_SHA_CI/);
 assert.match(stage,/echo "already_satisfied=false"/);
 assert.doesNotMatch(stage,/status:'CANCELLED'|status:"CANCELLED"/);
 assert.doesNotMatch(workflow,/Report already-satisfied reconciliation|report_satisfied/);
 assert.ok(workflow.indexOf('      - name: Run exact bounded requested tests')>end);
 assert.ok(workflow.indexOf('      - name: Commit and push exact candidate change')>end);
 assert.match(workflow,/steps\.report_result\.outcome == 'success'/);
});

test('[GPT6] exact-main reconciliation uses normal syntax, full regression and exact candidate CI rather than bypassing proof',()=>{
 const start=workflow.indexOf('      - name: Run exact bounded requested tests');
 const end=workflow.indexOf('      - name: Recheck owner STOP before publishing',start);
 const stage=workflow.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.match(stage,/commandEvidence\(\['npm','run','check'\]\)/);
 assert.match(stage,/if\(!requested\.some\(spec=>spec\.command==='test'\)\) requested\.unshift/);
 assert.match(stage,/timeout:args\[1\]==='test'\?600000:180000/);
 assert.match(stage,/passed:r\.status===0,executed:r\.executed/);
 const report=workflow.slice(workflow.indexOf('      - name: Report cloud bridge result to production D1'));
 assert.match(report,/status,\s*\n\s*candidate_branch/);
 assert.match(workflow,/FULL_CANDIDATE_CI_DISPATCH http=\$code sha=\$NEW_SHA/);
});
test('[GPT6] candidate without dispatched full CI cannot enter ready-for-review',()=>{
 const start=workflow.indexOf('      - name: Commit and push exact candidate change');
 const end=workflow.indexOf('      - name: Report cloud bridge result to production D1',start);
 const section=workflow.slice(start,end);
 assert.match(section,/if \[ "\$code" != "204" \]; then/);
 assert.match(section,/FULL_CANDIDATE_CI_DISPATCH_FAILED/);
 assert.match(section,/echo "candidate_ready=false"/);
});

test('[GPT6] no-diff candidate also dispatches full candidate CI',()=>{
 const start=workflow.indexOf('      - name: Commit and push exact candidate change');
 const end=workflow.indexOf('      - name: Report cloud bridge result to production D1',start);
 const stage=workflow.slice(start,end);
 assert.match(stage,/NO_CHANGES=true/);
 assert.match(stage,/\[ "\$NO_CHANGES" = "true" \] \|\| git push/);
 assert.ok(stage.indexOf('NO_CHANGES=true')<stage.indexOf('full-candidate-ci.yml/dispatches'));
 assert.doesNotMatch(stage.slice(stage.indexOf('NO_CHANGES=true'),stage.indexOf('full-candidate-ci.yml/dispatches')),/no_changes=true.*exit 0/s);
});

test('[GPT6] bounded Bridge diagnostics preserve unresolved import evidence',()=>{
 assert.match(workflow,/Unresolved import\|SyntaxError\|Error:/);
 assert.match(workflow,/\.slice\(-8\)/);
});
