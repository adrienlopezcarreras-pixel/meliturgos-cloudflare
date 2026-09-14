import { mirrorRuntimeTeacherRequestToGitHub } from './github-request-mirror.js';

function isOwnerChat(job) {
  return String(job?.requested_by || '').toLowerCase().startsWith('owner-chat');
}

export async function mirrorOwnerChatTeacherRequestToGitHub({ env = {}, job, state, fetchImpl = fetch } = {}) {
  if (!job || !isOwnerChat(job)) return { status: 'SKIPPED_NOT_OWNER_CHAT' };
  if (String(job.status || '').toUpperCase() !== 'WAITING_TEACHER' || state?.status !== 'WAITING_TEACHER') {
    return { status: 'SKIPPED_NOT_WAITING_TEACHER' };
  }

  // The base transport only accepts internally generated mel-autonomy jobs.
  // Owner-chat work has already passed the same Council + candidate inspection
  // gate before reaching WAITING_TEACHER, so normalize only the transport view.
  // The persisted job/requester is never rewritten.
  const transportJob = { ...job, requested_by: 'mel-autonomy' };
  const mirrored = await mirrorRuntimeTeacherRequestToGitHub({
    env,
    job: transportJob,
    state,
    fetchImpl,
  });
  return {
    ...mirrored,
    owner_chat_transport: true,
    original_requested_by: job.requested_by,
  };
}

export async function mirrorAllWaitingOwnerChatTeachers({ env = {}, repository, fetchImpl = fetch, limit = 50 } = {}) {
  if (!repository || typeof repository.list !== 'function') {
    throw Object.assign(new Error('OWNER_CHAT_TEACHER_REPOSITORY_REQUIRED'), { code: 'OWNER_CHAT_TEACHER_REPOSITORY_REQUIRED' });
  }
  const jobs = await repository.list();
  const waiting = jobs.filter((job) =>
    isOwnerChat(job)
    && String(job.status || '').toUpperCase() === 'WAITING_TEACHER'
    && job?.result_json?.teacher_bridge?.status === 'WAITING_TEACHER'
  ).slice(0, Math.max(1, Math.min(100, Number(limit) || 50)));

  const mirrored = [];
  const failed = [];
  for (const job of waiting) {
    try {
      const result = await mirrorOwnerChatTeacherRequestToGitHub({
        env,
        job,
        state: job.result_json.teacher_bridge,
        fetchImpl,
      });
      mirrored.push({ job_id: job.id, request_id: job.result_json.teacher_bridge?.request?.request_id || null, status: result.status, path: result.path || null });
    } catch (error) {
      failed.push({ job_id: job.id, code: error?.code || error?.message || 'OWNER_CHAT_TEACHER_MIRROR_FAILED' });
    }
  }
  return { attempted: waiting.length, mirrored, failed };
}
