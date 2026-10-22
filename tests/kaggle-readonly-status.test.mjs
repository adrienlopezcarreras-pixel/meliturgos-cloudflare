import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../scripts/kaggle-readonly-status.py',import.meta.url));

function collect({status='running',exit=0,timeout=false,raw=null}={}) {
  const source=`import importlib.util,json,subprocess\nfrom types import SimpleNamespace\nspec=importlib.util.spec_from_file_location('status',${JSON.stringify(script)})\nm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\ndef run(args,**kwargs):\n assert args[2:5]==['kaggle','kernels','status']\n assert kwargs['capture_output'] and kwargs['timeout']==45\n ${timeout?'raise subprocess.TimeoutExpired(args,45)':`return SimpleNamespace(returncode=${exit},stdout=${JSON.stringify(raw??`private-owner/kernel has status "${status}"`)},stderr='PRIVATE_TOKEN_OR_TRAINING_DATA')`}\nprint(json.dumps(m.collect_status('private-owner/kernel',run)))`;
  const output=execFileSync('python',['-c',source],{encoding:'utf8'});
  assert.doesNotMatch(output,/PRIVATE_TOKEN|TRAINING_DATA|private-owner/);
  const proof=JSON.parse(output);
  assert.equal(proof.gpu_execution_verified,false);
  assert.equal(proof.weights_verified,false);
  assert.equal(proof.promotion_allowed,false);
  return proof;
}
for(const status of ['running','queued','complete','error','cancelled','canceled','KernelWorkerStatus.COMPLETE']) {
  test(`read-only status ${status} never proves training weights or authorizes promotion`,()=>{
    const proof=collect({status});
    assert.equal(proof.ok,true);
    assert.equal(proof.session_completed,status.toLowerCase().endsWith('complete'));
    assert.equal(proof.session_status,status.split('.').pop().toUpperCase().replace('CANCELED','CANCELLED'));
  });
}
test('provider errors and malformed or unrelated responses remain unavailable without raw disclosure',()=>{
  for(const input of [{exit:1},{timeout:true},{raw:'secret session complete PRIVATE_TOKEN'},{raw:'other-owner/kernel has status "complete"'}]){
    const proof=collect(input);assert.equal(proof.ok,false);assert.equal(proof.session_status,'UNAVAILABLE');
  }
});
test('missing credentials produce a bounded sanitized artifact without querying Kaggle',()=>{
  const cwd=mkdtempSync(join(tmpdir(),'mel-kaggle-status-'));
  try {
    let output='';
    try { execFileSync('python',[script],{cwd,env:{...process.env,KAGGLE_API_TOKEN:''},encoding:'utf8'});assert.fail('missing token must fail'); }
    catch(error){assert.equal(error.status,1);output=String(error.stdout);}
    const proof=JSON.parse(readFileSync(join(cwd,'kaggle-lora-status.json'),'utf8'));
    assert.equal(proof.error_code,'KAGGLE_API_TOKEN_MISSING');
    assert.equal(proof.promotion_allowed,false);
    assert.deepEqual(JSON.parse(output),proof);
  } finally {rmSync(cwd,{recursive:true,force:true});}
});
test('existing status workflow runs offline checks on PRs and never publishes raw kernel output',()=>{
  const workflow=readFileSync(new URL('../.github/workflows/lora-kaggle-status.yml',import.meta.url),'utf8');
  assert.match(workflow,/if: \$\{\{ github.event_name != 'pull_request' \}\}/);
  assert.match(workflow,/needs: contract/);
  assert.match(workflow,/path: kaggle-lora-status\.json/);
  assert.doesNotMatch(workflow,/kernels (?:push|output|logs)|kaggle-debug-output|kaggle-live\.log/);
});
