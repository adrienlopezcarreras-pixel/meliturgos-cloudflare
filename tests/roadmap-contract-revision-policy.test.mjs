import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { contractSnapshot, unversionedContractChanges, checkPullRequestContractRevisions } from '../scripts/check-roadmap-contract-revisions.mjs';
const source=(scope='a.js',revision='v1')=>`export const ROADMAP_CODE_CONTRACT_REVISION='legacy'; export const ROADMAP_CODE_CONTRACTS=Object.freeze({'MEL-TEST-01':{revision:'${revision}',code_paths:['${scope}'],test_paths:['a.test.mjs']},'MEL-TEST-02':{code_paths:['other.js']}});`;
test('any changed contract scope requires its own new revision, formatting does not',()=>{
 const before=contractSnapshot(source());
 assert.deepEqual(unversionedContractChanges(before,contractSnapshot(source('new.js'))),['MEL-TEST-01']);
 assert.deepEqual(unversionedContractChanges(before,contractSnapshot(source('new.js','v2'))),[]);
 assert.deepEqual(unversionedContractChanges(before,contractSnapshot(source().replaceAll(',',',\n'))),[]);
 const changed=contractSnapshot(source());changed.contracts['MEL-TEST-02'].test_paths=['new.test.mjs'];
 assert.deepEqual(unversionedContractChanges(before,changed),['MEL-TEST-02']);
});
test('contract snapshots reject executable expressions without evaluating them',()=>{
 assert.throws(()=>contractSnapshot(source().replace("['a.js']","[process.exit(99)]")),/UNSUPPORTED_EXPRESSION/);
});
test('the CI check compares a real PR baseline and preserves unrelated contract revisions',async t=>{
 const cwd=await mkdtemp(join(tmpdir(),'contract-revision-'));t.after(()=>rm(cwd,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 await mkdir(join(cwd,'src/roadmap'),{recursive:true});const file=join(cwd,'src/roadmap/roadmap-code-contracts.js');
 await writeFile(file,source());git('add','.');git('commit','-qm','baseline');
 const eventPath=join(cwd,'event.json');await writeFile(eventPath,JSON.stringify({pull_request:{base:{sha:git('rev-parse','HEAD')}}}));
 const env={GITHUB_EVENT_NAME:'pull_request',GITHUB_EVENT_PATH:eventPath};
 await writeFile(file,source('new.js'));await assert.rejects(checkPullRequestContractRevisions({env,cwd}),/ROADMAP_CONTRACT_REVISION_REQUIRED:MEL-TEST-01/);
 await writeFile(file,source('new.js','v2'));assert.deepEqual(await checkPullRequestContractRevisions({env,cwd}),{ok:true});
 assert.deepEqual(await checkPullRequestContractRevisions({env:{},cwd}),{skipped:true});
});
