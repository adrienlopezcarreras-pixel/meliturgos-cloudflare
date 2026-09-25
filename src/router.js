import { conversationRoutes } from "./api/routes/conversations.js";
import { requireAuth, isReleaseSmokeRequest } from "./core/security.js";
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
import { getLegacyInteractionMigrationStatus, backfillLegacyInteractions } from "./persistence/gen1-interactions-migration.js";
import { getChatGPTMemoryBackfillStatus, backfillChatGPTArchiveToMemory } from "./persistence/chatgpt-memory-backfill.js";
import { resolveApiVersionRequest, decorateApiVersionResponse, unsupportedApiVersionResponse, apiMethodNotAllowedResponse, apiVersionMetadataResponse } from "./api/api-versioning.js";
export { inferNativeCodeCapability as inferCodeCapability } from "./api/native-chat.js";

const RELEASE_SMOKE_CAPABILITY_ALLOWLIST = Object.freeze([
  "echo",
  "resilience.recovery.drill.latest",
  "memory.export",
  "memory.export.verify",
]);

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

  if (path === "/api/gen2/human-actions-required" && request.method === "GET") {
    const runtime = createGen2Runtime({ env });
    return json(await runtime.bus.execute("roadmap.human-actions-required", {}, capabilityContext(env)));
  }

  if (path === "/api/gen2/migration/gen1-status" && request.method === "GET") {
    return json(await getLegacyInteractionMigrationStatus(env));
  }

  if (path === "/api/gen2/migration/gen1-backfill" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    try {
      return json(await backfillLegacyInteractions(env, {
        afterId: body.after_id,
        limit: body.limit,
      }));
    } catch (error) {
      return json({
        ok:false,
        error:error?.message || "GEN1_MIGRATION_FAILED",
        code:error?.code || "GEN1_MIGRATION_FAILED",
        details:error?.details || null,
      }, Number(error?.status) || 500);
    }
  }

  if (path === "/api/gen2/migration/chatgpt-memory-status" && request.method === "GET") {
    return json(await getChatGPTMemoryBackfillStatus(env));
  }

  if (path === "/api/gen2/migration/chatgpt-memory-backfill" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    try {
      return json(await backfillChatGPTArchiveToMemory(env, {
        conversationLimit: body.conversation_limit,
      }));
    } catch (error) {
      return json({
        ok:false,
        error:error?.message || "CHATGPT_MEMORY_BACKFILL_FAILED",
        code:error?.code || "CHATGPT_MEMORY_BACKFILL_FAILED",
        conversation_id:error?.conversation_id || null,
        remaining:Number(error?.remaining || 0),
      }, Number(error?.status) || 500);
    }
  }

  if (path === "/api/gen2/code/self-check" && request.method === "GET") {
    try { return json(await codeSelfCheck(env)); }
    catch (e) { return json({ ok: false, error: e.message, code: e.code || "CODE_SELF_CHECK_FAILED" }, e.status || 503); }
  }

  if (path === "/api/gen2/capabilities" && request.method === "GET") {
    const runtime = createGen2Runtime({ env });
    const refresh = url.searchParams.get("refresh") === "1";
    const capabilities = refresh ? await runtime.bus.refreshHealthAll() : runtime.bus.list();
    return json({ ok: true, capabilities, health_refreshed: refresh });
  }

  if (path === "/api/gen2/dashboard-summary" && request.method === "GET") {
    const runtime = createGen2Runtime({ env });
    // Keep the Professor hot path fast. Deep provider health checks are explicit
    // through ?refresh=1 on the capabilities endpoint instead of blocking boot.
    const refresh = url.searchParams.get("refresh") === "1";
    const capabilities = refresh ? await runtime.bus.refreshHealthAll() : runtime.bus.list();
    const roadmap = await runtime.bus.execute("roadmap.read", {}, capabilityContext(env));
    const badStates = new Set(["ERROR","FAILED","FAIL","DOWN","UNHEALTHY","BROKEN"]);
    const unavailableStates = new Set(["OFFLINE","UNAVAILABLE","BLOCKED","DISABLED"]);
    const degradedStates = new Set(["DEGRADED","UNKNOWN","UNTESTED","NOT_TESTED"]);
    const protectedStates = new Set(["PROTECTED"]);
    const health = capabilities.reduce((acc,row)=>{
      const state = row?.enabled === false ? "DISABLED" : String(row?.health || "UNKNOWN").toUpperCase();
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    },{});
    const failed = capabilities.filter(row => badStates.has(String(row?.health || "").toUpperCase())).length;
    const unavailable = capabilities.filter(row => row?.enabled === false || unavailableStates.has(String(row?.health || "").toUpperCase())).length;
    const degraded = capabilities.filter(row => degradedStates.has(String(row?.health || "").toUpperCase())).length;
    const protectedCount = capabilities.filter(row => row?.enabled !== false && protectedStates.has(String(row?.health || "").toUpperCase())).length;
    const active = Math.max(0, capabilities.length - unavailable - failed);
    const roadmapSummary = roadmap?.summary || {};
    const roadmapBlocked = Number(roadmapSummary?.by_status?.BLOCKED_HUMAN || 0)
      + Number(roadmapSummary?.by_status?.BLOCKED_EXTERNAL || 0);
    const deployedBranch = typeof MEL_DEPLOYED_GIT_BRANCH !== "undefined"
      ? String(MEL_DEPLOYED_GIT_BRANCH || "")
      : String(env.MEL_DEPLOYED_GIT_BRANCH || "");
    const deployedSha = typeof MEL_DEPLOYED_GIT_SHA !== "undefined"
      ? String(MEL_DEPLOYED_GIT_SHA || "")
      : String(env.MEL_DEPLOYED_GIT_SHA || "");
    const deploymentExact = Boolean(deployedBranch && /^[0-9a-f]{40}$/i.test(deployedSha));
    const state = failed > 0 || (capabilities.length > 0 && active === 0)
      ? "ERROR"
      : degraded > 0 || roadmapBlocked > 0 || !deploymentExact
        ? "WARN"
        : "OK";
    return json({
      ok: state !== "ERROR",
      state,
      generated_at: new Date().toISOString(),
      health_refreshed: refresh,
      capabilities: { total: capabilities.length, active, usable: active, failed, unavailable, degraded, protected: protectedCount, health },
      roadmap: roadmapSummary,
      deployment: {
        branch: deployedBranch || null,
        commit: /^[0-9a-f]{40}$/i.test(deployedSha) ? deployedSha : null,
        exact_identity_known: deploymentExact
      },
      components: [
        {
          id:"capabilities",
          label:"CapabilityBus",
          status: failed > 0 ? "ERROR" : degraded > 0 ? "WARN" : unavailable > 0 ? "INFO" : "OK",
          detail: failed > 0
            ? failed+" capacité(s) en échec · "+active+"/"+capabilities.length+" utilisables"
            : degraded > 0
              ? active+"/"+capabilities.length+" utilisables · "+degraded+" dégradée(s) · "+protectedCount+" protégée(s) · "+unavailable+" non configurée(s)"
              : unavailable > 0
                ? active+"/"+capabilities.length+" utilisables · "+protectedCount+" protégée(s) · "+unavailable+" non configurée(s)"
                : capabilities.length+" capacité(s) opérationnelle(s)"
        },
        {
          id:"roadmap",
          label:"Roadmap",
          status: roadmapBlocked > 0 ? "WARN" : "OK",
          detail: Number(roadmapSummary.percent_complete || 0)+"% · "+roadmapBlocked+" blocage(s)"
        },
        {
          id:"deployment",
          label:"Déploiement",
          status: deploymentExact ? "OK" : "WARN",
          detail: deploymentExact ? deployedBranch+" · "+deployedSha.slice(0,10) : "Identité exacte indisponible"
        }
      ]
    });
  }

  if (path === "/api/gen2/capabilities/execute" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!body?.id) return json({ error: "capability id required", code: "MISSING_CAPABILITY" }, 400);
    if (isReleaseSmokeRequest(request, env) && !RELEASE_SMOKE_CAPABILITY_ALLOWLIST.includes(String(body.id))) {
      return json({
        error: "release smoke capability denied",
        code: "RELEASE_SMOKE_CAPABILITY_DENIED",
        allowed_capabilities: RELEASE_SMOKE_CAPABILITY_ALLOWLIST,
      }, 403);
    }
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

