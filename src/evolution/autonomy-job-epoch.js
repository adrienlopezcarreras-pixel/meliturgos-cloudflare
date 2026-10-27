// Owner recovery keeps the original creation time and journal. Only the
// explicit, persisted owner receipt may admit that same job to a newer view.
export function jobActivityTimestamp(job) {
  const created = Number(job?.created_at || 0);
  const resume = job?.result_json?.owner_resume;
  if (resume?.source !== 'owner-request' || resume?.job_id !== job?.id || resume?.authorized_by !== 'owner'
      || !Number.isSafeInteger(resume?.activity_epoch) || resume.activity_epoch <= 0) return created;
  return Math.max(created, resume.activity_epoch);
}
