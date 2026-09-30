import test from 'node:test';
import assert from 'node:assert/strict';
import { __sovereigntyWatchTest } from '../../src/evaluation/sovereignty-watch-runtime.js';

test('sovereignty watch extracts unverified provider candidates and filters current provider domain',()=>{
  const target={
    id:'sovereignty_runtime',
    layer:'runtime',
    metadata:{verification_policy:'DISCOVERY_ONLY_THEN_LOCAL_LIVE_PREVALIDATION'},
  };
  const result=__sovereigntyWatchTest.normalizeResearch(target,{
    summary:'Possible alternatives found',
    sources:[
      {title:'Current provider docs',url:'https://developers.cloudflare.com/workers/'},
      {title:'Alternative A',url:'https://docs.alt-runtime.example/guide'},
      {title:'Alternative A duplicate',url:'https://docs.alt-runtime.example/changelog'},
      {title:'Alternative B',url:'https://another-runtime.example/docs'},
    ],
  });
  assert.equal(result.status,'OBSERVED');
  assert.equal(result.candidate_status,'DISCOVERY_ONLY');
  assert.equal(result.activation_allowed,false);
  assert.equal(result.prevalidated,false);
  assert.deepEqual(result.candidate_hints.map(x=>x.id),[
    'docs.alt-runtime.example',
    'another-runtime.example',
  ]);
  assert.ok(result.candidate_hints.every(x=>x.status==='UNVERIFIED'));
  assert.ok(result.candidate_hints.every(x=>x.prevalidated===false));
});

test('candidate extraction never converts research sources into emergency-ready alternatives',()=>{
  const target={
    id:'sovereignty_source_control',
    layer:'source_control',
    metadata:{verification_policy:'DISCOVERY_ONLY_THEN_LOCAL_LIVE_PREVALIDATION'},
  };
  const result=__sovereigntyWatchTest.normalizeResearch(target,{
    sources:[
      {title:'GitHub',url:'https://github.com/features'},
      {title:'Other forge',url:'https://forge.example/docs'},
    ],
  });
  assert.deepEqual(result.candidate_hints.map(x=>x.id),['forge.example']);
  assert.equal(result.candidate_hints[0].activation_allowed,false);
  assert.equal(result.candidate_hints[0].prevalidated,false);
});
