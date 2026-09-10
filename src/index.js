// Canonical Worker entrypoint. worker.js remains only for compatibility routes.
import router from "./router.js";
import { requireAuth } from "./core/security.js";
import { setDefaultCapabilityEnvironment } from "./capabilities/default-bus.js";
import { importChatGPTArchive } from "./persistence/chatgpt-archive-importer.js";
import { runAugmentioStateOfPlay } from "./teachers/augmentio-council.js";
import { prepareDevelopmentRequest } from "./evolution/development-preflight.js";
import { injectEvolutionPreflightCapability } from "./evolution/chat-intent.js";
import { getSystemReadiness } from "./diagnostics/system-readiness.js";
import { handleNativeChat } from "./api/native-chat.js";
import { maybeHandlePublicTeacherBridge } from "./teachers/public-teacher-api.js";
import { runAutonomyRuntimeTick } from "./evolution/autonomy-runtime.js";
import { maybeHandleAutonomyApi } from "./evolution/autonomy-api.js";

let lastSafeWorkJob = null;

function isArchivePayload(value) {
  if (Array.isArray(value)) return value.some(x => x && (x.mapping || x.messages || x.conversation_id || x.id));
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value.conversations) || Array.isArray(value.items)) return true;
  return Boolean(value.mapping || value.messages);
}

async function readJsonObject(request) {
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    throw Object.assign(new Error('JSON_REQUIRED'), { code: 'JSON_REQUIRED', status: 415 });
  }
  try {
    const body = await request.clone().json();
    if (!body || typeof body !== 'object') throw new Error('not-object');
    return body;
  } catch {
    throw Object.assign(new Error('INVALID_JSON'), { code: 'INVALID_JSON', status: 400 });
  }
}

function apiError(error, fallback = 'INTERNAL_ERROR') {
  return Response.json(
    { ok: false, error: String(error?.message || fallback), code: error?.code || fallback },
    { status: Number(error?.status) || 500, headers: { 'cache-control': 'no-store' } }
  );
}

async function safeCount(db, table) {
  if (!db) return 0;
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first();
    return Number(row?.count || 0);
  } catch { return 0; }
}

async function safeRows(db, table, limit = 10000) {
  if (!db) return [];
  try {
    const rows = await db.prepare(`SELECT * FROM ${table} LIMIT ?`).bind(Math.max(1, Math.min(25000, Number(limit) || 10000))).all();
    return rows?.results || [];
  } catch { return []; }
}

