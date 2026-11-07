import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROTATABLE_PROVIDER_EXHAUSTION_SQL } from '../src/evolution/provider-exhaustion-rotation.js';

// Fixed bounded SELECT. Never fetch job goals, file bodies, provider responses,
// raw result_json or the context string; only export identifier/status scalars and bounded validator codes.
export const ACTIVE_MISSION_DIAGNOSTIC_SQL = `SELECT status,
 json_extract(optional_context,'$.roadmap_id') AS roadmap_id,
 json_extract(optional_context,'$.work_mode') AS work_mode,
 json_extract(result_json,'$.autonomy_deferral.code') AS deferral_code,
 json_extract(result_json,'$.autonomy_deferral.phase') AS phase,
 json_extract(result_json,'$.autonomy_deferral.attempts') AS attempts,
 json_extract(result_json,'$.autonomy_deferral.max_attempts') AS max_attempts,
 json_extract(result_json,'$.autonomy_deferral.exhausted') AS exhausted,
 json_extract(result_json,'$.autonomy_deferral.retry_after') AS retry_after,
 json_type(result_json,'$.autonomy_deferral.context')='text' AS context_present,
 json_extract(result_json,'$.autonomy_deferral.context')=json_array(candidate_branch,
   json_extract(result_json,'$.teacher_bridge.review.target_sha'),
   json_extract(result_json,'$.teacher_bridge.review.request_id'),
   json_extract(result_json,'$.implementation_proposal.candidate_sha'),
   json_extract(result_json,'$.implementation_proposal.teacher_request_id')) AS context_matches,
 CASE WHEN ${ROTATABLE_PROVIDER_EXHAUSTION_SQL} THEN 1 ELSE 0 END AS admission_rotatable,
 json_extract(result_json,'$.teacher_bridge.status') AS teacher_status,
 json_extract(result_json,'$.dev_bridge.status') AS bridge_status,
 json_extract(result_json,'$.implementation_proposal.status') AS proposal_status,
 json_extract(result_json,'$.bridge_preparation.status') AS package_status,
 (SELECT json_group_array(json_object('code',json_extract(value,'$.code'),'stage',json_extract(value,'$.stage')))
  FROM (SELECT value FROM json_each(dev_jobs.result_json,'$.bridge_preparation_diagnostic.mentor_failure_codes')
        WHERE json_valid(value) LIMIT 8)) AS mentor_failures,
 json_extract(result_json,'$.autonomy_queue_pass.passive') AS passive_queue,
 json_extract(result_json,'$.autonomy_queue_pass.round') AS queue_round
 FROM dev_jobs WHERE requested_by='mel-autonomy'
 AND status IN ('QUEUED','PLANNING','CLAIMED','TEACHER_APPROVED','WAITING_TEACHER',
   'COUNCIL_COMPLETE','READY_FOR_REVIEW','COMMITTED','WAITING_DEPENDENCY','REPAIR_REQUIRED')
 ORDER BY CASE WHEN status IN ('CLAIMED','READY_FOR_REVIEW','COMMITTED') THEN 0
   WHEN status='TEACHER_APPROVED' THEN 1 ELSE 2 END, created_at DESC LIMIT 10`;

export function sanitizeActiveMissions(rows) {
  const token = value => value == null ? null : /^[A-Z][A-Z0-9_:.-]{0,99}$/.test(String(value)) ? value : 'UNSTRUCTURED_VALUE_REDACTED';
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const failures = value => {
    let rows; try { rows = typeof value === 'string' ? JSON.parse(value) : value; } catch { rows = []; }
    return (Array.isArray(rows) ? rows : []).slice(0, 8).map(row => ({
      code: /^MENTOR_[A-Z0-9_]{1,75}$/.test(String(row?.code || '')) ? row.code : 'OTHER_FAILURE',
      stage: /^(initial|repair|validation|provider)$/.test(String(row?.stage || '')) ? row.stage : 'unknown',
    }));
  };
  return { schema: 'mel.active-mission-diagnostics/v1', diagnostic_only: true,
    jobs: (Array.isArray(rows) ? rows : []).slice(0, 10).map(row => ({
      roadmap_id: /^(?:ROADMAP-PROOF-)?(?:GEN2|MEL)-[A-Z0-9-]{1,70}$/.test(String(row.roadmap_id || '')) ? row.roadmap_id : null,
      ...Object.fromEntries(['status','work_mode','deferral_code','teacher_status','bridge_status','proposal_status','package_status'].map(key => [key, token(row[key])])),
      mentor_failures: failures(row.mentor_failures),
      phase: /^[a-z_]{1,30}$/.test(String(row.phase || '')) ? row.phase : null,
      ...Object.fromEntries(['attempts','max_attempts','retry_after','queue_round'].map(key => [key, count(row[key])])),
      ...Object.fromEntries(['exhausted','context_present','context_matches','admission_rotatable','passive_queue'].map(key => [key, row[key] === 1])),
    })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raw = JSON.parse(readFileSync(0, 'utf8'));
  const result = Array.isArray(raw) ? raw[0] : raw;
  if (result?.success !== true || !Array.isArray(result.results)) throw Error('ACTIVE_MISSION_READ_UNPROVEN');
  process.stdout.write(JSON.stringify(sanitizeActiveMissions(result.results), null, 2) + '\n');
}
