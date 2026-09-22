import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const LIVE_PROOF_SQL = `
WITH archived AS (
  SELECT
    CASE WHEN conversation_id LIKE 'chatgpt:%' THEN substr(conversation_id,9) ELSE conversation_id END AS id,
    conversation_id,
    COUNT(*) AS stored_messages
  FROM archive_messages
  WHERE provenance='chatgpt_export'
  GROUP BY conversation_id
),
normalized AS (
  SELECT
    a.id,
    a.conversation_id,
    a.stored_messages,
    CASE
      WHEN json_valid(c.metadata)
       AND json_type(c.metadata,'$.chatgpt_import')='object'
      THEN 1 ELSE 0
    END AS has_receipt,
    CASE
      WHEN json_valid(c.metadata)
      THEN COALESCE(json_extract(c.metadata,'$.chatgpt_import.complete'),0)
      ELSE 0
    END AS receipt_complete,
    CASE
      WHEN json_valid(c.metadata)
      THEN COALESCE(json_extract(c.metadata,'$.chatgpt_import.expected_messages'),0)
      ELSE 0
    END AS expected_messages
  FROM archived a
  LEFT JOIN conversations c ON c.id=a.conversation_id
),
coverage AS (
  SELECT
    collector_version,
    deep_discovery_done,
    discovered_count,
    manifest_json,
    manifest_sha256,
    captured_at,
    received_at
  FROM chatgpt_collector_coverage
  WHERE id='latest'
  LIMIT 1
),
items AS (
  SELECT
    trim(COALESCE(json_extract(j.value,'$.id'),'')) AS id,
    upper(trim(COALESCE(json_extract(j.value,'$.status'),''))) AS status,
    MAX(0,CAST(COALESCE(json_extract(j.value,'$.messages'),0) AS INTEGER)) AS messages
  FROM coverage
  JOIN json_each(coverage.manifest_json,'$.items') j
  WHERE trim(COALESCE(json_extract(j.value,'$.id'),''))<>''
),
receipt_summary AS (
  SELECT
    COUNT(*) AS archived_conversations,
    COALESCE(SUM(has_receipt),0) AS tracked_conversations,
    COALESCE(SUM(CASE WHEN has_receipt=0 THEN 1 ELSE 0 END),0) AS unknown_completeness,
    COALESCE(SUM(CASE WHEN has_receipt=1 AND receipt_complete=1 AND stored_messages>=expected_messages THEN 1 ELSE 0 END),0) AS complete_conversations,
    COALESCE(SUM(CASE WHEN has_receipt=1 AND NOT(receipt_complete=1 AND stored_messages>=expected_messages) THEN 1 ELSE 0 END),0) AS partial_conversations,
    COALESCE(SUM(CASE WHEN has_receipt=1 THEN expected_messages ELSE 0 END),0) AS expected_messages,
    COALESCE(SUM(CASE WHEN has_receipt=1 AND stored_messages<expected_messages THEN 1 ELSE 0 END),0) AS underfilled_conversations,
    COALESCE(SUM(CASE WHEN has_receipt=1 AND stored_messages<expected_messages THEN expected_messages-stored_messages ELSE 0 END),0) AS missing_expected_messages
  FROM normalized
),
inventory_summary AS (
  SELECT
    (SELECT COUNT(*) FROM coverage) AS coverage_present,
    COALESCE((SELECT deep_discovery_done FROM coverage),0) AS deep_discovery_done,
    COALESCE((SELECT discovered_count FROM coverage),0) AS discovered_count,
    (SELECT COUNT(*) FROM items) AS reported_items,
    (SELECT COUNT(*) FROM items WHERE status='DONE') AS done_count,
    (SELECT COUNT(*) FROM items WHERE status='PARTIAL') AS partial_count,
    (SELECT COUNT(*) FROM items WHERE status='FAILED') AS failed_count,
    (SELECT COUNT(*) FROM items WHERE status='UNAVAILABLE') AS unavailable_count,
    (SELECT COUNT(*) FROM items WHERE status='DEFERRED') AS deferred_count,
    (SELECT COUNT(*) FROM items WHERE status='QUEUED') AS queued_count,
    (SELECT COUNT(*) FROM items WHERE status IN ('PARTIAL','FAILED','DEFERRED','QUEUED')) AS unresolved_recoverable,
    (SELECT COUNT(*) FROM items i LEFT JOIN archived a ON a.id=i.id WHERE i.status='DONE' AND a.id IS NULL) AS missing_done_from_archive,
    (SELECT COUNT(*) FROM items i JOIN archived a ON a.id=i.id WHERE i.status='DONE' AND a.stored_messages<i.messages) AS underfilled_done,
    (SELECT COUNT(*) FROM archived a LEFT JOIN items i ON i.id=a.id AND i.status='DONE' WHERE i.id IS NULL) AS archived_missing_from_inventory,
    COALESCE((SELECT collector_version FROM coverage),'') AS collector_version,
    COALESCE((SELECT manifest_sha256 FROM coverage),'') AS manifest_sha256,
    COALESCE((SELECT captured_at FROM coverage),0) AS captured_at,
    COALESCE((SELECT received_at FROM coverage),0) AS received_at
)
SELECT
  r.*,
  i.*,
  CASE
    WHEN r.archived_conversations>0
     AND r.tracked_conversations=r.archived_conversations
     AND r.complete_conversations=r.archived_conversations
     AND r.partial_conversations=0
     AND r.unknown_completeness=0
     AND r.underfilled_conversations=0
    THEN 1 ELSE 0
  END AS server_archive_complete,
  CASE
    WHEN i.coverage_present=1
     AND i.deep_discovery_done=1
     AND i.discovered_count=i.reported_items
     AND i.unresolved_recoverable=0
     AND i.missing_done_from_archive=0
     AND i.underfilled_done=0
     AND i.archived_missing_from_inventory=0
     AND r.archived_conversations=i.done_count
    THEN 1 ELSE 0
  END AS collector_inventory_confirmed,
  CASE
    WHEN r.archived_conversations>0
     AND r.tracked_conversations=r.archived_conversations
     AND r.complete_conversations=r.archived_conversations
     AND r.partial_conversations=0
     AND r.unknown_completeness=0
     AND r.underfilled_conversations=0
     AND i.coverage_present=1
     AND i.deep_discovery_done=1
     AND i.discovered_count=i.reported_items
     AND i.unresolved_recoverable=0
     AND i.missing_done_from_archive=0
     AND i.underfilled_done=0
     AND i.archived_missing_from_inventory=0
     AND r.archived_conversations=i.done_count
    THEN 1 ELSE 0
  END AS full_archive_confirmed
FROM receipt_summary r
CROSS JOIN inventory_summary i;
`;

