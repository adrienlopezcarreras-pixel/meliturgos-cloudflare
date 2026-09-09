// Canonical Worker entrypoint. worker.js is an API compatibility dependency.
import router from "./router.js";
import { requireAuth } from "./core/security.js";
import { setDefaultCapabilityEnvironment } from "./capabilities/default-bus.js";
import { importChatGPTArchive } from "./persistence/chatgpt-archive-importer.js";
import { runAugmentioStateOfPlay } from "./teachers/augmentio-council.js";
import { prepareDevelopmentRequest } from "./evolution/development-preflight.js";
import { getSystemReadiness } from "./diagnostics/system-readiness.js";

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

function isEvolutionDevelopmentIntent(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const action = /\b(d[ée]veloppe(?:r)?|ajoute(?:r)?|cr[ée]e(?:r)?|construis|construire|impl[ée]mente(?:r)?|apprends?|upgrade|am[ée]liore(?:r)?|build|develop|implement|add|learn)\b/i.test(value);
  const target = /\b(comp[ée]tence|capacit[ée]|module|outil|int[ée]gration|connecteur|plugin|skill|capability|connector|tool)\b/i.test(value);
  return action && target;
}

async function maybeInjectEvolutionPreflight(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat' || request.method !== 'POST') return request;
  if (!(request.headers.get('content-type') || '').includes('application/json')) return request;
  let body;
  try { body = await request.clone().json(); }
  catch { return request; }
  if (!body || typeof body !== 'object' || body.capability?.id) return request;
  const text = String(body.text ?? body.message ?? body.prompt ?? '').trim();
  if (!isEvolutionDevelopmentIntent(text)) return request;

  body.capability = {
    id: 'evolution.preflight',
    input: {
      goal: text.slice(0, 4000),
      context: { origin: 'chat', rule: 'AI_COUNCIL_BEFORE_CODE' },
      minResponses: 2
    }
  };
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(body), redirect: request.redirect });
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

/** Main fetch handler. */
export default {
  async fetch(request, env, ctx) {
    try {
      // worker.js still creates its compatibility CapabilityBus without env.
      // Prime the shared module with only the safe runtime bindings it needs.
      setDefaultCapabilityEnvironment(env);

      const readinessResponse = await maybeHandleReadiness(request, env);
      if (readinessResponse) return readinessResponse;

      const councilResponse = await maybeHandleCouncilAndEvolution(request, env);
      if (councilResponse) return councilResponse;

      const archiveResponse = await maybeHandleChatGPTArchive(request, env);
      if (archiveResponse) return archiveResponse;

      const preparedRequest = await maybeInjectEvolutionPreflight(request);
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
  }
};
