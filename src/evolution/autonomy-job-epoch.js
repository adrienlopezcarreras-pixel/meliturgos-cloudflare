 // Owner recovery keeps the original creation time and journal. Only the
 // explicit, persisted owner receipt may admit that same job to a newer view.
 // MEL-MANIFEST-06: a cancelled job is never admitted, whatever its timestamps
 // or a resume receipt say; a reset keeps it in history only.
 const NEVER_RESUMABLE = new Set(['CANCELLED']);

 export function jobActivityTimestamp(job) {
   const created = Number(job?.created_at || 0);
   if (NEVER_RESUMABLE.has(String(job?.status || '').toUpperCase())) return created;
   const resume = job?.result_json?.owner_resume;
   if (resume?.source !== 'owner-request' || resume?.job_id !== job?.id || resume?.authorized_by !== 'owner'
       || !Number.isSafeInteger(resume?.activity_epoch) || resume.activity_epoch <= 0) return created;
   return Math.max(created, resume.activity_epoch);
 }

 /** True only for a non‑cancelled job whose activity belongs to the current epoch. */
 export function isJobInActivityEpoch(job, epoch = 0) {
   if (NEVER_RESUMABLE.has(String(job?.status || '').toUpperCase())) return false;
   return !epoch || jobActivityTimestamp(job) >= Number(epoch);
 }