function unwrapRows(payload) {
  const candidates = Array.isArray(payload) ? payload : [payload];
  for (const entry of candidates) {
    if (Array.isArray(entry?.results)) return entry.results;
    if (Array.isArray(entry?.result?.results)) return entry.result.results;
    if (Array.isArray(entry?.result)) {
      for (const nested of entry.result) {
        if (Array.isArray(nested?.results)) return nested.results;
      }
    }
  }
  return [];
}

function n(value) {
  const out = Number(value);
  return Number.isFinite(out) ? out : 0;
}

export function evaluateChatGPTArchiveLiveProof(payload) {
  const rows = unwrapRows(payload);
  if (rows.length !== 1) {
    return { ok:false, code:'CHATGPT_LIVE_PROOF_ROW_MISSING', raw_rows:rows.length };
  }
  const row = rows[0] || {};
  const proof = {
    archived_conversations:n(row.archived_conversations),
    tracked_conversations:n(row.tracked_conversations),
    complete_conversations:n(row.complete_conversations),
    partial_conversations:n(row.partial_conversations),
    unknown_completeness:n(row.unknown_completeness),
    expected_messages:n(row.expected_messages),
    underfilled_conversations:n(row.underfilled_conversations),
    missing_expected_messages:n(row.missing_expected_messages),
    coverage_present:n(row.coverage_present) === 1,
    deep_discovery_done:n(row.deep_discovery_done) === 1,
    discovered_count:n(row.discovered_count),
    reported_items:n(row.reported_items),
    done_count:n(row.done_count),
    unavailable_count:n(row.unavailable_count),
    unresolved_recoverable:n(row.unresolved_recoverable),
    missing_done_from_archive:n(row.missing_done_from_archive),
    underfilled_done:n(row.underfilled_done),
    archived_missing_from_inventory:n(row.archived_missing_from_inventory),
    collector_version:String(row.collector_version || ''),
    manifest_sha256:String(row.manifest_sha256 || ''),
    captured_at:n(row.captured_at),
    received_at:n(row.received_at),
    server_archive_complete:n(row.server_archive_complete) === 1,
    collector_inventory_confirmed:n(row.collector_inventory_confirmed) === 1,
    full_archive_confirmed:n(row.full_archive_confirmed) === 1,
  };
  const blockers = [];
  if (proof.archived_conversations <= 0) blockers.push('ARCHIVE_EMPTY');
  if (proof.tracked_conversations !== proof.archived_conversations) blockers.push('MISSING_CONVERSATION_RECEIPTS');
  if (proof.partial_conversations > 0) blockers.push('PARTIAL_CONVERSATIONS_REMAIN');
  if (proof.unknown_completeness > 0) blockers.push('UNKNOWN_COMPLETENESS_REMAINS');
  if (proof.underfilled_conversations > 0) blockers.push('STORED_MESSAGES_BELOW_EXPECTED');
  if (!proof.coverage_present) blockers.push('COLLECTOR_COVERAGE_MISSING');
  if (!proof.deep_discovery_done) blockers.push('DEEP_DISCOVERY_NOT_DONE');
  if (proof.discovered_count !== proof.reported_items) blockers.push('DISCOVERED_COUNT_MISMATCH');
  if (proof.unresolved_recoverable > 0) blockers.push('RECOVERABLE_ITEMS_UNRESOLVED');
  if (proof.missing_done_from_archive > 0) blockers.push('DONE_ITEMS_MISSING_FROM_ARCHIVE');
  if (proof.underfilled_done > 0) blockers.push('DONE_ITEMS_UNDERFILLED');
  if (proof.archived_missing_from_inventory > 0) blockers.push('ARCHIVED_ITEMS_MISSING_FROM_INVENTORY');
  if (proof.done_count !== proof.archived_conversations) blockers.push('DONE_ARCHIVE_COUNT_MISMATCH');
  return { ok:proof.full_archive_confirmed && blockers.length===0, code:proof.full_archive_confirmed ? 'FULL_ARCHIVE_CONFIRMED' : 'FULL_ARCHIVE_NOT_CONFIRMED', blockers, proof };
}

function arg(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : null;
}

if (import.meta.url === new URL('file://' + process.argv[1]).href) {
  const input = arg('--input');
  let payload;
  if (input) {
    payload = JSON.parse(fs.readFileSync(input,'utf8'));
  } else {
    const database = arg('--database') || process.env.MEL_D1_DATABASE || 'meliturgos-memory';
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const result = spawnSync(command, ['wrangler','d1','execute',database,'--remote','--json','--command',LIVE_PROOF_SQL], {
      encoding:'utf8',
      env:process.env,
      maxBuffer:10 * 1024 * 1024,
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout || 'wrangler d1 execute failed\n');
      process.exit(result.status || 1);
    }
    payload = JSON.parse(result.stdout);
  }

  const evaluated = evaluateChatGPTArchiveLiveProof(payload);
  console.log(JSON.stringify(evaluated,null,2));
  if (!evaluated.ok) process.exit(2);
}
