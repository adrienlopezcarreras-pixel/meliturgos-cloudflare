import { conversationRoutes } from "./api/routes/conversations.js";
import { requireAuth } from "./core/security.js";
import { json, html } from "./core/http.js";
import { createConversationService } from "./conversations/conversation-service.js";
import { withConversationArchive } from "./conversations/intercept.js";
import { createGen2Runtime } from "./core/orchestrator/gen2-runtime.js";
import handleResearch from "./api/research-api.js";
import handleAugmentio from "./api/augmentio-api.js";
import { handleMentorChat } from "./api/mentor-api.js";
import { onRequestGet as handleMvp } from "./pages/mvp-interface.js";
import { onRequestGet as handleFullModeV2 } from "./pages/full-interface-v3.js";
import { finalizeMvpInterface } from "./pages/mvp-interface-finalizer.js";
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

  if (path === "/api/gen2/roadmap" && request.method === "GET") return json(getRoadmapPayload());

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

  if (path === "/api/gen2/mentor/chat") return handleMentorChat(request, env);

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
      const response = await handleMvp({ env, request, params: {} }).catch(e => html(`Error loading MVP: ${e.message}`, 500));
      return finalizeMvpInterface(response);
    }

    if (request.method === "GET" && url.pathname === "/professor") {
      return handleFullModeV2({ env, request, params: {} }).catch(e => html(`Error loading full mode: ${e.message}`, 500));
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
    const wrapped = withConversationArchive(legacyHandler.fetch.bind(legacyHandler));
    return wrapped(request, env, ctx);
  },
};