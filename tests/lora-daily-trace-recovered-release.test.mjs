import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = '.github/workflows/archive-existing-lora-draft.yml';
const yaml = readFileSync(file, 'utf8');
test('recovered checkpoint release is manual and requires explicit confirmation',()=>{
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /confirm_draft_release:/);
  assert.match(yaml, /default: false/);
  assert.match(yaml, /inputs\.confirm_draft_release == true/);
  assert.doesNotMatch(yaml, /^  push:|^  pull_request:|^  workflow_run:/m);
});

test('uses the existing proven exact-run checkpoint and revalidates bytes',()=>{
  assert.match(yaml, /gh run download 38302570850/);
  assert.match(yaml, /mel-lora-c000-existing-verified-checkpoint/);
  assert.match(yaml, /verify-existing-kaggle-lora-bundle\.py/);
  assert.match(yaml, /CHECKPOINT_RECOVERY_PROOF_CHANGED/);
  assert.match(yaml, /1e15f90e19ab03c5067a543ec78b8bee9f3e29c25f23697fff3a98fad0c801b0/);
  assert.match(yaml, /9c9957a6ab31b7c43f4ee0a3699b9d9292cbdd3fd3fd7368ace74657fb83f6aa/);
  assert.match(yaml, /proof\['activated'\] is False/);
});

test('creates at most a private draft and cannot deploy or overwrite assets',()=>{
  assert.match(yaml, /--draft/);
  assert.match(yaml, /CHECKPOINT_RELEASE_ALREADY_EXISTS_NO_CLOBBER/);
  assert.doesNotMatch(yaml, /--clobber|--latest|--prerelease|--public/);
  assert.doesNotMatch(yaml, /kaggle kernels push|NvidiaTeslaT4|wrangler deploy|--activate true|gh workflow run|gh api -X PATCH/);
  assert.match(yaml, /actions: read/);
  assert.match(yaml, /contents: write/);
});
