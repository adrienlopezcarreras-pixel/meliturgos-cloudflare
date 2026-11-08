import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { REPAIR_RELEASE_GATES } from '../src/evolution/verified-repair-release.js';

const repository = 'adrienlopezcarreras-pixel/meliturgos-cloudflare';
const acceptedSha = 'a'.repeat(40), deployedSha = 'b'.repeat(40);
const token = 'isolated-repair-read-token-not-a-real-secret';
const root = `https://api.github.com/repos/${repository}`;
const runUrl = `${root}/actions/runs/99`, jobsUrl = `${runUrl}/jobs?per_page=100`;
const compareUrl = `${root}/compare/${acceptedSha}...${deployedSha}`;
const releaseArgs = { oidc: {ok:true,identity:{ok:true,repository,sha:deployedSha,run_id:99}}, deployedSha, token };
const compareArgs = { acceptedSha, deployedSha, token, protectedPaths:['src/accepted.js','tests/accepted.test.mjs'] };
const run = {id:99,head_sha:deployedSha,repository:{full_name:repository},path:'.github/workflows/deploy-cloudflare-release.yml',event:'workflow_dispatch'};
const jobs = {total_count:REPAIR_RELEASE_GATES.length+1,jobs:[
  ...REPAIR_RELEASE_GATES.map(name=>({name,status:'completed',conclusion:'success'})),
  {name:'resume-verified-repair',status:'in_progress',conclusion:null},
]};
const comparison = {status:'ahead',ahead_by:1,behind_by:0,total_commits:1,commits:[{sha:deployedSha}],files:[{filename:'src/unrelated.js'}]};

test('workerd executes all repair proof readers and rejects redirects without forwarding credentials', async () => {
  const compiled = await build({stdin:{resolveDir:fileURLToPath(new URL('..',import.meta.url)),contents:`
    import {verifyRepairRelease} from './src/evolution/verified-repair-release.js';
    import {diagnoseUnchangedRepairDescendant} from './src/evolution/autonomy-repair.js';
    export default {async fetch(request){return Response.json(new URL(request.url).pathname==='/compare'
      ? await diagnoseUnchangedRepairDescendant(${JSON.stringify(compareArgs)})
      : await verifyRepairRelease(${JSON.stringify(releaseArgs)}));}};
  `},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
  let redirect = null;
  const calls = [];
  const options = {modules:true,compatibilityDate:'2026-09-04',cf:false,script:compiled.outputFiles[0].text,
    outboundService:async request=>{
      assert.ok([runUrl,jobsUrl,compareUrl].includes(request.url),'all proof readers use fixed GitHub URLs');
      calls.push({url:request.url,authorization:request.headers.get('authorization'),agent:request.headers.get('user-agent')});
      if(redirect && request.url===redirect.url)return new Response(null,{status:redirect.status,headers:{location:`https://foreign.example/${token}`}});
      return Response.json(request.url===runUrl?run:request.url===jobsUrl?jobs:comparison);
    }};
  const runtime=new Miniflare(typeof convertV4MiniflareOptions==='function'?convertV4MiniflareOptions(options):options);
  try {
    for(const phase of ['release','compare']) {
      calls.length=0;
      const result=await (await runtime.dispatchFetch(`http://localhost/${phase}`)).json();
      assert.equal(result.ok,true,`${phase}: ${JSON.stringify(result)}, requests=${calls.length}`);
      assert.deepEqual(calls.map(row=>row.url),phase==='release'?[runUrl,jobsUrl]:[compareUrl]);
      assert.ok(calls.every(row=>row.authorization===`Bearer ${token}` && row.agent));
    }
    for(const [phase,url,prefix] of [['release',runUrl,'RUN'],['release',jobsUrl,'JOBS'],['compare',compareUrl,'REPAIR_COMPARE']]) {
      for(const status of [301,302,303,307,308]) {
        redirect={url,status}; calls.length=0;
        const result=await (await runtime.dispatchFetch(`http://localhost/${phase}`)).json();
        assert.equal(result.ok,false);
        assert.equal(result.reason||result.diagnostic,`${prefix}_HTTP_${status}`);
        assert.equal(calls.length,url===jobsUrl?2:1);
        assert.ok(!JSON.stringify(result).includes(token));
        assert.ok(!JSON.stringify(result).includes('foreign.example'));
      }
    }
  } finally {await runtime.dispose();}
});

test('the shared proof transport rejects arbitrary destinations before any credential-bearing request', async () => {
  const {readRepairGitHubJson}=await import('../src/evolution/repair-github-json.js');
  let calls=0;
  for(const path of ['https://foreign.example/collect','../private','actions/runs/99/jobs?per_page=100&page=2',`compare/${acceptedSha}...${deployedSha}?redirect=elsewhere`]) {
    const result=await readRepairGitHubJson(path,{token,fetchImpl:async()=>{calls++;throw Error('unexpected request');}});
    assert.deepEqual(result,{ok:false,code:'INPUT_INVALID'});
    assert.ok(!JSON.stringify(result).includes(token));
  }
  assert.equal(calls,0);
});