async function routeResolvedRequest(request, env, ctx) {
    const url = new URL(request.url);
    const isDevBridge = url.pathname.startsWith('/api/dev-bridge/');
    if (isDevBridge) {
      const bridgeResponse = devRuntime(request, env);
      if (bridgeResponse) return await bridgeResponse;
    }

    const auth = requireAuth(request, env);
    if (!auth.ok) return auth.response;
    if (request.method === "GET" && url.pathname === "/sw.js") return new Response(SERVICE_WORKER_SOURCE, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache" } });
    if (request.method === "GET" && url.pathname === "/normal-runtime.js") return new Response(NORMAL_RUNTIME_SOURCE, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=86400, stale-while-revalidate=604800" } });
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
}

export default {
  async fetch(request, env, ctx) {
    const resolution = resolveApiVersionRequest(request, { handler: 'router' });

    if (resolution.unsupported) {
      const auth = requireAuth(request, env);
      if (!auth.ok) return auth.response;
      return unsupportedApiVersionResponse(resolution);
    }

    if (resolution.method_not_allowed) {
      const auth = requireAuth(request, env);
      if (!auth.ok) return auth.response;
      return apiMethodNotAllowedResponse(resolution);
    }

    if (resolution.route?.meta) {
      const auth = requireAuth(request, env);
      if (!auth.ok) return auth.response;
      return decorateApiVersionResponse(apiVersionMetadataResponse(), resolution);
    }

    const response = await routeResolvedRequest(resolution.request, env, ctx);
    return decorateApiVersionResponse(response, resolution);
  },
};