import { requireAuth } from "./core/security.js";
import { json, html } from "./core/http.js";
import {ClientError } from "./core/errors.js";
import { createConversationService } from "./conversations/conversation-service.js";
import { withConversationArchive } from "./conversations/intercept.js";

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

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);

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
