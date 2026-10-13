import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectC000DraftRelease,C000_TAG,C000_SHA} from '../scripts/inspect-lora-c000-draft-release.mjs';

const saved={
  tag_name:C000_TAG, target_commitish:C000_SHA, draft:true,
  assets:[{name:'mel-lora-bundle.tar.gz',size:12629356},
          {name:'checkpoint-draft-proof.json',size:364}],
};
function server(rows,status=200){
  const seen=[];
  const fetchImpl=async (url,init)=>{
    seen.push({url,method:init.method});
    return {ok:status===200,status,json:async()=>rows};
  };
  return {fetchImpl,seen};
}
const args={token:'test-only-secret'};

test('authenticated release listing verifies an unpublished draft absent from tag lookup',async()=>{
  const mock=server([saved]);
  const res=await inspectC000DraftRelease({...args,fetchImpl:mock.fetchImpl});
  assert.deepEqual(res,{ok:true,code:'CHECKPOINT_DRAFT_RELEASE_AND_ASSETS_VERIFIED_NO_PROMOTION'});
  assert.equal(mock.seen.length,1);
  assert.match(mock.seen[0].url,/\/releases\?per_page=100&page=1$/);
  assert.equal(mock.seen[0].method,'GET');
  assert.doesNotMatch(mock.seen[0].url,/\/releases\/tags\//);
});
test('preexisting draft blocks any attempted duplicate tag',async()=>{
  const res=await inspectC000DraftRelease({...args,mode:'require-absent',fetchImpl:server([saved]).fetchImpl});
  assert.deepEqual(res,{ok:false,code:'CHECKPOINT_RELEASE_ALREADY_EXISTS_NO_CLOBBER'});
});
test('absent draft may proceed to initial create only',async()=>{
  const res=await inspectC000DraftRelease({...args,mode:'require-absent',fetchImpl:server([]).fetchImpl});
  assert.deepEqual(res,{ok:true,code:'CHECKPOINT_DRAFT_ABSENT_VERIFIED'});
});
test('no private draft is never reported as published or verified',async()=>{
  const res=await inspectC000DraftRelease({...args,fetchImpl:server([]).fetchImpl});
  assert.equal(res.code,'CHECKPOINT_DRAFT_NOT_FOUND');
  assert.equal(res.ok,false);
});
test('wrong target, published release, or mismatched assets all fail closed',async()=>{
  const variants=[
    {...saved,draft:false},
    {...saved,target_commitish:'a'.repeat(40)},
    {...saved,assets:[saved.assets[0],saved.assets[0]]},
    {...saved,assets:[saved.assets[0],{name:'unexpected.txt',size:1}]},
    {...saved,assets:[saved.assets[0],{name:'checkpoint-draft-proof.json',size:0}]},
  ];
  for(const variant of variants){
    const res=await inspectC000DraftRelease({...args,fetchImpl:server([variant]).fetchImpl});
    assert.deepEqual(res,{ok:false,code:'CHECKPOINT_DRAFT_POSTCREATE_PROOF_FAILED'});
  }
});
test('GitHub API denied or malformed response remains an error',async()=>{
  const denied=await inspectC000DraftRelease({...args,fetchImpl:server([],403).fetchImpl});
  assert.equal(denied.code,'CHECKPOINT_DRAFT_LIST_ACCESS_FAILED');
  const invalid=await inspectC000DraftRelease({...args,fetchImpl:server({message:'invalid'}).fetchImpl});
  assert.equal(invalid.code,'CHECKPOINT_DRAFT_LIST_RESPONSE_INVALID');
});
test('incomplete paginated listing cannot assert absence',async()=>{
  const row=Array.from({length:100},(_,id)=>({tag_name:'other-'+id}));
  const mock=server(row);
  const res=await inspectC000DraftRelease({...args,mode:'require-absent',fetchImpl:mock.fetchImpl});
  assert.equal(res.ok,false);
  assert.equal(res.code,'CHECKPOINT_DRAFT_LIST_INCOMPLETE');
  assert.equal(mock.seen.length,5);
});
