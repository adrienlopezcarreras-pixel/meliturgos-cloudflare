import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCouncilReviewRequest } from '../src/evolution/council-review.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

test('heartbeat transport never converts an unauthenticated Council call into HTTP200', async () => {
  let votes = 0;
  const response = await handleCouncilReviewRequest(new Request('https://mel.test/api/internal/council-review', {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({heartbeat:true}),
  }), {}, {review:async()=>{votes++;return {decision:'APPROVED',reviews:[]};}});
  assert.ok(response.status >= 400);
  assert.equal((await response.json()).ok,false);
  assert.equal(votes,0);
});

for (const invalidJson of [false,true]) test(`real batch client requests heartbeats but rejects an unsuccessful final response (invalidJson=${invalidJson})`, t => {
  const dir=mkdtempSync(join(tmpdir(),'council-stream-client-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  writeFileSync(join(dir,'review.diff'),'diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-old\n+new\n');
  writeFileSync(join(dir,'review.log'),'Code review');
  const hook=join(dir,'fetch.mjs');
  writeFileSync(hook,`globalThis.fetch=async(url,init)=>{if(String(url).startsWith('https://issuer.unit/'))return Response.json({value:'x'.repeat(120)});if(JSON.parse(init.body).heartbeat!==true)throw Error('HEARTBEAT_NOT_REQUESTED');return ${invalidJson ? "new Response('private-provider-body',{status:502})" : "Response.json({ok:false,code:'COUNCIL_FILE_CONTEXT_UNAVAILABLE',decision:'APPROVED'})"};};`);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/run-council-batch-review.mjs',import.meta.url)),join(dir,'review.diff'),join(dir,'review.log')],{
    cwd:dir,encoding:'utf8',timeout:5000,env:{...process.env,NODE_OPTIONS:'--import '+pathToFileURL(hook).href,
      MEL_COUNCIL_HEAD_SHA:'a'.repeat(40),MEL_COUNCIL_BASE_SHA:'b'.repeat(40),MEL_COUNCIL_REVIEW_KIND:'PRE_MERGE_REVIEW',
      ACTIONS_ID_TOKEN_REQUEST_URL:'https://issuer.unit/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'fixture-only'},
  });
  assert.notEqual(result.status,0);
  assert.match(result.stderr,invalidJson?/COUNCIL_BATCH_RESPONSE_INVALID_502/:/COUNCIL_FILE_CONTEXT_UNAVAILABLE/);
  assert.doesNotMatch(result.stdout+result.stderr,/private-provider-body/);
  assert.equal(result.stdout,'','an error payload never becomes an approval receipt');
});

test('authenticated Council streaming sends bytes before the vote and preserves rejection', async t => {
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='council-stream-test';jwk.alg='RS256';
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const now=Math.floor(Date.now()/1000),head='a'.repeat(40),base='b'.repeat(40);
  const unsigned=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({iss:'https://token.actions.githubusercontent.com',aud:'meliturgos-worker',repository:'o/r',workflow_ref:'o/r/.github/workflows/mel-candidate-promotion.yml@refs/heads/main',event_name:'workflow_dispatch',actor:'owner',sha:head,run_id:98,iat:now,exp:now+300});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(unsigned));
  const token=unsigned+'.'+Buffer.from(signature).toString('base64url');
  const original=globalThis.fetch;
  globalThis.fetch=async url=>Response.json(String(url).includes('openid-configuration')
    ?{issuer:'https://token.actions.githubusercontent.com',jwks_uri:'https://token.actions.githubusercontent.com/keys'}:{keys:[jwk]});
  t.after(()=>{globalThis.fetch=original;});
  const records=new Map();
  const db={prepare:sql=>({bind:(...args)=>({
    first:async()=>sql.startsWith('SELECT goal, files_json')
      ?{goal:'MEL-UI-AUDIT-05',files_json:'[]',applied_files_json:JSON.stringify(['a.js','tests/a.test.mjs'])}
      :sql.includes('AS roadmap_id FROM dev_jobs')?{roadmap_id:'MEL-UI-AUDIT-05'}
      :records.get(args[0])||null,
    run:async()=>{
      if(sql.startsWith('INSERT INTO dev_bridge_state'))records.set(args[0],{metadata_json:args[3]});
      return {meta:{changes:1}};
    },
  })})};
  const vote=Promise.withResolvers();let votes=0;
  const options={contextLoader:async()=>({head}),review:async()=>{votes++;return vote.promise;}};
  const call=body=>handleCouncilReviewRequest(new Request('https://mel.test/api/internal/council-review',{
    method:'POST',headers:{'x-mel-github-oidc':token,'content-type':'application/json'},body:JSON.stringify(body),
  }),{MEL_GITHUB_REPOSITORY:'o/r',DB:db},options);
  const body={head,base,heartbeat:true,diff:'diff --git a/a.js b/a.js\n+x\n',log:'GEN2-42: apply approved bridge package job-a'};
  const response=await call(body);
  const reader=response.body.getReader();let raw=new TextDecoder().decode((await reader.read()).value);
  assert.equal(raw,'\n');
  vote.resolve({decision:'REJECTED',reviews:[{model:'independent',verdict:'REJECT',blocking:['Still needs repair']}]});
  while(true){const chunk=await reader.read();if(chunk.done)break;raw+=new TextDecoder().decode(chunk.value);}
  const answer=JSON.parse(raw);
  assert.equal(answer.decision,'REJECTED');assert.equal(votes,1);
  assert.deepEqual(answer.rejected_jobs,['job-a']);
  assert.deepEqual(answer.revert_paths,['a.js','tests/a.test.mjs']);
  const cached=await(await call(body)).json();
  assert.equal(cached.cached,true);
  assert.deepEqual(cached.rejected_jobs,answer.rejected_jobs);
  assert.deepEqual(cached.revert_paths,answer.revert_paths);
  assert.equal(votes,1,'cached rejection retains attribution without another model call');
  const invalid=await call({heartbeat:true,head:'not-a-sha',diff:'x'});
  assert.equal((await invalid.json()).ok,false);
  assert.equal(votes,1,'invalid input never calls a model even when transport status is200');
});
