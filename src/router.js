import { conversationRoutes } from "./api/routes/conversations.js";
import { requireAuth } from "./core/security.js";
import { json, html } from "./core/http.js";
import { createConversationService } from "./conversations/conversation-service.js";
import { withConversationArchive } from "./conversations/intercept.js";
import { createGen2Runtime } from "./core/orchestrator/gen2-runtime.js";
import handleResearch from "./api/research-api.js";
import handleAugmentio from "./api/augmentio-api.js";
import { onRequestGet as handleMvp } from "./pages/mvp-interface.js";
import { SERVICE_WORKER_SOURCE } from "./pages/service-worker.js";
import { devRuntime } from "./dev/runtime-api.js";

let legacy;
async function loadLegacy(env) {
  if (!legacy) legacy = await import("../worker.js").then((m) => m.default);
  return legacy;
}

async function handleConversationApi(request, env) {
  const service = createConversationService(env);
  await service.migrate();
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/gen2/capabilities" && request.method === "GET") {
    const runtime = createGen2Runtime({ env });
    const capabilities = await runtime.bus.refreshHealthAll();
    return json({ ok: true, capabilities });
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
      const legacyHandler = await loadLegacy(env);
      return legacyHandler?.fetch ? legacyHandler.fetch(request, env, ctx) : html("<h1>Professor page not available</h1>", 503);
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
    if (url.pathname === "/api/chat") return legacyHandler.fetch(request, env, ctx);
    const wrapped = withConversationArchive(legacyHandler.fetch.bind(legacyHandler));
    return wrapped(request, env, ctx);
  },
};