async function maybeHandleMemoryCompatibility(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || (url.pathname !== '/api/memory/status' && url.pathname !== '/api/export')) return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  if (url.pathname === '/api/memory/status') {
    const [memoryCount, archiveCount, conversationCount] = await Promise.all([
      safeCount(env.DB, 'memories'),
      safeCount(env.DB, 'archive_messages'),
      safeCount(env.DB, 'conversations')
    ]);
    return Response.json({
      ok: true,
      status: env.DB ? 'ONLINE' : 'UNAVAILABLE',
      db_bound: Boolean(env.DB),
      memory_count: memoryCount,
      archive_count: archiveCount,
      conversation_count: conversationCount,
      portable: true,
      provenance: true
    }, { headers: { 'cache-control': 'no-store' } });
  }

  const [memories, archiveMessages, conversations] = await Promise.all([
    safeRows(env.DB, 'memories'),
    safeRows(env.DB, 'archive_messages'),
    safeRows(env.DB, 'conversations')
  ]);
  const payload = {
    format: 'meliturgos-memory-export',
    version: 1,
    exported_at: new Date().toISOString(),
    owner: env.MELITURGOS_USER || '',
    memories,
    conversations,
    archive_messages: archiveMessages
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="meliturgos-memory-${new Date().toISOString().slice(0,10)}.json"`,
      'cache-control': 'no-store'
    }
  });
}

async function maybeHandleSafeWork(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/dev-bridge/')) return null;
  if (url.pathname !== '/api/dev-bridge/health' && url.pathname !== '/api/dev-bridge/jobs') return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  if (request.method === 'GET' && url.pathname === '/api/dev-bridge/health') {
    return Response.json({
      ok: true,
      available: true,
      status: 'ONLINE',
      mode: 'preflight-only',
      protected_write_bridge: true,
      rule: 'AI_COUNCIL_BEFORE_CODE'
    }, { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method === 'GET' && url.pathname === '/api/dev-bridge/jobs') {
    return Response.json({ ok: true, jobs: lastSafeWorkJob ? [lastSafeWorkJob] : [], last_job: lastSafeWorkJob }, { headers: { 'cache-control': 'no-store' } });
  }

  if (request.method === 'POST' && url.pathname === '/api/dev-bridge/jobs') {
    try {
      const body = await readJsonObject(request);
      const mode = String(body.mode || 'prepare').toLowerCase();
      if (mode !== 'prepare' && mode !== 'preflight') return null;
      const goal = String(body.goal || body.objective || body.prompt || body.description || '').trim();
      if (!goal) return Response.json({ ok: false, error: 'GOAL_REQUIRED', code: 'GOAL_REQUIRED' }, { status: 400 });
      const preflight = await prepareDevelopmentRequest({
        env,
        goal,
        context: { ...(body.context && typeof body.context === 'object' ? body.context : {}), origin: 'work-ui', rule: 'AI_COUNCIL_BEFORE_CODE' },
        minResponses: Math.max(2, Math.min(12, Number(body.minResponses) || 2))
      });
      lastSafeWorkJob = {
        id: crypto.randomUUID(),
        mode: 'preflight-only',
        status: 'PREPARED',
        goal,
        created_at: new Date().toISOString(),
        preflight
      };
      return Response.json({ ok: true, ...lastSafeWorkJob }, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      return apiError(error, 'WORK_PREFLIGHT_FAILED');
    }
  }

  return null;
}

async function maybeHandleReadiness(request, env) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/gen2/readiness') return null;
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  try {
    const refreshHealth = url.searchParams.get('refresh') === '1';
    return Response.json(await getSystemReadiness({ env, refreshHealth }), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'READINESS_FAILED');
  }
}

async function maybeHandleCouncilAndEvolution(request, env) {
  if (request.method !== 'POST') return null;
  const path = new URL(request.url).pathname;
  if (path !== '/api/gen2/council/state-of-play' && path !== '/api/gen2/evolution/preflight') return null;

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonObject(request);
    const goal = String(body.goal || body.objective || '').trim();
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const minResponses = Math.max(2, Math.min(12, Number(body.minResponses) || 2));

    if (path === '/api/gen2/council/state-of-play') {
      const report = await runAugmentioStateOfPlay({ env, goal, context, minResponses });
      return Response.json({ ok: true, ...report }, { headers: { 'cache-control': 'no-store' } });
    }

    const preflight = await prepareDevelopmentRequest({ env, goal, context, minResponses });
    return Response.json(preflight, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'AI_PREFLIGHT_FAILED');
  }
}

async function maybeHandleChatGPTArchive(request, env) {
  if (request.method !== 'POST') return null;
  const url = new URL(request.url);
  const explicit = url.pathname === '/api/gen2/import/chatgpt-archive';
  const compatibility = url.pathname === '/api/import/chatgpt-context';
  if (!explicit && !compatibility) return null;
  if (!(request.headers.get('content-type') || '').includes('application/json')) return null;

  let body;
  try { body = await request.clone().json(); }
  catch { return explicit ? Response.json({ ok: false, code: 'INVALID_JSON' }, { status: 400 }) : null; }

  const archive = explicit ? (body.archive ?? body.payload ?? body) : body;
  if (!isArchivePayload(archive)) return compatibility ? null : Response.json({ ok: false, code: 'CHATGPT_EXPORT_FORMAT_UNSUPPORTED' }, { status: 400 });

  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const preview = explicit ? body.preview !== false : false;
  try {
    const result = await importChatGPTArchive(env, archive, { preview });
    return Response.json(result, { status: result.ok === false ? 207 : 200, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return apiError(error, 'CHATGPT_ARCHIVE_IMPORT_FAILED');
  }
}

/** Main fetch and scheduled handlers. */
export default {
  async fetch(request, env, ctx) {
    try {
      setDefaultCapabilityEnvironment(env);

      const publicTeacherResponse = await maybeHandlePublicTeacherBridge(request, env);
      if (publicTeacherResponse) return publicTeacherResponse;

      const memoryResponse = await maybeHandleMemoryCompatibility(request, env);
      if (memoryResponse) return memoryResponse;

      const safeWorkResponse = await maybeHandleSafeWork(request, env);
      if (safeWorkResponse) return safeWorkResponse;

      const autonomyResponse = await maybeHandleAutonomyApi(request, env);
      if (autonomyResponse) return autonomyResponse;

      const readinessResponse = await maybeHandleReadiness(request, env);
      if (readinessResponse) return readinessResponse;

      const councilResponse = await maybeHandleCouncilAndEvolution(request, env);
      if (councilResponse) return councilResponse;

      const archiveResponse = await maybeHandleChatGPTArchive(request, env);
      if (archiveResponse) return archiveResponse;

      const preparedRequest = await injectEvolutionPreflightCapability(request);
      if (new URL(preparedRequest.url).pathname === '/api/chat') {
        return await handleNativeChat(preparedRequest, env);
      }

      const response = await router.fetch(preparedRequest, env, ctx);
      if (response) return response;
      throw new Error("Router returned null");
    } catch (error) {
      if (error?.status >= 400 && error.status < 600 && typeof error.code === "string") return Response.json({error:error.code,code:error.code},{status:Number(error.status)});
      if (error instanceof SyntaxError) return Response.json({error:"Invalid JSON",code:"INVALID_JSON"},{status:400});
      console.error("[Gen2] Request error:", error);
      return new Response(
        JSON.stringify({ error: "Une erreur interne est survenue.", code: "INTERNAL_ERROR" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },

  async scheduled(_controller, env, ctx) {
    const work = runAutonomyRuntimeTick(env).catch((error) => {
      console.error('[MEL autonomy] scheduled tick failed:', error?.code || error?.message || error);
      return null;
    });
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else await work;
  }
};