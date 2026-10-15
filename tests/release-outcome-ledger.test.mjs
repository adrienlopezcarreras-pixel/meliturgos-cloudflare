import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseOutcomeComment } from '../scripts/release-outcome-ledger.mjs';

const REPO = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const base = () => ({
 action:'completed',
 workflow_run:{
  name:'deploy-cloudflare-release',
  id:38712345678,
  head_sha:'a'.repeat(40),
  head_branch:'release/mel-hardware-v0.1.0',
  event:'push',
  conclusion:'success',
  repository:{full_name:REPO},
  head_repository:{full_name:REPO}
 }
});

test('release success is recorded as workflow result only, without invented D1/HTTP proof',()=>{
 const body=releaseOutcomeComment(base());
 assert.match(body,/WORKFLOW_SUCCESS/);
 assert.match(body,/38712345678/);
 assert.match(body,/a{40}/);
 assert.match(body,/pas une vérification indépendante/);
 assert.match(body,/ne pas déduire leur succès/);
 assert.doesNotMatch(body,/D1 : SUCCESS|déploiement certifié/);
});
test('failed, cancelled and timed-out releases are still visible, never mislabelled successful',()=>{
 for(const conclusion of ['failure','cancelled','timed_out']){
  const x=base();x.workflow_run.conclusion=conclusion;
  const body=releaseOutcomeComment(x);
  assert.match(body,/WORKFLOW_NOT_SUCCESS/);
  assert.match(body,new RegExp(conclusion));
  assert.doesNotMatch(body,/WORKFLOW_SUCCESS/);
 }
});
test('untrusted repositories, branches, events and spoofed SHAs fail closed',()=>{
 const cases=[
  x=>{x.workflow_run.head_branch='main';},
  x=>{x.workflow_run.event='pull_request';},
  x=>{x.workflow_run.name='test';},
  x=>{x.workflow_run.repository.full_name='other/repo';},
  x=>{x.workflow_run.head_repository.full_name='other/repo';},
  x=>{x.workflow_run.id='38712345678';},
  x=>{x.workflow_run.head_sha='abc';},
  x=>{x.workflow_run.conclusion='invented';},
  x=>{x.action='requested';}
 ];
 for(const mutate of cases){const x=base();mutate(x);assert.throws(()=>releaseOutcomeComment(x));}
 assert.throws(()=>releaseOutcomeComment(base(),'untrusted/repository'),/RELEASE_LEDGER_REPOSITORY_INVALID/);
});
test('workflow is triggered only by canonical release completions and uses no mutable production credential',()=>{
 const source=readFileSync(new URL('../.github/workflows/release-outcome-ledger.yml',import.meta.url),'utf8');
 assert.match(source,/workflow_run:/);
 assert.match(source,/types: \[completed\]/);
 assert.match(source,/head_branch == 'release\/mel-hardware-v0\.1\.0'/);
 assert.match(source,/head_repository\.full_name == github\.repository/);
 assert.match(source,/ref: main/);
 assert.match(source,/issues: write/);
 assert.match(source,/gh api --method POST/);
 assert.doesNotMatch(source,/CLOUDFLARE_API_TOKEN|wrangler deploy|force: true|secret put/);
});
