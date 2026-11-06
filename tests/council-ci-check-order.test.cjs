'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { selectLatestCheckOutcomes } = require('../scripts/council-ci-check-order.cjs');

const check = (id, conclusion, completed_at, status='completed') => ({
  id, name:'full-suite',status,conclusion,
  started_at:'2026-11-06T18:30:48Z',completed_at
});

test('Council accepts later successful completion even when duplicate higher-ID run was cancelled earlier',()=>{
  const successful=check(128076490811,'success','2026-11-06T18:36:21Z');
  const redundant=check(128076828235,'cancelled','2026-11-06T18:31:42Z');
  const last=selectLatestCheckOutcomes([redundant,successful]).get('full-suite');
  assert.equal(last,successful);
  assert.equal(last.conclusion,'success');
});

test('Council still blocks a later failure, cancellation or incomplete latest check',()=>{
  const success=check(1,'success','2026-11-06T18:31:00Z');
  for(const conclusion of ['failure','cancelled']){
    const failed=check(2,conclusion,'2026-11-06T18:32:00Z');
    assert.equal(selectLatestCheckOutcomes([success,failed]).get('full-suite'),failed);
  }
  const pending={...check(3,null,null,'in_progress'),started_at:'2026-11-06T18:34:00Z'};
  assert.equal(selectLatestCheckOutcomes([success,pending]).get('full-suite'),pending);
});

test('Council preserves fail-closed tie break and the review gate still requires all checks green',()=>{
  const first=check(10,'success','2026-11-06T18:35:00Z');
  const second=check(11,'failure','2026-11-06T18:35:00Z');
  assert.equal(selectLatestCheckOutcomes([first,second]).get('full-suite'),second);
  const workflow=readFileSync(require('node:path').join(__dirname,'../.github/workflows/mel-pr-council-review.yml'),'utf8');
  assert.match(workflow,/selectLatestCheckOutcomes\(checks\)/);
  assert.match(workflow,/const ready=pending.length===0&&unfinished.length===0/);
  assert.match(workflow,/needs.preflight.outputs.ready == 'true'/);
});
