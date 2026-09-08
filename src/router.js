import { requireAuth } from "./core/security.js";
import { json, html } from "./core/http.js";
import {ClientError } from "./core/errors.js";
import { createConversationService } from "./conversations/conversation-service.js";
import { withConversationArchive } from "./conversations/intercept.js";
import handleResearch from "./api/research-api.js";

let legacy;
async function loadLegacy(env) {
  if (!legacy) {
    legacy = await import("../worker.js").then((m) => m.default);
  }
  return legacy;
}

async function handleConversationApi(request, env) {
  const service = createConversationService(env);
  await service.migrate();
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/gen2/conversations" && request.method === "GET") {
    const owner = url.searchParams.get("owner") || "";
    const rows = await env.DB
      .prepare("SELECT id, title, status, created_at, updated_at FROM conversations WHERE owner = ? ORDER BY updated_at DESC")
      .bind(owner)
      .all();
    return json({ conversations: rows.results || [] });
  }

  if (path === "/api/gen2/conversations/messages" && request.method === "GET") {
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId) return json({ error: "conversation_id required", code: "MISSING_CONVERSATION_ID" }, 400);
    const messages = await service.getMessages(conversationId);
    return json({ conversationId, messages });
  }

  if (path === "/api/gen2/web/research" && (request.method === "GET" || request.method === "POST")) {
    try {
      console.error(`[Router] Routing /api/gen2/web/research to handler`);
      return handleResearch(request, env);
    } catch (e) {
      console.error(`[Router] Research error: ${e.message}`, e.stack);
      return json({ error: e.message, code: "INTERNAL_ERROR" }, e.status || 500);
    }
  }

  if (path === "/api/gen2/devices/register" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const result = await service.registerDevice({
      id: body.device_id || crypto.randomUUID(),
      owner: body.owner || "",
      name: body.name || "",
      kind: body.kind || "unknown",
      metadata: body.metadata || {},
    });
    return json({ ok: true, ...result });
  }

  if (path === "/api/gen2/sync" && request.method === "GET") {
    const deviceId = url.searchParams.get("device_id");
    const conversationId = url.searchParams.get("conversation_id");
    if (!deviceId || !conversationId) {
      return json({ error: "device_id and conversation_id required", code: "MISSING_PARAMS" }, 400);
    }
    const sync = await service.getSyncMessages(deviceId, conversationId);
    return json({ ok: true, ...sync });
  }

  // RAG Search Endpoint - GEN2-25
  if (path === "/api/gen2/rag/search" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { userId, query, sources, limit, minSimilarity } = body;

      if (!userId || !query) {
        return json({ error: "userId and query required", code: "MISSING_PARAMS" }, 400);
      }

      // Import RAGService dynamically to avoid issues in tests
      const { RAGService } = await import("../src/search/rag-service.js");
      
      const searchResult = await RAGService.search(
        env.DB,
        userId,
        query,
        { sources, limit, minSimilarity }
      );

      return json({ ok: true, ...searchResult });
    } catch (e) {
      console.error(`[Router] RAG search error: ${e.message}`, e.stack);
      return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500);
    }
  }

  // Module Lab Runner - GEN2-16
  if (path === "/api/gen2/modules/run" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { module_uuid, input, context } = body;

      if (!module_uuid) {
        return json({ error: "module_uuid is required", code: "MISSING_PARAMS" }, 400);
      }

      // Import ModuleRunner dynamically
      const { ModuleRunner } = await import("../src/modules/module-runner.js");
      
      const runner = new ModuleRunner(env);
      const result = await runner.run(module_uuid, input, context);

      return json(result);
    } catch (e) {
      console.error(`[Router] Module runner error: ${e.message}`, e.stack);
      return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500);
    }
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);

    // Serve P0 Interface Principal - GEN2-26
    if (request.method === "GET" && url.pathname === "/") {
      return html(INDEX_HTML, 200, {
        "Content-Type": "text/html; charset=utf-8",
      });
    }

    // Serve professor page
    if (request.method === "GET" && url.pathname === "/professor") {
      const legacy = await loadLegacy(env);
      return legacy && legacy.fetch
        ? html(legacy.PROFESSOR_PAGE_V5_CLASSIC, 200, {
            "Content-Type": "text/html; charset=utf-8",
          })
        : html("<h1>Professor page not available</h1>", 503);
    }

    // Gen2 APIs first.
    if (url.pathname.startsWith("/api/gen2/")) {
      try {
        const response = await handleConversationApi(request, env);
        if (response) return response;
      } catch (e) {
        console.error(JSON.stringify({ message: "gen2 route failed", path: url.pathname, error: e.message }));
        return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500);
      }
    }

    // Delegate legacy routes, wrapping chat and professor with archive.
    const legacyHandler = await loadLegacy(env);
    const wrapped = withConversationArchive(legacyHandler.fetch.bind(legacyHandler));
    return wrapped(request, env, ctx);
  },
};
