import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertNoActiveDeploy, requestAutonomousRelease, RELEASE_BRANCH } from '../scripts/mel-autonomous-release-dispatch.mjs';

const MAIN_SHA = 'a'.repeat(40);
const OLD_SHA = 'b'.repeat(40);

test('MEL automation fast-forwards the release pointer then dispatches without human approval or MAX', async () => {
  const operations = [];
  let releaseSha = OLD_SHA;
  const fakeFetch = async (url, request) => {
    const path = new URL(url).pathname;
    operations.push({ path, method: request.method, body: request.body && JSON.parse(request.body) });
    if (path.endsWith('/branches/main')) return { ok: true, status: 200, json: async () => ({ commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/branches/' + RELEASE_BRANCH)) return { ok: true, status: 200, json: async () => ({ commit: { sha: releaseSha } }) };
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs')) return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    if (path.endsWith('/git/refs/heads/' + RELEASE_BRANCH)) {
      releaseSha = JSON.parse(request.body).sha;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (path.endsWith('/dispatches')) return { ok: true, status: 204, json: async () => null };
    throw new Error('Unexpected endpoint: ' + path);
  };
  const result = await requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl: fakeFetch });
  assert.equal(result.main_sha, MAIN_SHA);
  const patch = operations.find(x => x.method === 'PATCH');
  assert.deepEqual(patch.body, { sha: MAIN_SHA, force: false });
  const dispatch = operations.find(x => x.path.endsWith('/dispatches'));
  assert.equal(dispatch.body.inputs.expected_sha, MAIN_SHA);
  assert.equal(dispatch.body.inputs.approval, 'AUTONOMOUS_POLICY');
  assert.equal(dispatch.body.inputs.autonomous_release, 'true');
  assert.equal(dispatch.body.inputs.owner_max_autorelease, 'false');
  assert.ok(operations.filter(x => x.path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs')).length === 2);
  assert.ok(!operations.some(x => x.path.includes('branches/release%2F')), 'run preflight must not filter away main-ref dispatches');
});

test('MEL automation refuses to overlap active deployment', () => {
  assert.throws(() => assertNoActiveDeploy([{ name: 'deploy-cloudflare-release', status: 'in_progress' }]), /PRODUCTION_DEPLOY_ALREADY_ACTIVE/);
  assert.throws(() => assertNoActiveDeploy(null), /RELEASE_RUN_LIST_MISSING/);
  assert.doesNotThrow(() => assertNoActiveDeploy([{ name: 'deploy-cloudflare-release', status: 'completed' }]));
});

test('an already running production release defers main-push promotion without a false-red run or mutations', async () => {
  for (const status of ['queued', 'in_progress', 'waiting']) {
    const operations = [];
    const fetchImpl = async (url, options) => {
      const path = new URL(url).pathname;
      operations.push(options.method + ' ' + path);
      if (path.endsWith('/branches/main')) {
        return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: MAIN_SHA } }) };
      }
      if (path.endsWith('/branches/' + RELEASE_BRANCH)) {
        return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: OLD_SHA } }) };
      }
      if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs')) {
        return { ok: true, status: 200, json: async () => ({
          workflow_runs: [{ name: 'deploy-cloudflare-release', head_sha: OLD_SHA, status }],
        }) };
      }
      throw new Error('MUTATION_DURING_ACTIVE_RELEASE:' + path);
    };
    const result = await requestAutonomousRelease({
      token: 'TEST_ONLY', fetchImpl, requireProtectedRefs: true,
    });
    assert.deepEqual(result, {
      accepted: false, reason: 'PRODUCTION_DEPLOY_ALREADY_ACTIVE',
      main_sha: MAIN_SHA, release_branch: RELEASE_BRANCH,
    });
    assert.ok(operations.every(op => op.startsWith('GET ')), 'no ref update or dispatch while running');
  }
});

test('missing production run list still fails closed instead of being treated as a harmless deferral', async () => {
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    if (path.endsWith('/branches/main')) {
      return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: MAIN_SHA } }) };
    }
    if (path.endsWith('/branches/' + RELEASE_BRANCH)) {
      return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: OLD_SHA } }) };
    }
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs')) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    throw new Error('UNEXPECTED:' + options.method + ':' + path);
  };
  await assert.rejects(
    () => requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl, requireProtectedRefs: true }),
    /RELEASE_RUN_LIST_MISSING/,
  );
});

