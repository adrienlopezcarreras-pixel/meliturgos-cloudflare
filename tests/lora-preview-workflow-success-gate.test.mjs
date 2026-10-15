import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assessLoraPreviewWorkflowRun, EXPECTED_PREVIEW_BRANCH } from '../scripts/check-lora-preview-workflow-run.mjs';

const sha='a'.repeat(40);
const success=(changes={})=>({
  id: 10, name:'deploy-candidate-preview', head_sha:sha,
  head_branch: EXPECTED_PREVIEW_BRANCH, event:'push',
  status:'completed', conclusion:'success', ...changes,
});

test('only successful exact SHA and reconciliation branch authorizes LoRA benchmarking',()=>{
  const result=assessLoraPreviewWorkflowRun({workflow_runs:[success()]},sha);
  assert.equal(result.ok,true);
  assert.equal(result.run_id,10);
  assert.equal(result.sha,sha);
});
test('a late failed or in-progress preview cannot be masked by an earlier success',()=>{
  for(const newer of [
    success({id:11,conclusion:'failure'}),
    success({id:11,status:'in_progress',conclusion:null}),
    success({id:11,conclusion:'cancelled'}),
  ]){
    const result=assessLoraPreviewWorkflowRun({workflow_runs:[success(),newer]},sha);
    assert.equal(result.ok,false);
    assert.equal(result.code,'LORA_PREVIEW_WORKFLOW_NOT_SUCCESSFUL');
    assert.equal(result.run_id,11);
  }
});
test('rejects wrong branch, event, SHA, missing proof and malformed API payload',()=>{
  for(const row of [
    success({head_sha:'b'.repeat(40)}),
    success({head_branch:'main'}),
    success({head_branch:'candidate/mel-clean-autonomy'}),
    success({event:'pull_request'}),
    success({name:'deploy-cloudflare-release'}),
  ]) assert.equal(assessLoraPreviewWorkflowRun({workflow_runs:[row]},sha).ok,false);
  assert.equal(assessLoraPreviewWorkflowRun({},sha).code,'LORA_PREVIEW_WORKFLOW_EVIDENCE_INVALID');
  assert.equal(assessLoraPreviewWorkflowRun({workflow_runs:[]},'garbage').code,'LORA_PREVIEW_EXPECTED_SHA_INVALID');
});
test('collector requires completed GitHub preview proof before checking Worker deployed SHA',()=>{
  const source=readFileSync('.github/workflows/lora-kaggle-free-collect.yml','utf8');
  const from=source.indexOf('- name: Wait for isolated preview exact collector SHA');
  const until=source.indexOf('- name: Benchmark exact Kaggle adapter',from);
  const section=source.slice(from,until);
  assert.match(source,/permissions:\n  contents: read\n  actions: read/);
  assert.match(section,/GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(section,/check-lora-preview-workflow-run\.mjs/);
  assert.match(section,/check-lora-preview-version\.mjs/);
  assert.ok(section.indexOf('check-lora-preview-workflow-run.mjs')<section.indexOf('check-lora-preview-version.mjs'));
  assert.match(section,/LORA_PREVIEW_WORKFLOW_API_AUTH_OR_SCOPE_FAILED/);
  assert.match(section,/LORA_PREVIEW_EXACT_SHA_TIMEOUT/);
});
