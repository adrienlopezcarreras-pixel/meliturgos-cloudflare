import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMem05LiveProof, MEM05_LIVE_SQL } from '../scripts/prove-mel-mem-05-live.mjs';

test('MEM05 live proof certifies complete indexing of the source actually available',()=>{
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
  assert.equal(result.code,'MEM05_AVAILABLE_SOURCE_CERTIFIED');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.proof.unsupported_binary_with_bytes,3);
});

test('MEM05 distinguishes missing source bytes from a real indexing defect',()=>{
  const sourceLimited=evaluateMem05LiveProof([{results:[{
    messages:120,
    conversations:10,
    tracked_conversations:9,
    complete_conversations:8,
    unknown_completeness:1,
    partial_conversations:2,
    underfilled_conversations:1,
    unsynced_messages:0,
    descriptors:8,
    binary_available:3,
    indexed_descriptors:2,
    source_bytes_unresolved:5,
    indexed_without_text:0,
    textual_available_unindexed:0,
    unsupported_binary_with_bytes:1,
    invalid_attachment_json:0,
  }]}]);
  assert.equal(sourceLimited.ok,true);
  assert.ok(sourceLimited.source_limitations.includes('ATTACHMENT_BYTES_NOT_PRESENT_IN_SOURCE'));
  assert.ok(sourceLimited.source_limitations.includes('SOURCE_PARTIAL_CONVERSATIONS'));

  const indexingDefect=evaluateMem05LiveProof([{results:[{
    messages:120,
    conversations:10,
    tracked_conversations:10,
    complete_conversations:10,
    unknown_completeness:0,
    partial_conversations:0,
    underfilled_conversations:0,
    unsynced_messages:1,
    descriptors:8,
    binary_available:3,
    indexed_descriptors:2,
    source_bytes_unresolved:5,
    indexed_without_text:0,
    textual_available_unindexed:1,
    unsupported_binary_with_bytes:1,
    invalid_attachment_json:0,
  }]}]);
  assert.equal(indexingDefect.ok,false);
  assert.ok(indexingDefect.blockers.includes('MEMORY_SYNC_INCOMPLETE'));
  assert.ok(indexingDefect.blockers.includes('RECOVERED_TEXT_ATTACHMENT_NOT_INDEXED'));
});

test('MEM05 proof SQL reads only archive/memory/attachment state and never mutates D1',()=>{
  assert.match(MEM05_LIVE_SQL,/FROM archive_messages/);
  assert.match(MEM05_LIVE_SQL,/memory_candidates/);
  assert.match(MEM05_LIVE_SQL,/json_each\(a\.attachments_json\)/);
  assert.doesNotMatch(MEM05_LIVE_SQL,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
});