test('MEL automation refuses missing token and wrong repository', async () => {
  await assert.rejects(() => requestAutonomousRelease({ token: '' }), /GH_TOKEN_REQUIRED/);
  await assert.rejects(() => requestAutonomousRelease({ token: 'TEST', repo: 'other/repo' }), /UNEXPECTED_RELEASE_REPOSITORY/);
});

test('MEL autonomous workflow has narrow scoped token and no hardware/MAX side effects', () => {
  const yaml = readFileSync(new URL('../.github/workflows/mel-autonomous-production-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.startsWith('name: mel-autonomous-production-release'));
  assert.ok(yaml.includes('  contents: write'));
  assert.ok(yaml.includes('  actions: write'));
  assert.ok(yaml.includes("github.actor == 'adrienlopezcarreras-pixel'"));
  assert.ok(yaml.includes('node scripts/mel-autonomous-release-dispatch.mjs'));
  assert.ok(!yaml.includes('wrangler deploy'));
  assert.ok(!yaml.includes('owner_max_autorelease: true'));
});

test('successful releases do not recursively re-dispatch when main is already current', async () => {
  const touched = [];
  const fakeFetch = async (url, req) => {
    const path = new URL(url).pathname;
    touched.push(req.method + ' ' + path);
    if (path.endsWith('/branches/main') || path.endsWith('/branches/' + RELEASE_BRANCH))
      return { ok: true, status: 200, json: async () => ({ commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ name: 'deploy-cloudflare-release', head_sha: MAIN_SHA, status: 'completed', conclusion: 'success' }] }) };
    throw new Error('Unexpected production mutation: ' + path);
  };
  const result = await requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl: fakeFetch });
  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'ALREADY_CURRENT');
  assert.ok(touched.every(line => line.startsWith('GET ')));
});

