import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {revertRejectedCouncilPackages as revert} from '../scripts/revert-rejected-council-packages.mjs';

function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'mel-atomic-revert-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');git('config','user.name','fixture');git('config','user.email','fixture@example.invalid');git('config','commit.gpgsign','false');
 const put=(path,text)=>{mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),text);};
 const commit=subject=>{git('add','.');git('commit','-qm',subject);return git('rev-parse','HEAD');};
 const original=Array.from({length:20},(_,i)=>`export const item${i}=0;`).join('\n')+'\n';
 put('src/a.js',original);put('tests/a.test.mjs','original test\n');put('prepared/next.json','original package base\n');
 put('scripts/revert-rejected-council-packages.mjs',readFileSync(new URL('../scripts/revert-rejected-council-packages.mjs',import.meta.url),'utf8'));
 const base=commit('base');
 put('src/a.js',original.replace('item0=0','item0=1'));
 put('tests/a.test.mjs','test for rejected source\n');put('prepared/next.json','base derived from rejected source\n');
 const published=commit('GEN2-42: apply approved bridge package job-a');
 const review=head=>({decision:'REJECTED',base,head,jobs:['job-a'],rejected_jobs:['job-a'],revert_paths:['src/a.js']});
 return{root,git,put,commit,base,published,original,review,read:path=>readFileSync(join(root,path),'utf8')};
}

function workflowRollback(f,head){
 const workflow=readFileSync(new URL('../.github/workflows/mel-candidate-promotion.yml',import.meta.url),'utf8');
 const start=workflow.indexOf('git checkout -B council-rejected "$CAND"');
 const stop=workflow.indexOf('if git diff --quiet --cached "$CAND"',start);
 assert.ok(start>0&&stop>start);
 return spawnSync('bash',['-c','set -euo pipefail\n'+workflow.slice(start,stop)],{cwd:f.root,encoding:'utf8',
  env:{...process.env,MAIN:f.base,CAND:head,REVIEW:JSON.stringify(f.review(head)),RUNNER_TEMP:f.root},timeout:10000});
}

test('the real rejection workflow rolls back source, its test and derived metadata as one package',t=>{
 const f=fixture(t);f.put('src/independent.js','approved independent work\n');const head=f.commit('independent change');
 const result=workflowRollback(f,head);
 assert.equal(result.status,0,result.stderr);
 assert.equal(f.read('src/a.js'),f.original);
 assert.equal(f.read('tests/a.test.mjs'),'original test\n');
 assert.equal(f.read('prepared/next.json'),'original package base\n');
 assert.equal(f.read('src/independent.js'),'approved independent work\n');
});

test('the privileged workflow executes the main helper, not a rejected candidate replacement',t=>{
 const f=fixture(t);f.put('scripts/revert-rejected-council-packages.mjs',"throw Error('UNTRUSTED_CANDIDATE_HELPER_EXECUTED');\n");
 const head=f.commit('independent unapproved helper change');
 const result=workflowRollback(f,head);
 assert.equal(result.status,0,result.stderr);
 assert.doesNotMatch(result.stderr,/UNTRUSTED_CANDIDATE_HELPER_EXECUTED/);
 assert.equal(f.read('tests/a.test.mjs'),'original test\n');
});

test('a partially reverted package is completed without reintroducing its source',t=>{
 const f=fixture(t);f.git('checkout',f.base,'--','src/a.js');const head=f.commit('old incomplete rollback');
 const result=revert({root:f.root,base:f.base,head,review:f.review(head)});
 assert.equal(result.mode,'ATOMIC_PACKAGE_REVERT');
 assert.equal(f.read('src/a.js'),f.original);
 assert.equal(f.read('tests/a.test.mjs'),'original test\n');
 assert.equal(f.read('prepared/next.json'),'original package base\n');
});

test('later independent edits in the same file survive the inverse package merge',t=>{
 const f=fixture(t);f.put('src/a.js',f.read('src/a.js').replace('item19=0','item19=2'));
 const head=f.commit('independent far-away edit');
 revert({root:f.root,base:f.base,head,review:f.review(head)});
 assert.equal(f.read('src/a.js'),f.original.replace('item19=0','item19=2'));
});

