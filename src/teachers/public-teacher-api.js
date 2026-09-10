import { D1DevJobRepository } from '../dev/d1-dev-job-repository.js';
import { listPendingRuntimeTeacherRequests, teacherBridgePublicView } from './runtime-teacher-bridge.js';

/**
 * Deliberately public, read-only and aggressively minimized so the external
 * ChatGPT Teacher can discover pending technical requests without receiving a
 * MEL secret. Full job state, council text, inspection contents and user data
 * remain behind authenticated/runtime channels.
 */
export async function maybeHandlePublicTeacherBridge(request, env) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.pathname !== '/api/teacher/pending' && url.pathname !== '/api/teacher/status') return null;

  const repository = new D1DevJobRepository(env.DB);
  const pending = teacherBridgePublicView(await listPendingRuntimeTeacherRequests(repository, { limit: 20 }));
  const headers = {
    'cache-control': 'no-store, max-age=0',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  };

  if (url.pathname === '/api/teacher/status') {
    return new Response(JSON.stringify({
      ok: true,
      channel: 'github-teacher-bridge',
      pending_count: pending.length,
      exposes_secrets: false,
      mutation_allowed: false,
    }), { status: 200, headers });
  }

  return new Response(JSON.stringify({
    ok: true,
    channel: 'github-teacher-bridge',
    pending,
    mutation_allowed: false,
  }), { status: 200, headers });
}
