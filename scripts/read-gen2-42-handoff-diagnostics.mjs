import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Fixed read-only SQL over the canonical discovery ledger. Never export a
// fingerprint, job ID, request ID, free-text error, or the ledger itself.
export const GEN2_42_HANDOFF_DIAGNOSTIC_SQL = `SELECT
 CASE UPPER(COALESCE(json_extract(item.value,'$.handoff.status'),'')) 
  WHEN 'QUEUED' THEN 'QUEUED'
  WHEN 'COUNCIL_COMPLETE' THEN 'COUNCIL_COMPLETE'
  WHEN 'WAITING_TEACHER' THEN 'WAITING_TEACHER'
  WHEN 'TEACHER_APPROVED' THEN 'TEACHER_APPROVED'
  WHEN 'CLAIMED' THEN 'CLAIMED'
  WHEN 'READY_FOR_REVIEW' THEN 'READY_FOR_REVIEW'
  WHEN 'FAILED' THEN 'FAILED'
  WHEN 'REPAIR_REQUIRED' THEN 'REPAIR_REQUIRED'
  WHEN 'WAITING_DEPENDENCY' THEN 'WAITING_DEPENDENCY'
  WHEN 'CANCELLED' THEN 'CANCELLED'
  ELSE 'OTHER'
 END AS handoff_class,
 COUNT(*) AS entries,
 SUM(CASE WHEN LENGTH(TRIM(COALESCE(json_extract(item.value,'$.handoff.teacher_request_id'),''))) > 0 THEN 1 ELSE 0 END) AS with_teacher_request,
 SUM(CASE WHEN json_extract(item.value,'$.handoff.retryable') = 1 THEN 1 ELSE 0 END) AS retryable_entries,
 SUM(CASE WHEN UPPER(COALESCE(json_extract(item.value,'$.handoff.code'),'')) = 'TEACHER_REQUEST_STALE_SHA' THEN 1 ELSE 0 END) AS stale_sha_entries
 FROM capability_watch_state AS s,
 json_each(CASE WHEN json_valid(s.state_json) THEN s.state_json ELSE '{}' END,'$.items') AS item
 WHERE s.id='ecosystem-discoveries-canonical'
 AND json_type(item.value,'$.handoff')='object'
 AND COALESCE(json_extract(item.value,'$.handoff.closed'),0) <> 1
 GROUP BY handoff_class ORDER BY entries DESC LIMIT 12`;

const allowed=new Set(['QUEUED','COUNCIL_COMPLETE','WAITING_TEACHER','TEACHER_APPROVED','CLAIMED','READY_FOR_REVIEW','FAILED','REPAIR_REQUIRED','WAITING_DEPENDENCY','CANCELLED','OTHER']);
const safeCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=100000?value:null;
export function sanitizeGen242Handoffs(rows) {
  return {schema:'mel.gen2-42-readonly-handoff-diagnostics/v1',diagnostic_only:true,
    groups:(Array.isArray(rows)?rows:[]).slice(0,12).map(row=>({
      handoff_class:allowed.has(row?.handoff_class)?row.handoff_class:'OTHER',
      entries:safeCount(row?.entries),
      with_teacher_request:safeCount(row?.with_teacher_request),
      retryable_entries:safeCount(row?.retryable_entries),
      stale_sha_entries:safeCount(row?.stale_sha_entries),
    }))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const raw=JSON.parse(readFileSync(0,'utf8'));
  const result=Array.isArray(raw)?raw[0]:raw;
  if(result?.success!==true||!Array.isArray(result.results)) throw Error('GEN2_42_D1_READ_UNPROVEN');
  process.stdout.write(JSON.stringify(sanitizeGen242Handoffs(result.results),null,2)+'\n');
}
