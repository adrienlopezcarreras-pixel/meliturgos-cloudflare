import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { roundtripCodeFallbackCandidates } from '../src/continuity/shardvault-runtime.js';
import { allowCodeEndpointForShard } from '../src/continuity/shardvault-code-target-policy.js';

const runtime = await readFile(new URL('../src/continuity/shardvault-runtime.js',import.meta.url),'utf8');
const state = { attempted_endpoints:[], failed_endpoint_ids:[], cycle_quarantined_endpoint_ids:[], endpoint_failures:{} };
const candidate = {
  id:'pastegg-public',adapter:'pastegg_b64',urlTemplate:'https://paste.gg/{objectId}',
  providerId:'pastegg',operatorDomain:'paste.gg',maxBytes:76800,
  expectedRetentionDays:365,retentionModel:'declared_never',score:85,
  representativeBytes:262144,representativeSha256:'a'.repeat(64),
  representativeVerifiedAt:new Date().toISOString(),
};

test('durable validated endpoint with slightly undersized representative proof gets exact-current-shard fallback',()=>{
  const required=273883;
  assert.ok(candidate.representativeBytes<required);
  const found=roundtripCodeFallbackCandidates({},[candidate],[],state,new Set(),required);
  assert.equal(found.length,1);
  assert.equal(found[0].id,'pastegg-public');
  // This selection is only an attempt; real upload/read/byte equality
  // remains mandatory in shardvault-runtime, not replaced by cached proof.
  assert.match(runtime,/const roundtrip=await downloadFragment\(env,e,d\)/);
  assert.match(runtime,/if\(!byteArraysEqual\(roundtrip,shard\)\)throw new Error\('CODE_FRAGMENT_ROUNDTRIP_MISMATCH'\)/);
});

test('fallback still requires minimum retention and excludes used/quarantined endpoints',()=>{
  assert.equal(roundtripCodeFallbackCandidates({},[{...candidate,expectedRetentionDays:6}],[],state,new Set(),273883).length,0);
  assert.equal(roundtripCodeFallbackCandidates({},[candidate],[],state,new Set(['pastegg-public']),273883).length,0);
  assert.equal(roundtripCodeFallbackCandidates({},[candidate],[],{...state,cycle_quarantined_endpoint_ids:['pastegg-public']},new Set(),273883).length,0);
});

test('final-shard reservation happens before fallback and applies to validated and fresh candidates',()=>{
  assert.ok(runtime.includes('rankExternalCodeCandidates(env,[...validated,...extra,...codeCandidates,...activeCodeTargets],shard.length)'));
  assert.ok(runtime.includes('ranked=roundtripCodeFallbackCandidates('));
  assert.ok(runtime.includes('env,[...validated,...extra,...codeCandidates],activeCodeTargets,state,used,shard.length'));
  assert.match(runtime,/rankExternalCodeCandidates\([\s\S]*?\.filter\(eligible\);\s*if\(!ranked\.length\)/);
  assert.match(runtime,/\.filter\(eligible\);\s*if\(ranked\.length\)state\.candidate_roundtrip_fallback_used=true/);
  assert.equal(allowCodeEndpointForShard({id:'github-actions-code-mirror'},5,7),false);
  assert.equal(allowCodeEndpointForShard({id:'github-actions-code-mirror'},6,7),true);
});
