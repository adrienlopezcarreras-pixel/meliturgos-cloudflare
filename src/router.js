import { conversationRoutes } from "./api/routes/conversations.js";
import { requireAuth } from "./core/security.js";
import { json, html } from "./core/http.js";
import { createConversationService } from "./conversations/conversation-service.js";
import { withConversationArchive } from "./conversations/intercept.js";
import { createGen2Runtime } from "./core/orchestrator/gen2-runtime.js";
import handleResearch from "./api/research-api.js";
import handleAugmentio from "./api/augmentio-api.js";
import { onRequestGet as handleMvp } from "./pages/mvp-interface.js";
import { onRequestGet as handleFullModeV1 } from "./pages/full-interface.js";
import { onRequestGet as handleFullModeV2 } from "./pages/full-interface-v2.js";
import { SERVICE_WORKER_SOURCE } from "./pages/service-worker.js";
import { devRuntime } from "./dev/runtime-api.js";
import { getRoadmapPayload } from "./roadmap/master-roadmap.js";

let legacy;
async function loadLegacy(env) {
  if (!legacy) legacy = await import("../worker.js").then((m) => m.default);
  return legacy;
}

export function stripInternalCounters(value) {
  if (typeof value !== "string" || !value) return value;
  const cleaned = value
    .replace(/[^.!?\n]*\binteraction_count\b\s*[:=]?\s*\d+[^.!?\n]*[.!?]?/gi, " ")
    .replace(/\binteraction_count\b\s*[:=]?\s*\d+/gi, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned;
}

async function sanitizeLegacyChatResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return response;

  const raw = await response.text();
  let payload;
  try { payload = JSON.parse(raw); }
  catch { return new Response(raw, { status: response.status, headers: response.headers }); }

  for (const key of ["text", "response", "answer"]) {
    if (typeof payload?.[key] === "string") payload[key] = stripInternalCounters(payload[key]);
  }

  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(payload), { status: response.status, headers });
}

