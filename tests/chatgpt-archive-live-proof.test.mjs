import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateChatGPTArchiveLiveProof, LIVE_PROOF_SQL } from '../scripts/prove-chatgpt-archive-live.mjs';

function payload(overrides={}) {
  return [{
    results:[{
      archived_conversations:2501,
      tracked_conversations:2501,
      complete_conversations:2501,
      partial_conversations:0,
      unknown_completeness:0,
      expected_messages:12500,
      underfilled_conversations:0,
      missing_expected_messages:0,
      coverage_present:1,
      deep_discovery_done:1,
      discovered_count:2503,
      reported_items:2503,
      done_count:2501,
      partial_count:0,
      failed_count:0,
      unavailable_count:2,
      deferred_count:0,
      queued_count:0,
      unresolved_recoverable:0,
      missing_done_from_archive:0,
      underfilled_done:0,
      archived_missing_from_inventory:0,
      collector_version:'0.6.3',
      manifest_sha256:'a'.repeat(64),
      captured_at:123,
      received_at:456,
      server_archive_complete:1,
      collector_inventory_confirmed:1,
      full_archive_confirmed:1,
      ...overrides,
    }]
  }];
}

test('live proof accepts a deep inventory beyond 2000 conversations only when every gate is closed', () => {
  const result=evaluateChatGPTArchiveLiveProof(payload());
  assert.equal(result.ok,true);
  assert.equal(result.code,'FULL_ARCHIVE_CONFIRMED');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.proof.archived_conversations,2501);
  assert.equal(result.proof.unavailable_count,2);
});

test('live proof fails closed when one archived conversation has no receipt', () => {
  const result=evaluateChatGPTArchiveLiveProof(payload({
    tracked_conversations:2500,
    unknown_completeness:1,
    server_archive_complete:0,
    full_archive_confirmed:0,
  }));
  assert.equal(result.ok,false);
  assert.ok(result.blockers.includes('MISSING_CONVERSATION_RECEIPTS'));
  assert.ok(result.blockers.includes('UNKNOWN_COMPLETENESS_REMAINS'));
});

test('live proof fails closed when stored messages are below the receipt expectation', () => {
  const result=evaluateChatGPTArchiveLiveProof(payload({
    underfilled_conversations:3,
    missing_expected_messages:7,
    server_archive_complete:0,
    full_archive_confirmed:0,
  }));
  assert.equal(result.ok,false);
  assert.ok(result.blockers.includes('STORED_MESSAGES_BELOW_EXPECTED'));
});

test('live proof fails closed when deep Collector inventory is incomplete or asymmetric', () => {
  const result=evaluateChatGPTArchiveLiveProof(payload({
    deep_discovery_done:0,
    discovered_count:2505,
    unresolved_recoverable:2,
    archived_missing_from_inventory:1,
    collector_inventory_confirmed:0,
    full_archive_confirmed:0,
  }));
  assert.equal(result.ok,false);
  assert.ok(result.blockers.includes('DEEP_DISCOVERY_NOT_DONE'));
  assert.ok(result.blockers.includes('DISCOVERED_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('RECOVERABLE_ITEMS_UNRESOLVED'));
  assert.ok(result.blockers.includes('ARCHIVED_ITEMS_MISSING_FROM_INVENTORY'));
});

test('live proof parser rejects malformed/empty D1 output', () => {
  const result=evaluateChatGPTArchiveLiveProof([{results:[]}]);
  assert.equal(result.ok,false);
  assert.equal(result.code,'CHATGPT_LIVE_PROOF_ROW_MISSING');
});

test('remote proof SQL is exhaustive and joins receipts, archive rows and Collector inventory', () => {
  assert.match(LIVE_PROOF_SQL,/GROUP BY conversation_id/);
  assert.match(LIVE_PROOF_SQL,/chatgpt_import\.expected_messages/);
  assert.match(LIVE_PROOF_SQL,/json_each\(coverage\.manifest_json,'\$\.items'\)/);
  assert.match(LIVE_PROOF_SQL,/archived_missing_from_inventory/);
  assert.match(LIVE_PROOF_SQL,/full_archive_confirmed/);
  assert.doesNotMatch(LIVE_PROOF_SQL,/LIMIT\s+2000/i);
});
