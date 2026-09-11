import { createMentorEngine, mentorPolicy } from '../learning/mentor-engine.js';
import { requireValue } from '../core/contracts.js';

export const mentorRuntimeCapabilities = Object.freeze([
  'mentor.propose',
  'mentor.repair',
  'mentor.learn',
]);

export { mentorPolicy };

export async function maybeHandleMentorRuntime({ request, env, repo, path, body }) {
  if (path === '/api/dev-bridge/mentor' && request.method === 'POST') {
    requireValue(typeof body.job_id === 'string' && body.job_id, 'JOB_ID_REQUIRED');
    const job = await repo.get(body.job_id);
    requireValue(job, 'JOB_NOT_FOUND', 404);
    const engine = createMentorEngine(env);
    const proposal = await engine.propose({
      env,
      jobId: job.id,
      goal: String(body.goal || job.goal || ''),
      inspectedFiles: body.inspected_files || [],
      previousAttempts: body.previous_attempts || [],
      mode: body.mode === 'repair' ? 'repair' : 'implement',
    });
    return Response.json(proposal);
  }

  if (path === '/api/dev-bridge/mentor/outcome' && request.method === 'POST') {
    requireValue(typeof body.job_id === 'string' && body.job_id, 'JOB_ID_REQUIRED');
    const job = await repo.get(body.job_id);
    requireValue(job, 'JOB_NOT_FOUND', 404);
    const engine = createMentorEngine(env);
    const memory = await engine.recordOutcome({
      jobId: job.id,
      goal: job.goal || '',
      outcome: body.outcome || 'UNKNOWN',
      lesson: body.lesson || '',
      evidence: body.evidence || null,
      score: body.score || 0,
      tags: Array.isArray(body.tags) ? body.tags : [],
    });
    return Response.json({ ok: true, memory });
  }

  return null;
}
