import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

export const MEM05_LIVE_SQL = `
WITH archived AS (
  SELECT
    COUNT(*) AS messages,
    COUNT(DISTINCT conversation_id) AS conversations
  FROM archive_messages
  WHERE provenance='chatgpt_export'
),
receipt_rows AS (
  SELECT
    a.conversation_id,
    COUNT(*) AS stored_messages,
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
  FROM archive_messages a
  LEFT JOIN conversations c ON c.id=a.conversation_id
  WHERE a.provenance='chatgpt_export'
  GROUP BY a.conversation_id
),
receipts AS (
  SELECT
    COUNT(*) AS archived_conversations,
    COALESCE(SUM(has_receipt),0) AS tracked_conversations,
    COALESCE(SUM(CASE WHEN has_receipt=1 AND receipt_complete=1 AND stored_messages>=expected_messages THEN 1 ELSE 0 END),0) AS complete_conversations,
    COALESCE(SUM(CASE WHEN has_receipt=0 THEN 1 ELSE 0 END),0) AS unknown_completeness,
    COALESCE(SUM(CASE WHEN has_receipt=1 AND NOT(receipt_complete=1 AND stored_messages>=expected_messages) THEN 1 ELSE 0 END),0) AS partial_conversations,
    COALESCE(SUM(CASE WHEN has_receipt=1 AND stored_messages<expected_messages THEN 1 ELSE 0 END),0) AS underfilled_conversations
  FROM receipt_rows
),
memory_sync AS (
  SELECT
    COALESCE(SUM(CASE
      WHEN trim(COALESCE(a.content,''))<>''
       AND lower(COALESCE(a.role,'')) IN ('user','assistant','system','tool')
       AND NOT EXISTS (
         SELECT 1 FROM memory_candidates m
         WHERE m.conversation_id=a.conversation_id AND m.message_id=a.id
       )
      THEN 1 ELSE 0 END),0) AS unsynced_messages,
    COALESCE(SUM(CASE
      WHEN trim(COALESCE(a.content,''))=''
        OR lower(COALESCE(a.role,'')) NOT IN ('user','assistant','system','tool')
      THEN 1 ELSE 0 END),0) AS ineligible_messages
  FROM archive_messages a
  WHERE a.provenance='chatgpt_export'
    AND (
      trim(COALESCE(a.content,''))=''
      OR lower(COALESCE(a.role,'')) NOT IN ('user','assistant','system','tool')
      OR NOT EXISTS (
        SELECT 1
        FROM memory_candidates m
        WHERE m.conversation_id=a.conversation_id AND m.message_id=a.id
      )
    )
),
attachment_rows AS (
  SELECT a.id AS message_id, j.value AS attachment
  FROM archive_messages a
  JOIN json_each(a.attachments_json) j
  WHERE a.provenance='chatgpt_export'
    AND a.attachments_json IS NOT NULL
    AND json_valid(a.attachments_json)
),
invalid_attachment_json AS (
  SELECT COUNT(*) AS count
  FROM archive_messages
  WHERE provenance='chatgpt_export'
    AND attachments_json IS NOT NULL
    AND NOT json_valid(attachments_json)
),
attachment_stats AS (
  SELECT
    COUNT(*) AS descriptors,
    COALESCE(SUM(CASE WHEN COALESCE(json_extract(attachment,'$.binary_content_available'),0)=1 THEN 1 ELSE 0 END),0) AS binary_available,
    COALESCE(SUM(CASE WHEN COALESCE(json_extract(attachment,'$.binary_content_indexed'),0)=1 THEN 1 ELSE 0 END),0) AS indexed_descriptors,
    COALESCE(SUM(CASE
      WHEN COALESCE(json_extract(attachment,'$.binary_content_available'),0)=0
       AND trim(COALESCE(json_extract(attachment,'$.binary_index_reason'),''))=''
      THEN 1 ELSE 0 END),0) AS source_bytes_unresolved,
    COALESCE(SUM(CASE
      WHEN COALESCE(json_extract(attachment,'$.binary_content_indexed'),0)=1
       AND trim(COALESCE(json_extract(attachment,'$.indexed_text'),''))=''
      THEN 1 ELSE 0 END),0) AS indexed_without_text,
    COALESCE(SUM(CASE
      WHEN COALESCE(json_extract(attachment,'$.binary_content_available'),0)=1
       AND COALESCE(json_extract(attachment,'$.binary_content_indexed'),0)=0
       AND (
         lower(COALESCE(json_extract(attachment,'$.mime_type'),'')) LIKE 'text/%'
         OR lower(COALESCE(json_extract(attachment,'$.mime_type'),'')) LIKE '%json%'
         OR lower(COALESCE(json_extract(attachment,'$.mime_type'),'')) LIKE '%xml%'
         OR lower(COALESCE(json_extract(attachment,'$.mime_type'),'')) LIKE '%csv%'
         OR lower(COALESCE(json_extract(attachment,'$.name'),'')) GLOB '*.txt'
         OR lower(COALESCE(json_extract(attachment,'$.name'),'')) GLOB '*.md'
         OR lower(COALESCE(json_extract(attachment,'$.name'),'')) GLOB '*.json'
         OR lower(COALESCE(json_extract(attachment,'$.name'),'')) GLOB '*.csv'
         OR lower(COALESCE(json_extract(attachment,'$.name'),'')) GLOB '*.xml'
         OR lower(COALESCE(json_extract(attachment,'$.name'),'')) GLOB '*.log'
       )
      THEN 1 ELSE 0 END),0) AS textual_available_unindexed,
    COALESCE(SUM(CASE
      WHEN COALESCE(json_extract(attachment,'$.binary_content_available'),0)=1
       AND COALESCE(json_extract(attachment,'$.binary_content_indexed'),0)=0
       AND json_extract(attachment,'$.binary_index_reason')='UNSUPPORTED_BINARY_TYPE'
      THEN 1 ELSE 0 END),0) AS unsupported_binary_with_bytes
  FROM attachment_rows
)
SELECT
  a.messages,
  a.conversations,
  r.tracked_conversations,
  r.complete_conversations,
  r.unknown_completeness,
  r.partial_conversations,
  r.underfilled_conversations,
  m.unsynced_messages,
  m.ineligible_messages,
  s.descriptors,
  s.binary_available,
  s.indexed_descriptors,
  s.source_bytes_unresolved,
  s.indexed_without_text,
  s.textual_available_unindexed,
  s.unsupported_binary_with_bytes,
  j.count AS invalid_attachment_json
FROM archived a
CROSS JOIN receipts r
CROSS JOIN memory_sync m
CROSS JOIN attachment_stats s
CROSS JOIN invalid_attachment_json j;
`;