test('an overlapping inverse conflict stops without making a new commit',t=>{
 const f=fixture(t);f.put('src/a.js',f.read('src/a.js').replace('item0=1','item0=2'));
 const head=f.commit('overlapping independent edit');
 assert.throws(()=>revert({root:f.root,base:f.base,head,review:f.review(head)}),{code:'COUNCIL_ATOMIC_ROLLBACK_CONFLICT'});
 assert.equal(f.git('rev-parse','HEAD'),head);
});

test('legacy single-job scope still selects the complete published Git commit',t=>{
 const f=fixture(t);const review=f.review(f.published);delete review.rejected_jobs;
 revert({root:f.root,base:f.base,head:f.published,review});
 assert.equal(f.read('tests/a.test.mjs'),'original test\n');
 assert.equal(f.read('prepared/next.json'),'original package base\n');
});

test('an approval or changed head cannot authorize a rollback',t=>{
 const f=fixture(t);
 assert.throws(()=>revert({root:f.root,base:f.base,head:f.published,review:{...f.review(f.published),decision:'APPROVED'}}),{code:'COUNCIL_ROLLBACK_BINDING_REQUIRED'});
 assert.throws(()=>revert({root:f.root,base:f.base,head:f.base,review:f.review(f.base)}),{code:'COUNCIL_ROLLBACK_HEAD_CHANGED'});
 assert.equal(f.git('status','--porcelain'), '');
});

test('an independently published second mission remains intact',t=>{
 const f=fixture(t);f.put('src/b.js','independent mission\n');
 const head=f.commit('GEN2-42: apply approved bridge package job-b');
 revert({root:f.root,base:f.base,head,review:{...f.review(head),jobs:['job-a','job-b']}});
 assert.equal(f.read('src/b.js'),'independent mission\n');
 assert.equal(f.read('tests/a.test.mjs'),'original test\n');
 assert.equal(f.read('prepared/next.json'),'original package base\n');
});

test('ambiguous legacy scope and a nonexistent publication never mutate the tree',t=>{
 const f=fixture(t);const head=f.published;
 const ambiguous={...f.review(head),jobs:['job-a','job-b']};delete ambiguous.rejected_jobs;
 assert.throws(()=>revert({root:f.root,base:f.base,head,review:ambiguous}),{code:'COUNCIL_ROLLBACK_ATTRIBUTION_REQUIRED'});
 assert.throws(()=>revert({root:f.root,base:f.base,head,review:{...f.review(head),jobs:['unknown'],rejected_jobs:['unknown']}}),{code:'COUNCIL_ROLLBACK_PUBLICATION_NOT_FOUND'});
 assert.throws(()=>revert({root:f.root,base:f.base,head,review:{...f.review(head),jobs:['job-a','unknown'],rejected_jobs:['job-a','unknown']}}),{code:'COUNCIL_ROLLBACK_PUBLICATION_NOT_FOUND'});
 assert.equal(f.git('status','--porcelain'),'');
});

test('unknown whole-diff rejection restores the approved base completely',t=>{
 const f=fixture(t);const head=f.published;
 const result=revert({root:f.root,base:f.base,head,review:{decision:'REJECTED',head,base:f.base,jobs:[],rejected_jobs:[],revert_paths:[]}});
 assert.equal(result.mode,'PATH_RESTORE');
 assert.equal(f.read('src/a.js'),f.original);
 assert.equal(f.read('tests/a.test.mjs'),'original test\n');
 assert.equal(f.read('prepared/next.json'),'original package base\n');
});

test('unsafe paths or preexisting edits are rejected before rollback',t=>{
 const f=fixture(t);const head=f.published;
 assert.throws(()=>revert({root:f.root,base:f.base,head,review:{...f.review(head),revert_paths:['../escape']}}),{code:'COUNCIL_ROLLBACK_PATH_INVALID'});
 f.put('src/a.js','preexisting edit\n');
 assert.throws(()=>revert({root:f.root,base:f.base,head,review:f.review(head)}),{code:'COUNCIL_ROLLBACK_DIRTY_WORKTREE'});
 assert.equal(f.read('src/a.js'),'preexisting edit\n');
});
