import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createAlternativeRegistry } from '../../src/portability/prevalidated-alternative-registry.js';
import {
  COMPANION_LOCAL_AI_CANDIDATE_ID,
  runCompanionAiPrevalidationRuntime,
} from '../../src/portability/companion-ai-prevalidation-runtime.js';
import { isLocalSovereigntyAction } from '../../src/portability/local-sovereignty-actions.js';

function stores(){
  const candidates=[];
  let registry=createAlternativeRegistry([]);
  return{
    candidateStore:{
      async upsertFromWatch(report){
        for(const row of report?.results||[])for(const hint of row?.candidate_hints||[]){
          const existing=candidates.find(item=>item.layer===row.layer&&item.id===hint.id);
          if(!existing)candidates.push({layer:row.layer,id:hint.id,status:'UNVERIFIED',metadata:{}});
          else if(!['PREVALIDATED','REJECTED'].includes(existing.status))existing.status='UNVERIFIED';
        }
      },
      async list({layer=null,status=null,limit=200}={}){
        return candidates.filter(row=>(!layer||row.layer===layer)&&(!status||row.status===status)).slice(0,limit);
      },
      async setStatus({layer,id,status,metadata={}}){
        const row=candidates.find(item=>item.layer===layer&&item.id===id);
        if(row){row.status=status;row.metadata=metadata;}
        return{ok:true,changed:row?1:0};
      },
    },
    registryStore:{
      async load(){return registry;},
      async save(next){registry=next;return{ok:true};},
      get registry(){return registry;},
    },
    candidates,
  };
}

test('paired Windows local AI is prevalidated only after exact smoke and live low-refusal probes',async()=>{
  const s=stores();
  const calls=[];
  const execute=async input=>{
    calls.push(input);
    if(input.action==='health'){
      return{ok:true,ready:true,backend:'ollama-localhost',model:'local-model:latest'};
    }
    const messages=input?.payload?.messages||[];
    const last=String(messages.at(-1)?.content||'');
    return{
      ok:true,
      backend:'ollama-localhost',
      model:'local-model:latest',
      text:last.includes('MEL_AI_ALT_OK')?'MEL_AI_ALT_OK':'Direct benign local answer.',
    };
  };

  const result=await runCompanionAiPrevalidationRuntime({MEL_DEPLOYED_GIT_SHA:'a'.repeat(40)},{
    now:Date.parse('2026-10-02T15:30:00.000Z'),
    force:true,
    sourceSha:'a'.repeat(40),
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    execute,
  });

  assert.equal(result.prevalidated,1);
  assert.equal(result.low_refusal,true);
  assert.equal(result.low_refusal_probe.passed_count,3);
  const row=s.registryStore.registry.layers.ai.find(x=>x.id===COMPANION_LOCAL_AI_CANDIDATE_ID);
  assert.ok(row);
  assert.equal(row.prevalidated,true);
  assert.equal(row.low_refusal,true);
  assert.equal(row.added_cost_eur,0);
  assert.equal(row.proof.source_sha,'a'.repeat(40));
  assert.equal(calls.filter(x=>x.action==='invoke').length,4);
});

test('local AI stays blocked when the companion or local engine is unavailable',async()=>{
  const s=stores();
  const result=await runCompanionAiPrevalidationRuntime({MEL_DEPLOYED_GIT_SHA:'b'.repeat(40)},{
    now:Date.parse('2026-10-02T15:31:00.000Z'),
    force:true,
    sourceSha:'b'.repeat(40),
    candidateStore:s.candidateStore,
    registryStore:s.registryStore,
    execute:async()=>({ok:false,code:'COMPUTER_OFFLINE'}),
  });
  assert.equal(result.prevalidated,0);
  assert.equal(result.blocked,1);
  assert.equal(result.reason,'COMPUTER_OFFLINE');
  assert.equal(s.registryStore.registry.layers.ai.length,0);
});

