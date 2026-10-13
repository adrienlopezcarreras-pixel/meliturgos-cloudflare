import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow=readFileSync('.github/workflows/deploy-candidate-preview.yml','utf8');
const proof=workflow.slice(workflow.indexOf('- name: Prove ShardVault external code reconstruction'),workflow.indexOf('- name: Stress preview UI API and recovery paths'));
const stress=workflow.slice(workflow.indexOf('- name: Stress preview UI API and recovery paths'),workflow.indexOf('- name: Upload ShardVault reconstruction and stress evidence'));

test('reconstruction HTTP transports retry transient connection resets but never skip verification',()=>{
  assert.equal((proof.match(/--retry 3 --retry-all-errors --retry-delay 3 --retry-max-time 900/g)||[]).length,2);
  assert.match(proof,/shardvault-code-reconstruct\.json/);
  assert.match(proof,/shardvault-code-reconstruct-loss3\.json/);
  assert.match(proof,/CODE_RECONSTRUCTION_VERIFIED/);
  assert.match(proof,/SHARDVAULT_CODE_RECONSTRUCTION_SHA_MISMATCH/);
  assert.match(proof,/SHARDVAULT_CODE_RECONSTRUCTION_HASH_INVALID/);
  assert.match(proof,/SHARDVAULT_CODE_RECONSTRUCTION_NOT_INDEPENDENT/);
});

test('stress proof does not accept HTTP 200 if the curl transfer failed',()=>{
  assert.match(stress,/CURL_EXIT=0/);
  assert.match(stress,/\|\| CURL_EXIT=\$\?/);
  assert.match(stress,/\[ "\$CURL_EXIT" -eq 0 \] && \[ "\$HTTP_CODE" = "200" \]/);
  assert.match(stress,/--retry 3 --retry-all-errors --retry-delay 3 --retry-max-time 900/);
  assert.match(stress,/STRESS_RECONSTRUCTION_SHA_MISMATCH/);
  assert.match(stress,/STRESS_RECONSTRUCTION_NOT_INDEPENDENT/);
});
