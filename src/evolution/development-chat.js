import { requireAuth } from '../core/security.js';
import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { isAutonomousDevelopmentCommand } from './chat-intent.js';
import { MAX_CHAT_INPUT_CHARS } from '../core/limits.js';

/**
 * Convert only explicit requests to develop MEL itself into Dev-Bridge jobs.
 * Candidate edits and tests may happen autonomously; commit/deploy remain gated.
 */
export async function maybeQueueAutonomousDevelopment(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat' || request.method !== 'POST') return null;
  if (!(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return null;

  let body;
  try { body = await request.clone().json(); }
  catch { return null; }

  const text = String(body?.text || '').trim();
  if (!text || !isAutonomousDevelopmentCommand(text)) return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (text.length > MAX_CHAT_INPUT_CHARS) {
    return Response.json({
      ok: false,
      error: `Commande de développement trop longue (${MAX_CHAT_INPUT_CHARS.toLocaleString('fr-FR')} caractères maximum).`,
      code: 'MESSAGE_TOO_LONG',
    }, { status: 413, headers: { 'cache-control': 'no-store' } });
  }
  if (!env?.DB) {
    return Response.json({ ok: false, error: 'La file de développement D1 est indisponible.', code: 'DB_BINDING_MISSING' }, { status: 503 });
  }

  const repository = new D1DevJobRepository(env.DB);
  const job = await repository.create({
    requested_by: 'mel-chat',
    goal: text,
    optional_context: {
      origin: 'chat',
      conversation_id: String(body?.conversation_id || '').slice(0, 200) || null,
      device_id: String(body?.device_id || '').slice(0, 200) || null,
      policy: 'AUTONOMOUS_CANDIDATE_HUMAN_RELEASE_GATE',
      requested_at: Date.now(),
    },
  });

  return Response.json({
    ok: true,
    text: `Développement autonome lancé. Job ${job.job_id} en file Mentor/Dev Bridge. MEL peut analyser, générer une candidate, tester et réparer automatiquement ; le commit et le déploiement restent soumis à ta validation.`,
    development_job: true,
    job_id: job.job_id,
    status: job.status,
    next: 'mentor-dev-bridge',
    release_requires_approval: true,
  }, { status: 202, headers: { 'cache-control': 'no-store' } });
}