function extractCodePath(text) {
  const source = String(text || "");
  const explicit = source.match(/(?:lis|lire|ouvre|ouvrir|affiche|montre|read|open)\s+(?:le\s+)?(?:fichier\s+)?[`'\"]?((?:src|tests|\.github)\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|txt|yml|yaml|toml|css|html|sql|sh|ps1)|worker\.js|package\.json|wrangler\.jsonc)[`'\"]?/i);
  if (explicit) return explicit[1];
  const path = source.match(/[`'\"]?((?:src|tests|\.github)\/[A-Za-z0-9_./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|txt|yml|yaml|toml|css|html|sql|sh|ps1)|worker\.js|package\.json|wrangler\.jsonc)[`'\"]?/i);
  return path?.[1] || null;
}

function extractSearchQuery(text) {
  const source = String(text || "").trim();
  const quoted = source.match(/[`'\"]([^`'\"]{2,120})[`'\"]/);
  if (quoted) return quoted[1];
  const afterVerb = source.match(/(?:cherche|chercher|trouve|trouver|localise|localiser|search|find)\s+(?:dans\s+)?(?:ton|le|du|les)?\s*(?:code|sources?|repo|d[ée]p[ôo]t|github)?\s*[:,-]?\s*(.{2,160})/i);
  if (afterVerb?.[1]) return afterVerb[1].replace(/[?.!]+$/g, "").trim().slice(0, 300);
  const symbol = source.match(/\b[A-Za-z_$][A-Za-z0-9_$]{3,}\b/g)?.filter(x => !/^(?:peux|pourrais|acc[eè]der|code|source|fichier|github|repo|dans|ton|elle|faire|avec|cela|comment|pourquoi)$/i.test(x)).at(-1);
  return (symbol || "MELITURGOS").slice(0, 300);
}

export function inferCodeCapability(text) {
  const source = String(text || "").trim();
  if (!source) return null;
  const codeIntent = /\b(code|source|sources|repo|repository|d[ée]p[ôo]t|github|fichier|fonction|classe|module|commit|branche|branch)\b/i.test(source);
  const selfCodeIntent = /\b(ton|tes|votre|propre)\b[^.!?]{0,35}\b(code|sources?|d[ée]p[ôo]t|repo|fichiers?)\b/i.test(source) || /\b(code|sources?|d[ée]p[ôo]t|repo|fichiers?)\b[^.!?]{0,35}\b(ton|tes|votre|propre)\b/i.test(source);
  if (!codeIntent && !selfCodeIntent) return null;

  const path = extractCodePath(source);
  if (path && /\b(lis|lire|ouvre|ouvrir|affiche|montre|contenu|read|open)\b/i.test(source)) {
    return { id: "code.read", input: { path } };
  }

  if (/\b(cherche|chercher|trouve|trouver|o[uù]|localise|localiser|search|find|acc[eè]s|acc[eè]der|voir|inspecte|inspecter|analyse|analyser)\b/i.test(source) || selfCodeIntent) {
    return { id: "code.search", input: { query: extractSearchQuery(source) } };
  }
  return null;
}

async function injectAutomaticCapability(request) {
  if (request.method !== "POST" || !(request.headers.get("content-type") || "").includes("application/json")) return request;
  let body;
  try { body = await request.clone().json(); }
  catch { return request; }
  if (!body || typeof body !== "object" || body.capability?.id) return request;
  const text = body.text ?? body.message ?? body.prompt ?? "";
  const inferred = inferCodeCapability(text);
  if (!inferred) return request;
  body.capability = inferred;
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(body), redirect: request.redirect });
}

async function codeSelfCheck(env) {
  const runtime = createGen2Runtime({ env });
  const result = await runtime.bus.execute("code.read", { path: "src/router.js" }, {
    owner: env.MELITURGOS_USER || "owner",
    permissions: env.CAPABILITY_PERMISSIONS || [],
    requestId: crypto.randomUUID()
  });
  return {
    ok: true,
    capability: "code.read",
    repository: result.repository,
    branch: result.branch,
    path: result.path,
    sha: result.sha,
    bytes: typeof result.content === "string" ? result.content.length : 0
  };
}

async function handleConversationApi(request, env) {
  const service = createConversationService(env);
  await service.migrate();
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/gen2/roadmap" && request.method === "GET") {
    return json(getRoadmapPayload());
  }

  if (path === "/api/gen2/code/self-check" && request.method === "GET") {
    try { return json(await codeSelfCheck(env)); }
    catch (e) { return json({ ok: false, error: e.message, code: e.code || "CODE_SELF_CHECK_FAILED" }, e.status || 503); }
  }

  if (path === "/api/gen2/capabilities" && request.method === "GET") {
    const runtime = createGen2Runtime({ env });
    const capabilities = await runtime.bus.refreshHealthAll();
    return json({ ok: true, capabilities });
  }

  if (path === "/api/gen2/capabilities/execute" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!body?.id) return json({ error: "capability id required", code: "MISSING_CAPABILITY" }, 400);
    const runtime = createGen2Runtime({ env });
    const result = await runtime.bus.execute(String(body.id), body.input || {}, { owner: env.MELITURGOS_USER || "owner", permissions: env.CAPABILITY_PERMISSIONS || [], requestId: crypto.randomUUID() });
    return json({ ok: true, capability: body.id, result });
  }

  if (path === "/api/gen2/conversations" && request.method === "GET") {
    const owner = env.MELITURGOS_USER || "";
    const rows = await env.DB.prepare("SELECT id, title, status, created_at, updated_at FROM conversations WHERE owner = ? OR owner = '' ORDER BY updated_at DESC LIMIT 100").bind(owner).all();
    return json({ conversations: rows.results || [] });
  }

  if (path === "/api/gen2/conversations/messages" && request.method === "GET") {
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId) return json({ error: "conversation_id required", code: "MISSING_CONVERSATION_ID" }, 400);
    const messages = await service.getMessages(conversationId);
    return json({ conversationId, messages });
  }

  if (path === "/api/gen2/web/research" && (request.method === "GET" || request.method === "POST")) {
    try { return handleResearch(request, env); }
    catch (e) { return json({ error: e.message, code: "INTERNAL_ERROR" }, e.status || 500); }
  }

  if (path === "/api/gen2/augmentio/fanout") {
    try { return await handleAugmentio(request, env); }
    catch (e) { return json({ error: e.message, code: e.code || "AUGMENTIO_ERROR" }, e.status || 500); }
  }

  if (path === "/api/gen2/devices/register" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const result = await service.registerDevice({ id: body.device_id || crypto.randomUUID(), owner: body.owner || "", name: body.name || "", kind: body.kind || "unknown", metadata: body.metadata || {} });
    return json({ ok: true, ...result });
  }

  if (path === "/api/gen2/sync" && request.method === "GET") {
    const deviceId = url.searchParams.get("device_id");
    const conversationId = url.searchParams.get("conversation_id");
    if (!deviceId || !conversationId) return json({ error: "device_id and conversation_id required", code: "MISSING_PARAMS" }, 400);
    const sync = await service.getSyncMessages(deviceId, conversationId);
    return json({ ok: true, ...sync });
  }

  if (path === "/api/gen2/rag/search" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { query, sources, limit, minSimilarity } = body;
      const userId = env.MELITURGOS_USER;
      if (!userId || !query) return json({ error: "userId and query required", code: "MISSING_PARAMS" }, 400);
      const { RAGService } = await import("../src/search/rag-service.js");
      const searchResult = await RAGService.search(env.DB, userId, query, { sources, limit, minSimilarity });
      return json({ ok: true, ...searchResult });
    } catch (e) { return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500); }
  }

  if (path === "/api/gen2/modules/run" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { module_uuid, input } = body;
      if (!module_uuid) return json({ error: "module_uuid is required", code: "MISSING_PARAMS" }, 400);
      const { ModuleRunner } = await import("../src/modules/module-runner.js");
      const runner = new ModuleRunner(env);
      const result = await runner.run(module_uuid, input, { owner: env.MELITURGOS_USER, permissions: env.CAPABILITY_PERMISSIONS || [], requestId: crypto.randomUUID() });
      return json(result);
    } catch (e) { return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500); }
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const earlyUrl = new URL(request.url);
    if (earlyUrl.pathname.startsWith('/api/dev-bridge/')) {
      const bridgeResponse = devRuntime(request, env);
      if (bridgeResponse) return await bridgeResponse;
    }

    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/sw.js") return new Response(SERVICE_WORKER_SOURCE, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
    const devResponse = devRuntime(request, env); if (devResponse) return await devResponse;

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/mvp")) {
      return handleMvp({ env, request, params: {} }).catch(e => html(`Error loading MVP: ${e.message}`, 500));
    }

    if (request.method === "GET" && url.pathname === "/professor") {
      return handleFullModeV2({ env, request, params: {} }).catch(e => html(`Error loading full mode: ${e.message}`, 500));
    }

    if (request.method === "GET" && url.pathname === "/professor-v1") {
      return handleFullModeV1({ env, request, params: {} }).catch(e => html(`Error loading full mode v1: ${e.message}`, 500));
    }

    if (request.method === "GET" && url.pathname === "/professor-legacy") {
      const legacyHandler = await loadLegacy(env);
      const legacyRequest = new Request(new URL('/professor', request.url), request);
      return legacyHandler?.fetch ? legacyHandler.fetch(legacyRequest, env, ctx) : html("<h1>Professor page not available</h1>", 503);
    }

    const conversationResponse = await conversationRoutes(request, env);
    if (conversationResponse) return conversationResponse;

    if (url.pathname.startsWith("/api/gen2/")) {
      try {
        const response = await handleConversationApi(request, env);
        if (response) return response;
      } catch (e) {
        return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500);
      }
    }

    const legacyHandler = await loadLegacy(env);
    if (url.pathname === "/api/chat") {
      const prepared = await injectAutomaticCapability(request);
      const response = await legacyHandler.fetch(prepared, env, ctx);
      return sanitizeLegacyChatResponse(response);
    }
    const wrapped = withConversationArchive(legacyHandler.fetch.bind(legacyHandler));
    return wrapped(request, env, ctx);
  },
};
