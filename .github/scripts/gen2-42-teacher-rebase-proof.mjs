import { readFile, writeFile, appendFile } from 'node:fs/promises';

const SHA40 = /^[0-9a-f]{40}$/i;
const tick = JSON.parse(await readFile('gen2-42-autonomy-tick.raw.json', 'utf8'));
const pendingPayload = JSON.parse(await readFile('gen2-42-teacher-pending.raw.json', 'utf8'));
const tickValue = tick && typeof tick.tick === 'object' && tick.tick ? tick.tick : tick;

if (!tickValue || typeof tickValue !== 'object' || Array.isArray(tickValue)) throw new Error('AUTONOMY_TICK_INVALID_RESPONSE');
if (tickValue.ok === false) throw new Error('AUTONOMY_TICK_FAILED:' + String(tickValue.error || tickValue.runtime_error || tickValue.status || 'UNKNOWN'));

const pending = pendingPayload && Array.isArray(pendingPayload.pending) ? pendingPayload.pending : null;
if (!pending) throw new Error('TEACHER_PENDING_INVALID_RESPONSE');

const canonical = pending.flatMap((row) => {
  if (!row || typeof row !== 'object') return [];
  const candidate = row.candidate && typeof row.candidate === 'object' ? row.candidate : {};
  const branch = String(candidate.branch || '');
  const sha = String(row.target_sha || candidate.sha || '');
  if (branch !== 'candidate/mel-clean-autonomy' || !SHA40.test(sha)) return [];
  return [{
    request_id: row.request_id || null,
    job_id: row.job_id || null,
    target_sha: sha,
    candidate_branch: branch,
    stage: row.stage || null,
    roadmap_id: row.provenance && typeof row.provenance === 'object' ? (row.provenance.roadmap_id || null) : null,
  }];
});
if (!canonical.length) throw new Error('NO_CANONICAL_TEACHER_HANDOFF_AFTER_TICK');

const reconciliation = tickValue.reconciliation && typeof tickValue.reconciliation === 'object' ? tickValue.reconciliation : {};
const job = tickValue.job && typeof tickValue.job === 'object' ? tickValue.job : {};
const teacher = tickValue.teacher && typeof tickValue.teacher === 'object' ? tickValue.teacher : {};

const proof = {
  schema: 'mel.gen2-42-teacher-rebase/v1',
  workflow_sha: process.env.GITHUB_SHA || null,
  tick: {
    status: tickValue.status || null,
    ok: tickValue.ok !== false,
    job: { id: job.id || null, status: job.status || null, roadmap_id: job.roadmap_id || null },
    teacher: { status: teacher.status || null, request_id: teacher.request_id || null },
    reconciliation: {
      stale: (Array.isArray(reconciliation.stale) ? reconciliation.stale : []).slice(0, 20).map((row) => ({
        request_id: row?.request_id || null,
        job_id: row?.job_id || null,
        previous_target_sha: row?.previous_target_sha || null,
        current_candidate_sha: row?.current_candidate_sha || null,
      })),
      applied: (Array.isArray(reconciliation.applied) ? reconciliation.applied : []).slice(0, 20).map((row) => ({
        request_id: row?.request_id || null,
        job_id: row?.job_id || null,
        status: row?.status || null,
        verdict: row?.verdict || null,
        target_sha: row?.target_sha || null,
      })),
    },
  },
  canonical_pending_count: canonical.length,
  pending: canonical.slice(0, 20),
  constraints: {
    preview_only: true,
    candidate_only: true,
    production_deploy_allowed: false,
    goal_content_exposed: false,
    council_content_exposed: false,
  },
};

await writeFile('gen2-42-teacher-rebase.json', JSON.stringify(proof, null, 2) + '\n', 'utf8');
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '### GEN2-42 canonical Teacher rebase',
    '',
    '- Tick status: ' + String(proof.tick.status),
    '- Canonical pending Teacher requests: ' + String(canonical.length),
    ...canonical.slice(0, 5).map((row) => '- ' + row.request_id + ' · ' + row.target_sha + ' · ' + row.stage),
    '',
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), 'utf8');
}
console.log(JSON.stringify({ tick_status: proof.tick.status, canonical_pending_count: canonical.length, pending: canonical.slice(0, 5) }, null, 2));