test('completed main-ref production dispatch safely catches up after success or failure', () => {
  const yaml = readFileSync(new URL('../.github/workflows/mel-autonomous-production-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.includes('  workflow_run:'));
  assert.ok(yaml.includes('      - completed'));
  assert.ok(yaml.includes("github.event.workflow_run.head_branch == 'main'"));
  assert.ok(yaml.includes("github.event.workflow_run.event == 'workflow_dispatch'"));
  assert.ok(yaml.includes("github.event.workflow_run.conclusion == 'success'"));
  assert.ok(yaml.includes("github.event.workflow_run.conclusion == 'failure'"));
  assert.ok(!yaml.includes("github.event.workflow_run.head_branch == 'release/mel-hardware-v0.1.0'"));
  assert.ok(yaml.includes('MEL_CATCHUP_COMPLETED_SHA:'));
  assert.ok(yaml.includes('github.event.workflow_run.head_sha'));
});

test('unattended main-push deployments require protected branches', () => {
  const yaml = readFileSync(new URL('../.github/workflows/mel-autonomous-production-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.includes('  push:'));
  assert.ok(yaml.includes('      - main'));
  assert.ok(!yaml.includes("vars.MEL_AUTONOMOUS_MAIN_PUSH_ENABLED == 'true'"));
  assert.ok(yaml.includes("github.ref == 'refs/heads/main'"));
  assert.ok(yaml.includes("MEL_REQUIRE_PROTECTED_REFS: ${{ (github.event_name == 'push' || github.event_name == 'schedule') && 'true' || 'false' }}"));
});

test('hourly promotion safety net uses protected refs and deduplicates failed exact SHAs', () => {
  const yaml = readFileSync(new URL('../.github/workflows/mel-autonomous-production-release.yml', import.meta.url), 'utf8');
  assert.ok(yaml.includes("  schedule:\\n    - cron: '17 * * * *'".replace('\\n','\n')));
  assert.ok(yaml.includes("github.event_name == 'schedule' && github.ref == 'refs/heads/main'"));
  assert.ok(yaml.includes("MEL_SKIP_ALREADY_ATTEMPTED_SHA: ${{ github.event_name == 'schedule' && 'true' || 'false' }}"));
  assert.ok(!yaml.includes('owner_max_autorelease: true'));
});

test('scheduled reconciliation never retries the identical failed main SHA', async () => {
  const calls=[];
  const fakeFetch=async(url,req)=>{
    const path=new URL(url).pathname;
    calls.push(req.method + ' ' + path);
    if(path.endsWith('/branches/main')||path.endsWith('/branches/'+RELEASE_BRANCH))
      return {ok:true,status:200,json:async()=>({protected:true,commit:{sha:MAIN_SHA}})};
    if(path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return {ok:true,status:200,json:async()=>({workflow_runs:[{
        name:'deploy-cloudflare-release',head_sha:MAIN_SHA,status:'completed',conclusion:'failure',
      }]})};
    throw Error('UNSAFE_RETRY:'+path);
  };
  const result=await requestAutonomousRelease({
    token:'TEST_ONLY',fetchImpl:fakeFetch,requireProtectedRefs:true,skipPreviouslyCompletedSha:true,
  });
  assert.deepEqual({accepted:result.accepted,reason:result.reason},{accepted:false,reason:'LATEST_MAIN_ALREADY_ATTEMPTED'});
  assert.ok(calls.every(line=>line.startsWith('GET ')));
});

test('scheduled reconciliation catches up exactly once after older failed release', async () => {
  const calls=[];
  let releaseSha=OLD_SHA;
  const fakeFetch=async(url,req)=>{
    const path=new URL(url).pathname;
    calls.push(req.method+' '+path);
    if(path.endsWith('/branches/main'))
      return {ok:true,status:200,json:async()=>({protected:true,commit:{sha:MAIN_SHA}})};
    if(path.endsWith('/branches/'+RELEASE_BRANCH))
      return {ok:true,status:200,json:async()=>({protected:true,commit:{sha:releaseSha}})};
    if(path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return {ok:true,status:200,json:async()=>({workflow_runs:[{
        name:'deploy-cloudflare-release',head_sha:OLD_SHA,status:'completed',conclusion:'failure',
      }]})};
    if(path.endsWith('/git/refs/heads/'+RELEASE_BRANCH)){
      releaseSha=JSON.parse(req.body).sha;
      return {ok:true,status:200,json:async()=>({})};
    }
    if(path.endsWith('/dispatches'))return {ok:true,status:204,json:async()=>null};
    throw Error('UNEXPECTED:'+path);
  };
  const result=await requestAutonomousRelease({
    token:'TEST_ONLY',fetchImpl:fakeFetch,requireProtectedRefs:true,skipPreviouslyCompletedSha:true,
  });
  assert.equal(result.accepted,true);
  assert.equal(calls.filter(s=>s.startsWith('POST ')).length,1);
  assert.equal(calls.filter(s=>s.startsWith('PATCH ')).length,1);
});

test('unprotected main or release refuses unattended promotion before any mutation', async () => {
  for (const pair of [[false, true], [true, false], [false, false]]) {
    const requests = [];
    const fetchImpl = async (url, options) => {
      const path = new URL(url).pathname;
      requests.push({ path, method: options.method });
      if (path.endsWith('/branches/main'))
        return { ok: true, status: 200, json: async () => ({ protected: pair[0], commit: { sha: MAIN_SHA } }) };
      if (path.endsWith('/branches/' + RELEASE_BRANCH))
        return { ok: true, status: 200, json: async () => ({ protected: pair[1], commit: { sha: OLD_SHA } }) };
      throw new Error('MUTATION_ATTEMPTED_WITH_UNPROTECTED_BRANCH');
    };
    await assert.rejects(
      () => requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl, requireProtectedRefs: true }),
      /PROTECTED_MAIN_AND_RELEASE_BRANCHES_REQUIRED/,
    );
    assert.ok(requests.every(x => x.method === 'GET'));
  }
});

test('both protected refs continue through existing exact-SHA and concurrency gates', async () => {
  let reads = 0;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    reads += 1;
    if (path.endsWith('/branches/main'))
      return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/branches/' + RELEASE_BRANCH))
      return { ok: true, status: 200, json: async () => ({ protected: true, commit: { sha: MAIN_SHA } }) };
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ name: 'deploy-cloudflare-release', head_sha: MAIN_SHA, status: 'completed', conclusion: 'success' }] }) };
    throw new Error('UNEXPECTED_PRODUCTION_MUTATION:' + path);
  };
  const result = await requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl, requireProtectedRefs: true });
  assert.equal(result.reason, 'ALREADY_CURRENT');
  assert.equal(result.accepted, false);
  assert.equal(reads, 3);
});

