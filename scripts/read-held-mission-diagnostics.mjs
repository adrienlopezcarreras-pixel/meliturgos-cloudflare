import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Fixed SELECT only. Never export goals, file contents, prompts or raw results.
export const HELD_MISSION_SQL = `SELECT j.status, j.error,
 json_extract(j.result_json,'$.runtime_retry.attempts') AS runtime_attempts,
 json_extract(j.result_json,'$.autonomy_deferral.code') AS deferral_code,
 json_extract(j.result_json,'$.autonomy_deferral.attempts') AS deferral_attempts,
 json_extract(j.result_json,'$.implementation_planning_diagnostic.code') AS implementation_code,
 json_extract(j.result_json,'$.bridge_preparation_diagnostic.code') AS bridge_code,
 json_extract(j.result_json,'$.teacher_bridge.status') AS teacher_status,
 json_extract(j.result_json,'$.teacher_bridge.review.verdict') AS teacher_verdict,
 json_extract(j.result_json,'$.implementation_proposal.status') AS proposal_status,
 json_extract(j.result_json,'$.bridge_preparation.status') AS package_status,
 json_extract(j.result_json,'$.bridge_preparation.candidate_sha') AS original_base_sha,
 json_extract(j.result_json,'$.dev_bridge.status') AS bridge_status,
 json_extract(j.result_json,'$.dev_bridge.needs_repair') AS needs_repair,
 json_extract(j.result_json,'$.candidate_ci_failure.code') AS candidate_ci_code,
 CASE WHEN json_extract(j.result_json,'$.noop_review_recovery.schema') IS NOT NULL THEN 1 ELSE 0 END AS noop_recovered,
 json_extract(j.plan_json,'$.revision.reason') AS revision_code
 FROM dev_jobs j WHERE j.id=(SELECT json_extract(metadata_json,'$.repair.job_id')
 FROM dev_bridge_state WHERE bridge_id='mel-autonomy-control' AND json_valid(metadata_json) LIMIT 1) LIMIT 1`;

export function sanitizeHeldMission(rows) {
  const code = value => value == null ? null : /^[A-Z][A-Z0-9_:.-]{0,179}$/.test(String(value)) ? value : 'UNSTRUCTURED_VALUE_REDACTED';
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return { schema: 'mel.held-mission-diagnostics/v1', diagnostic_only: true,
    jobs: (Array.isArray(rows) ? rows : []).slice(0, 1).map(row => ({
      ...Object.fromEntries(['status','error','deferral_code','implementation_code','bridge_code','teacher_status',
        'teacher_verdict','proposal_status','package_status','bridge_status','candidate_ci_code','revision_code'].map(key => [key, code(row[key])])),
      runtime_attempts: count(row.runtime_attempts), deferral_attempts: count(row.deferral_attempts),
      original_base_sha: /^[a-f0-9]{40}$/.test(String(row.original_base_sha || '')) ? row.original_base_sha : null,
      noop_recovered: row.noop_recovered === 1, needs_repair: row.needs_repair === 1,
    })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raw = JSON.parse(readFileSync(0, 'utf8'));
  const result = Array.isArray(raw) ? raw[0] : raw;
  if (result?.success !== true || !Array.isArray(result.results)) throw Error('HELD_MISSION_READ_UNPROVEN');
  process.stdout.write(JSON.stringify(sanitizeHeldMission(result.results), null, 2) + '\n');
}
