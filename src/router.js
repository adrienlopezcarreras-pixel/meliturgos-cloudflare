import { conversationRoutes } from "./api/routes/conversations.js";
import { requireAuth } from "./core/security.js";
import { json, html } from "./core/http.js";
import { createGen2Runtime } from "./core/orchestrator/gen2-runtime.js";
import handleResearch from "./api/research-api.js";
import handleAugmentio from "./api/augmentio-api.js";
import { onRequestGet as handleMvp } from "./pages/mvp-interface.js";
import { onRequestGet as handleFullModeV2 } from "./pages/full-interface-v2.js";
import { onRequestGet as handleWatchInterface } from "./pages/watch-interface.js";
import { SERVICE_WORKER_SOURCE } from "./pages/service-worker.js";
import { NORMAL_RUNTIME_SOURCE } from "./pages/mvp-runtime.js";
import { devRuntime } from "./dev/runtime-api.js";
import { handleShardVaultStatus } from "./pages/shardvault-status.js";
export { inferNativeCodeCapability as inferCodeCapability } from "./api/native-chat.js";

function capabilityContext(env) {
  return {
    owner: env.MELITURGOS_USER || "owner",
    permissions: env.CAPABILITY_PERMISSIONS || [],
    requestId: crypto.randomUUID()
  };
}

async function codeSelfCheck(env) {
  const runtime = createGen2Runtime({ env });
  const result = await runtime.bus.execute("code.read", { path: "src/router.js" }, capabilityContext(env));
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

async function handleConversationApi(request, env, url = new URL(request.url)) {
  const path = url.pathname;

  if (path === "/api/gen2/roadmap" && request.method === "GET") {
    const runtime = createGen2Runtime({ env });
    return json(await runtime.bus.execute("roadmap.read", {}, capabilityContext(env)));
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
    const result = await runtime.bus.execute(String(body.id), body.input || {}, capabilityContext(env));
    return json({ ok: true, capability: body.id, result });
  }

  if (path === "/api/gen2/conversations" && request.method === "GET") {
    const runtime = createGen2Runtime({ env });
    const rows = await runtime.bus.execute("conversation.list", {}, capabilityContext(env));
    const conversations = (Array.isArray(rows) ? rows : []).map(row => ({
      id: row.id,
      title: row.title,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    return json({ conversations });
  }

  if (path === "/api/gen2/conversations/messages" && request.method === "GET") {
    const conversationId = url.searchParams.get("conversation_id");
    if (!conversationId) return json({ error: "conversation_id required", code: "MISSING_CONVERSATION_ID" }, 400);
    const runtime = createGen2Runtime({ env });
    const result = await runtime.bus.execute("conversation.messages.list", { conversationId }, capabilityContext(env));
    return json({ conversationId, messages: result.messages });
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
    const runtime = createGen2Runtime({ env });
    const result = await runtime.bus.execute("device.register", {
      id: body.device_id || crypto.randomUUID(),
      owner: body.owner || "",
      name: body.name || "",
      kind: body.kind || "unknown",
      metadata: body.metadata || {},
    }, capabilityContext(env));
    return json({ ok: true, ...result });
  }

  if (path === "/api/gen2/sync" && request.method === "GET") {
    const deviceId = url.searchParams.get("device_id");
    const conversationId = url.searchParams.get("conversation_id");
    if (!deviceId || !conversationId) return json({ error: "device_id and conversation_id required", code: "MISSING_PARAMS" }, 400);
    const runtime = createGen2Runtime({ env });
    const sync = await runtime.bus.execute("device.sync", { deviceId, conversationId }, capabilityContext(env));
    return json({ ok: true, ...sync });
  }

  if (path === "/api/gen2/rag/search" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { query, sources, limit, minSimilarity } = body;
      const userId = env.MELITURGOS_USER;
      if (!userId || !query) return json({ error: "userId and query required", code: "MISSING_PARAMS" }, 400);
      const runtime = createGen2Runtime({ env });
      const searchResult = await runtime.bus.execute("rag.search", { query, sources, limit, minSimilarity }, capabilityContext(env));
      return json({ ok: true, ...searchResult });
    } catch (e) { return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500); }
  }

  if (path === "/api/gen2/modules/run" && request.method === "POST") {
    try {
      const body = await request.json().catch(() => ({}));
      const { module_uuid, input } = body;
      if (!module_uuid) return json({ error: "module_uuid is required", code: "MISSING_PARAMS" }, 400);
      const { ModuleRunner } = await import("../src/modules/module-runner.js");
      const runtime = createGen2Runtime({ env });
      const runner = new ModuleRunner(env, runtime.bus);
      const result = await runner.run(module_uuid, input, { owner: env.MELITURGOS_USER, permissions: env.CAPABILITY_PERMISSIONS || [], requestId: crypto.randomUUID() });
      return json(result);
    } catch (e) { return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500); }
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isDevBridge = url.pathname.startsWith('/api/dev-bridge/');
    if (isDevBridge) {
      const bridgeResponse = devRuntime(request, env);
      if (bridgeResponse) return await bridgeResponse;
    }

    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
    if (request.method === "GET" && url.pathname === "/sw.js") return new Response(SERVICE_WORKER_SOURCE, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
    if (request.method === "GET" && url.pathname === "/normal-runtime.js") return new Response(NORMAL_RUNTIME_SOURCE, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate" } });
    if (!isDevBridge) {
      const devResponse = devRuntime(request, env);
      if (devResponse) return await devResponse;
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/mvp")) {
      return handleMvp({ env, request, params: {} }).catch(e => html(`Error loading MVP: ${e.message}`, 500));
    }

    if (request.method === "GET" && url.pathname === "/professor") {
      return handleFullModeV2({ env, request, params: {} }).catch(e => html(`Error loading full mode: ${e.message}`, 500));
    }

    if (request.method === "GET" && url.pathname === "/veille") {
      return handleWatchInterface({ env, request, params: {} }).catch(e => html(`Error loading watch mode: ${e.message}`, 500));
    }

    if (request.method === "GET" && (url.pathname === "/professor-v1" || url.pathname === "/professor-legacy")) {
      return new Response(null, {
        status: 308,
        headers: { location: "/professor", "cache-control": "no-store" }
      });
    }

    const shardVaultResponse = await handleShardVaultStatus(request, env);
    if (shardVaultResponse) return shardVaultResponse;

    const conversationResponse = await conversationRoutes(request, env);
    if (conversationResponse) return conversationResponse;

    if (url.pathname.startsWith("/api/gen2/")) {
      try {
        const response = await handleConversationApi(request, env, url);
        if (response) return response;
      } catch (e) {
        return json({ error: e.message, code: e.code || "INTERNAL_ERROR" }, e.status || 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found", code: "NOT_FOUND" }, 404);
    }
    return html("<h1>Page introuvable</h1>", 404);
  },
};