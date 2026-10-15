import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileReleaseOutcomes} from '../scripts/release-outcome-reconcile.mjs';
const REPO='adrienlopezcarreras-pixel/meliturgos-cloudflare';
const run=(id,overrides={})=>({
 id,head_sha:'b'.repeat(40),name:'deploy-cloudflare-release',
 head_branch:'release/mel-hardware-v0.1.0',event:'push',
 status:'completed',conclusion:'success',
 repository:{full_name:REPO},head_repository:{full_name:REPO},
 ...overrides
});
function mock({runs=[],comments=[],fail='',fullPage=false}={}){
 const posts=[],gets=[];
 const fetchImpl=async(url,opts={})=>{
  const u=new URL(url),method=opts.method||'GET';
  const p=u.pathname+u.search;
  if(fail && p.includes(fail))return {ok:false,status:503};
  if(method==='POST'){
   const body=JSON.parse(opts.body).body;
   posts.push(body);
   return {ok:true,status:201,json:async()=>({id:posts.length,body})};
  }
  gets.push(p);
  if(p.includes('/actions/workflows/'))return {ok:true,status:200,json:async()=>({workflow_runs:runs})};
  if(p.includes('/comments?'))return {ok:true,status:200,json:async()=>fullPage?Array(100).fill({body:'noise'}):comments};
  throw new Error('UNEXPECTED_ROUTE_'+p);
 };
 return {posts,gets,fetchImpl};
}
const args={token:'TEST-GITHUB-TOKEN',repository:REPO};
test('backfill scans completed release runs, posts success and failures without inventing live verification',async()=>{
 const f=mock({runs:[run(40),run(39,{conclusion:'failure'}),run(38,{status:'in_progress'}),run(37,{head_branch:'untrusted'})]});
 const done=await reconcileReleaseOutcomes({...args,fetchImpl:f.fetchImpl});
 assert.deepEqual(done,{checked:2,created:2,skipped:0});
 assert.equal(f.posts.length,2);
 assert.match(f.posts[0],/WORKFLOW_NOT_SUCCESS/);
 assert.match(f.posts[1],/WORKFLOW_SUCCESS/);
 assert.match(f.posts[1],/actions\/runs\/40/);
 assert.match(f.posts[0],/D1, HTTP et rollback/);
});
test('prior event-driven outcome comments are not duplicated',async()=>{
 const url='https://github.com/'+REPO+'/actions/runs/42';
 const f=mock({runs:[run(42)],comments:[{body:'Recorded '+url}]});
 const done=await reconcileReleaseOutcomes({...args,fetchImpl:f.fetchImpl});
 assert.deepEqual(done,{checked:1,created:0,skipped:1});
 assert.equal(f.posts.length,0);
});
test('main dispatch is eligible; foreign repositories and spoofed push branches are not',async()=>{
 const f=mock({runs:[
  run(43,{event:'workflow_dispatch',head_branch:'main'}),
  run(44,{event:'push',head_branch:'main'}),
  run(45,{repository:{full_name:'foreign/repo'}}),
  run(46,{head_repository:{full_name:'foreign/repo'}}),
  run(47,{head_sha:'bogus'})
 ]});
 await assert.rejects(reconcileReleaseOutcomes({...args,fetchImpl:f.fetchImpl}),/RELEASE_LEDGER_IDENTITY_INVALID/);
 assert.equal(f.posts.length,0); // Preflight validation prevents partial publishing.
});
test('no partial writes on malformed candidate receipt',async()=>{
 const f=mock({runs:[run(47,{head_sha:'bogus'}),run(43,{event:'workflow_dispatch',head_branch:'main'})]});
 // Validate upfront: malformed source must abort before any comment is created.
 await assert.rejects(reconcileReleaseOutcomes({...args,fetchImpl:f.fetchImpl}),/RELEASE_LEDGER_IDENTITY_INVALID/);
 assert.equal(f.posts.length,0);
});
test('GitHub failures and unbounded comment history fail closed',async()=>{
 for(const fail of ['/actions/workflows/','/comments?']){
  const f=mock({runs:[run(53)],fail});
  await assert.rejects(reconcileReleaseOutcomes({...args,fetchImpl:f.fetchImpl}),/RELEASE_RECONCILE_GITHUB_API_FAILED/);
  assert.equal(f.posts.length,0);
 }
 const unbounded=mock({runs:[run(53)],fullPage:true});
 await assert.rejects(reconcileReleaseOutcomes({...args,fetchImpl:unbounded.fetchImpl}),/RELEASE_RECONCILE_COMMENTS_UNBOUNDED/);
 assert.equal(unbounded.posts.length,0);
});
test('scope and schedule cannot deploy or gain Cloudflare credentials',()=>{
 const text=readFileSync(new URL('../.github/workflows/release-outcome-ledger.yml',import.meta.url),'utf8');
 assert.match(text,/cron: '23 \* \* \* \*'/);
 assert.match(text,/actions: read/);
 assert.match(text,/issues: write/);
 assert.match(text,/scripts\/release-outcome-reconcile\.mjs/);
 assert.doesNotMatch(text,/CLOUDFLARE_API_TOKEN|wrangler deploy|force: true|secret put/);
});