function unwrapRows(payload) {
  const values=Array.isArray(payload)?payload:[payload];
  for(const entry of values){
    if(Array.isArray(entry?.results)) return entry.results;
    if(Array.isArray(entry?.result?.results)) return entry.result.results;
    if(Array.isArray(entry?.result)){
      for(const nested of entry.result) if(Array.isArray(nested?.results)) return nested.results;
    }
  }
  return [];
}

function n(value){const out=Number(value);return Number.isFinite(out)?out:0;}

export function evaluateMem05LiveProof(payload){
  const rows=unwrapRows(payload);
  if(rows.length!==1) return {ok:false,code:'MEM05_LIVE_PROOF_ROW_MISSING',blockers:['PROOF_ROW_MISSING'],raw_rows:rows.length};
  const row=rows[0]||{};
  const proof={
    messages:n(row.messages),
    conversations:n(row.conversations),
    tracked_conversations:n(row.tracked_conversations),
    complete_conversations:n(row.complete_conversations),
    unknown_completeness:n(row.unknown_completeness),
    partial_conversations:n(row.partial_conversations),
    underfilled_conversations:n(row.underfilled_conversations),
    unsynced_messages:n(row.unsynced_messages),
    ineligible_messages:n(row.ineligible_messages),
    attachment_descriptors:n(row.descriptors),
    binary_available:n(row.binary_available),
    indexed_descriptors:n(row.indexed_descriptors),
    source_bytes_unresolved:n(row.source_bytes_unresolved),
    indexed_without_text:n(row.indexed_without_text),
    textual_available_unindexed:n(row.textual_available_unindexed),
    unsupported_binary_with_bytes:n(row.unsupported_binary_with_bytes),
    invalid_attachment_json:n(row.invalid_attachment_json),
  };
  const blockers=[];
  if(proof.messages<=0||proof.conversations<=0) blockers.push('ARCHIVE_EMPTY');
  if(proof.tracked_conversations!==proof.conversations) blockers.push('MISSING_CONVERSATION_RECEIPTS');
  if(proof.complete_conversations!==proof.conversations) blockers.push('CONVERSATIONS_NOT_COMPLETE');
  if(proof.unknown_completeness>0) blockers.push('UNKNOWN_COMPLETENESS_REMAINS');
  if(proof.partial_conversations>0) blockers.push('PARTIAL_CONVERSATIONS_REMAIN');
  if(proof.underfilled_conversations>0) blockers.push('UNDERFILLED_CONVERSATIONS_REMAIN');
  if(proof.unsynced_messages>0) blockers.push('MEMORY_SYNC_INCOMPLETE');
  if(proof.invalid_attachment_json>0) blockers.push('INVALID_ATTACHMENT_JSON');
  if(proof.attachment_descriptors<=0) blockers.push('NO_ATTACHMENT_DESCRIPTORS_TO_CERTIFY');
  if(proof.source_bytes_unresolved>0) blockers.push('ATTACHMENT_SOURCE_BYTES_UNRESOLVED');
  if(proof.indexed_without_text>0) blockers.push('INDEXED_ATTACHMENT_TEXT_MISSING');
  if(proof.textual_available_unindexed>0) blockers.push('RECOVERED_TEXT_ATTACHMENT_NOT_INDEXED');
  return {
    ok:blockers.length===0,
    code:blockers.length===0?'MEM05_FULLY_CERTIFIED':'MEM05_NOT_CERTIFIED',
    blockers,
    proof,
  };
}

function arg(name){const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;}

if(import.meta.url===new URL('file://'+process.argv[1]).href){
  const input=arg('--input');
  let payload;
  if(input){
    payload=JSON.parse(fs.readFileSync(input,'utf8'));
  }else{
    const database=arg('--database')||process.env.MEL_D1_DATABASE||'meliturgos-memory';
    const command=process.platform==='win32'?'npx.cmd':'npx';
    const result=spawnSync(command,['wrangler','d1','execute',database,'--remote','--json','--command',MEM05_LIVE_SQL],{
      encoding:'utf8',
      env:process.env,
      maxBuffer:10*1024*1024,
    });
    if(result.status!==0){
      process.stderr.write(result.stderr||result.stdout||'wrangler d1 execute failed\n');
      process.exit(result.status||1);
    }
    payload=JSON.parse(result.stdout);
  }
  const evaluated=evaluateMem05LiveProof(payload);
  console.log(JSON.stringify(evaluated,null,2));
  if(!evaluated.ok) process.exit(2);
}