test('local sovereignty whitelist and PowerShell companion expose only bounded localhost AI actions',async()=>{
  assert.equal(isLocalSovereigntyAction('sovereignty.ai.health'),true);
  assert.equal(isLocalSovereigntyAction('sovereignty.ai.invoke'),true);
  assert.equal(isLocalSovereigntyAction('sovereignty.ai.shell'),false);

  for(const rel of [
    '../../assets/MEL-Computer-Companion.ps1',
    '../../dist/MEL-Computer-Companion.ps1',
  ]){
    const source=await readFile(new URL(rel,import.meta.url),'utf8');
    assert.match(source,/function Perform-SovereigntyAi/);
    assert.match(source,/http:\/\/127\.0\.0\.1:11434/);
    assert.match(source,/SOVEREIGNTY_AI_LOCAL_ENGINE_UNAVAILABLE/);
    assert.match(source,/SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_PENDING/);
    assert.ok(source.includes('https://ollama.com/download/OllamaSetup.exe'));
    assert.match(source,/Get-AuthenticodeSignature/);
    assert.match(source,/O=Ollama Inc\\\./);
    assert.match(source,/OLLAMA_INSTALLER_SIGNATURE_INVALID/);
    assert.match(source,/VERYSILENT \/NORESTART \/SUPPRESSMSGBOXES/);
    assert.ok(source.includes('qwen2.5:1.5b'));
    assert.match(source,/ArgumentList @\("pull",\$model\)/);
    assert.match(source,/WaitForExit\(300000\)/);
    assert.match(source,/WaitForExit\(720000\)/);
    assert.match(source,/SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_FAILED/);
    assert.match(source,/\$Version = "1\.4\.0"/);
    assert.match(source,/mel\.local-ai-bootstrap\/v2/);
    assert.match(source,/engine_version = \$Version/);
    assert.match(source,/process_id = \$PID/);
    assert.match(source,/OLLAMA_BOOTSTRAP_PROCESS_EXITED/);
    assert.match(source,/OLLAMA_BOOTSTRAP_SCRIPT_PARSE_FAILED/);
    assert.match(source,/RedirectStandardError \$stderrPath/);
    assert.match(source,/System\.Management\.Automation\.Language\.Parser/);
    assert.match(source,/MEL_LOCAL_AI_AUTO_INSTALL/);
    assert.match(source,/SOVEREIGNTY_AI_MODEL_NOT_ALLOWED/);
    assert.match(source,/network_scope="localhost-only"/);
    assert.doesNotMatch(source,/sovereignty\.ai\.shell/);
  }
});

test('production sovereignty proof and hourly maintenance both refresh local AI evidence',async()=>{
  const bootstrap=await readFile(new URL('../../src/evolution/release-launch-bootstrap.js',import.meta.url),'utf8');
  assert.match(bootstrap,/runCompanionAiPrevalidationRuntime/);
  assert.match(bootstrap,/ai_local:\s*\(runtimeEnv, options\)/);
  assert.match(bootstrap,/const requestedRefresh = String\(url\.searchParams\.get\('refresh'\)/);
  assert.match(bootstrap,/await runRefresh\(requestedRefresh, refresher\)/);
  assert.match(bootstrap,/sourceSha:\s*deployedSha/);

  const index=await readFile(new URL('../../src/index.js',import.meta.url),'utf8');
  const scheduled=index.slice(index.indexOf('async scheduled'));
  assert.match(scheduled,/runCompanionAiPrevalidationRuntime\(env, \{ sourceSha: deployedWatchSourceSha\(\) \}\)/);
});


test('production SOV proof gives local AI bootstrap a bounded installation window',async()=>{
  const workflow=await readFile(new URL('../../.github/workflows/mel-sov-01-live-proof.yml',import.meta.url),'utf8');
  assert.ok(workflow.includes('if [ "${TARGET}" = "ai_local" ]; then MAX_ATTEMPTS=60; fi'));
  assert.match(workflow,/SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_PENDING/);
  assert.match(workflow,/sleep 30/);
  assert.match(workflow,/SOVEREIGNTY_AI_LOCAL_BOOTSTRAP_FAILED:\*/);
});
