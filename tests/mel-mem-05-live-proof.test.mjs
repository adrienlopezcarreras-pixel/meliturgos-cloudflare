import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMem05LiveProof, MEM05_LIVE_SQL } from '../scripts/prove-mel-mem-05-live.mjs';

test('MEM05 live proof requires complete archive, memory sync, and resolved attachment bytes',()=>{
  const result=evaluateMem05LiveProof([{results:[{
    messages:120,
    conversations:10,
    tracked_conversations:10,
    complete_conversations:10,
    unknown_completeness:0,
    partial_conversations:0,
    underfilled_conversations:0,
    unsynced_messages:0,
    descriptors:8,
    binary_available:8,
    indexed_descriptors:5,
    source_bytes_unresolved:0,
    indexed_without_text:0,
    textual_available_unindexed:0,
    unsupported_binary_with_bytes:3,
    invalid_attachment_json:0,
  }]}]);
  assert.equal(result.ok,true);
  assert.equal(result.code,'MEM05_FULLY_CERTIFIED');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.proof.unsupported_binary_with_bytes,3);
});

test('MEM05 live proof fails when source bytes are still unknown',()=>{
  const result=evaluateMem05LiveProof([{results:[{
    messages:120,
    conversations:10,
    tracked_conversations:10,
    complete_conversations:10,
    unknown_completeness:0,
    partial_conversations:0,
    underfilled_conversations:0,
    unsynced_messages:0,
    descriptors:8,
    binary_available:3,
    indexed_descriptors:2,
    source_bytes_unresolved:5,
    indexed_without_text:0,
    textual_available_unindexed:1,
    unsupported_binary_with_bytes:1,
    invalid_attachment_json:0,
  }]}]);
  assert.equal(result.ok,false);
  assert.ok(result.blockers.includes('ATTACHMENT_SOURCE_BYTES_UNRESOLVED'));
  assert.ok(result.blockers.includes('RECOVERED_TEXT_ATTACHMENT_NOT_INDEXED'));
});

test('MEM05 proof SQL reads only archive/memory/attachment state and never mutates D1',()=>{
  assert.match(MEM05_LIVE_SQL,/FROM archive_messages/);
  assert.match(MEM05_LIVE_SQL,/memory_candidates/);
  assert.match(MEM05_LIVE_SQL,/json_each\(a\.attachments_json\)/);
  assert.doesNotMatch(MEM05_LIVE_SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
});
