import app from './learning-entry.js';
import { requireAuth } from './core/security.js';
import { migrate } from './persistence/migrations.js';
import { createConversationService } from './conversations/conversation-service.js';
import { buildActivitySnapshot } from './activity/activity-snapshot.js';
import { getEcosystemCapabilityWatchStatus, runEcosystemCapabilityWatch } from './evaluation/capability-watch-runtime.js';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function safeRows(db, sql, limit) {
  try {
    const result = await db.prepare(sql).bind(limit).all();
    return result?.results || [];
  } catch {
    return [];
  }
}

function deployedBuild() {
  const sha = typeof MEL_DEPLOYED_GIT_SHA !== 'undefined' ? String(MEL_DEPLOYED_GIT_SHA) : null;
  const branch = typeof MEL_DEPLOYED_GIT_BRANCH !== 'undefined' ? String(MEL_DEPLOYED_GIT_BRANCH) : null;
  if (!sha && !branch) return null;
  return {
    sha,
    branch,
    worker: 'meliturgos',
    source: 'wrangler-build-define',
    explanation: 'Version réellement injectée au build Cloudflare ; aucune progression ou date n’est inventée.',
  };
}

async function activityResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    await migrate(env.DB);
    const [jobs, audits, lessons, backups] = await Promise.all([
      safeRows(env.DB, 'SELECT * FROM dev_jobs ORDER BY updated_at DESC LIMIT ?', 50),
      safeRows(env.DB, 'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?', 80),
      safeRows(env.DB, 'SELECT * FROM mentor_lessons ORDER BY created_at DESC LIMIT ?', 30),
      safeRows(env.DB, 'SELECT * FROM backup_objects ORDER BY created_at DESC LIMIT ?', 30),
    ]);
    return json({ ok: true, ...buildActivitySnapshot({ jobs, audits, lessons, backups, deployment: deployedBuild(), limit: 100 }) });
  } catch (error) {
    return json({ ok: false, error: 'ACTIVITY_UNAVAILABLE', detail: String(error?.message || 'unknown').slice(0, 180) }, 503);
  }
}

async function capabilityWatchResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    return json(await getEcosystemCapabilityWatchStatus(env));
  } catch (error) {
    return json({
      ok: false,
      error: 'CAPABILITY_WATCH_UNAVAILABLE',
      detail: String(error?.code || error?.message || 'unknown').slice(0, 180),
    }, 503);
  }
}

async function capabilityWatchRunResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  let body = {};
  try { body = await request.clone().json(); } catch {}
  const force = body?.force === true;
  try {
    const build = deployedBuild();
    const result = await runEcosystemCapabilityWatch(env, {
      force,
      sourceSha: build?.sha || null,
    });
    return json({ ok: true, manual: true, forced: force, result });
  } catch (error) {
    return json({
      ok: false,
      error: 'CAPABILITY_WATCH_RUN_FAILED',
      detail: String(error?.code || error?.message || 'unknown').slice(0, 180),
    }, 503);
  }
}

async function latestConversationResponse(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const service = createConversationService(env);
    const rows = await service.list({ owner: env.MELITURGOS_USER || '' });
    const active = rows.filter((row) => String(row?.status || 'active').toLowerCase() !== 'archived');
    const latest = active[0] || rows[0] || null;
    if (!latest?.id) return json({ ok: true, conversation: null, messages: [], source: 'global-archive' });
    const messages = await service.getMessages(latest.id, { limit: 1000 });
    return json({
      ok: true,
      conversation: {
        id: latest.id,
        title: latest.title,
        status: latest.status,
        created_at: latest.created_at,
        updated_at: latest.updated_at,
      },
      messages: messages.slice(-80),
      source: 'global-archive',
    });
  } catch (error) {
    return json({ ok: false, error: 'LATEST_CONVERSATION_UNAVAILABLE', detail: String(error?.message || 'unknown').slice(0, 180) }, 503);
  }
}

export async function enhanceOwnerInterface(response) {
  // UI ownership lives in the canonical page and the final release/visual layer.
  // This entry keeps API routes only and must not inject a competing DOM runtime.
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/api/mel/activity') return activityResponse(request, env);
    if (request.method === 'GET' && url.pathname === '/api/mel/capability-watch') return capabilityWatchResponse(request, env);
    if (request.method === 'POST' && url.pathname === '/api/mel/capability-watch/run') return capabilityWatchRunResponse(request, env);
    if (request.method === 'GET' && url.pathname === '/api/mel/conversations/latest') return latestConversationResponse(request, env);
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return enhanceOwnerInterface(response, url.pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