test('already-moved release pointer without successful production proof must still dispatch', async () => {
  const calls=[];
  const fakeFetch=async(url,request)=>{
    const path=new URL(url).pathname;
    calls.push({path,method:request.method});
    if(path.endsWith('/branches/main')||path.endsWith('/branches/'+RELEASE_BRANCH))
      return {ok:true,status:200,json:async()=>({protected:true,commit:{sha:MAIN_SHA}})};
    if(path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return {ok:true,status:200,json:async()=>({workflow_runs:[{name:'deploy-cloudflare-release',head_sha:OLD_SHA,status:'completed',conclusion:'success'}]})};
    if(path.endsWith('/dispatches'))return {ok:true,status:204,json:async()=>null};
    throw Error('UNEXPECTED:'+path);
  };
  const result=await requestAutonomousRelease({token:'TEST_ONLY',fetchImpl:fakeFetch,requireProtectedRefs:true});
  assert.equal(result.accepted,true);
  assert.ok(calls.some(x=>x.path.endsWith('/dispatches')&&x.method==='POST'));
  assert.ok(!calls.some(x=>x.method==='PATCH'));
});

test('release pointer confirmation tolerates stale branch reads but never bypasses exact SHA',async()=>{
  let releaseSha=OLD_SHA,staleRemaining=2,waits=0,dispatches=0;
  const fakeFetch=async(url,request)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/branches/main'))return {ok:true,status:200,json:async()=>({commit:{sha:MAIN_SHA}})};
    if(path.endsWith('/branches/'+RELEASE_BRANCH)){
      const visibleSha=releaseSha===MAIN_SHA&&staleRemaining-->0?OLD_SHA:releaseSha;
      return {ok:true,status:200,json:async()=>({commit:{sha:visibleSha}})};
    }
    if(path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return {ok:true,status:200,json:async()=>({workflow_runs:[]})};
    if(path.endsWith('/git/refs/heads/'+RELEASE_BRANCH)){
      releaseSha=JSON.parse(request.body).sha;
      return {ok:true,status:200,json:async()=>({})};
    }
    if(path.endsWith('/dispatches')){dispatches++;return {ok:true,status:204,json:async()=>null};}
    throw Error('UNEXPECTED:'+path);
  };
  const result=await requestAutonomousRelease({token:'TEST_ONLY',fetchImpl:fakeFetch,sleepImpl:async()=>{waits++;}});
  assert.equal(result.accepted,true);
  assert.equal(dispatches,1);
  assert.equal(waits,2);
});

test('release pointer mismatch after retries refuses any deployment',async()=>{
  let dispatched=false;
  const fakeFetch=async(url,request)=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/branches/main'))return {ok:true,status:200,json:async()=>({commit:{sha:MAIN_SHA}})};
    if(path.endsWith('/branches/'+RELEASE_BRANCH))return {ok:true,status:200,json:async()=>({commit:{sha:OLD_SHA}})};
    if(path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return {ok:true,status:200,json:async()=>({workflow_runs:[]})};
    if(path.endsWith('/git/refs/heads/'+RELEASE_BRANCH))return {ok:true,status:200,json:async()=>({})};
    if(path.endsWith('/dispatches')){dispatched=true;return {ok:true,status:204,json:async()=>null};}
    throw Error('UNEXPECTED:'+path);
  };
  await assert.rejects(()=>requestAutonomousRelease({token:'TEST_ONLY',fetchImpl:fakeFetch,sleepImpl:async()=>{}}),/RELEASE_POINTER_NOT_VERIFIED/);
  assert.equal(dispatched,false);
});

test('catch-up does not dispatch if main has not advanced since the completed release', async () => {
  const calls=[];
  const fakeFetch=async (url,options) => {
    calls.push({url,method:options.method});
    if(new URL(url).pathname.endsWith('/branches/main'))
      return {ok:true,status:200,json:async()=>({commit:{sha:MAIN_SHA}})};
    throw new Error('NO_FURTHER_API_CALLS_EXPECTED');
  };
  const result=await requestAutonomousRelease({
    token:'TEST_ONLY',fetchImpl:fakeFetch,completedReleaseSha:MAIN_SHA,
  });
  assert.equal(result.accepted,false);
  assert.equal(result.reason,'NO_NEW_MAIN_SINCE_COMPLETED_RELEASE');
  assert.equal(calls.length,1);
  assert.ok(calls.every(c=>c.method==='GET'));
});

test('catch-up after older completed release promotes only when a newer main has not already been attempted', async () => {
  const operations=[];
  let releaseSha=OLD_SHA;
  const fakeFetch=async(url,request)=>{
    const path=new URL(url).pathname;
    operations.push({path,method:request.method});
    if(path.endsWith('/branches/main'))
      return {ok:true,status:200,json:async()=>({commit:{sha:MAIN_SHA}})};
    if(path.endsWith('/branches/'+RELEASE_BRANCH))
      return {ok:true,status:200,json:async()=>({commit:{sha:releaseSha}})};
    if(path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return {ok:true,status:200,json:async()=>({workflow_runs:[{
        name:'deploy-cloudflare-release',head_sha:OLD_SHA,status:'completed',conclusion:'failure',
      }]})};
    if(path.endsWith('/git/refs/heads/'+RELEASE_BRANCH)){
      releaseSha=JSON.parse(request.body).sha;
      return {ok:true,status:200,json:async()=>({})};
    }
    if(path.endsWith('/dispatches'))return {ok:true,status:204,json:async()=>null};
    throw new Error('UNEXPECTED:'+path);
  };
  const result=await requestAutonomousRelease({
    token:'TEST_ONLY',fetchImpl:fakeFetch,completedReleaseSha:OLD_SHA,
  });
  assert.equal(result.accepted,true);
  assert.equal(result.main_sha,MAIN_SHA);
  assert.equal(operations.filter(x=>x.method==='POST').length,1);
});

test('catch-up never retries a previously completed latest main SHA after failure', async () => {
  const calls=[];
  const fakeFetch=async(url,req)=>{
    const path=new URL(url).pathname;
    calls.push(req.method);
    if(path.endsWith('/branches/main')||path.endsWith('/branches/'+RELEASE_BRANCH))
      return {ok:true,status:200,json:async()=>({commit:{sha:MAIN_SHA}})};
    if(path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return {ok:true,status:200,json:async()=>({workflow_runs:[{
        name:'deploy-cloudflare-release',head_sha:MAIN_SHA,status:'completed',conclusion:'failure',
      }]})};
    throw new Error('RETRY_MUTATION_FORBIDDEN:'+path);
  };
  const result=await requestAutonomousRelease({
    token:'TEST_ONLY',fetchImpl:fakeFetch,completedReleaseSha:OLD_SHA,
  });
  assert.equal(result.accepted,false);
  assert.equal(result.reason,'LATEST_MAIN_ALREADY_ATTEMPTED');
  assert.ok(calls.every(method=>method==='GET'));
});

test('catch-up validates the source workflow SHA fail closed',async()=>{
  await assert.rejects(
    ()=>requestAutonomousRelease({token:'TEST_ONLY',completedReleaseSha:'not-a-sha',
      fetchImpl:async()=>({ok:true,status:200,json:async()=>({commit:{sha:MAIN_SHA}})})}),
    /COMPLETED_RELEASE_SHA_INVALID/
  );
});

test('autonomous release refuses to dispatch if main changes during promotion', async () => {
  let mainReads = 0;
  let releaseSha = OLD_SHA;
  const calls = [];
  const fakeFetch = async (url, request) => {
    const path = new URL(url).pathname;
    calls.push(request.method + ' ' + path);
    if (path.endsWith('/branches/main')) {
      mainReads += 1;
      return { ok: true, status: 200, json: async () => ({
        commit: { sha: mainReads === 1 ? MAIN_SHA : 'c'.repeat(40) },
      }) };
    }
    if (path.endsWith('/branches/' + RELEASE_BRANCH))
      return { ok: true, status: 200, json: async () => ({ commit: { sha: releaseSha } }) };
    if (path.endsWith('/actions/workflows/deploy-cloudflare-release.yml/runs'))
      return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) };
    if (path.endsWith('/git/refs/heads/' + RELEASE_BRANCH)) {
      releaseSha = JSON.parse(request.body).sha;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (path.endsWith('/dispatches'))
      throw new Error('STALE_RELEASE_DISPATCH_FORBIDDEN');
    throw new Error('Unexpected endpoint: ' + path);
  };
  await assert.rejects(
    () => requestAutonomousRelease({ token: 'TEST_ONLY', fetchImpl: fakeFetch }),
    /CANONICAL_MAIN_CHANGED_BEFORE_DISPATCH/,
  );
  assert.equal(mainReads, 2);
  assert.ok(!calls.some(call => call.startsWith('POST ')));
});

test('release guard rejects uppercase active workflow state from provider', () => {
  assert.throws(() => assertNoActiveDeploy([{ name: 'deploy-cloudflare-release', status: 'IN_PROGRESS' }]), /PRODUCTION_DEPLOY_ALREADY_ACTIVE/);
  assert.throws(() => assertNoActiveDeploy([{ name: 'deploy-cloudflare-release', status: 'QUEUED' }]), /PRODUCTION_DEPLOY_ALREADY_ACTIVE/);
});
