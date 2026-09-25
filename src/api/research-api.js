/**
 * Research API - P2 Internet Real
 *
 * Endpoint: /api/gen2/web/research
 *
 * The HTTP contract stays here, while execution crosses CapabilityBus.
 */

import { requireAuth } from "../core/security.js";
import { json } from "../core/http.js";
import { ClientError } from "../core/errors.js";
import { createGen2Runtime } from "../core/orchestrator/gen2-runtime.js";

function busContext(env) {
  return {
    owner: env.MELITURGOS_USER || "owner",
    permissions: env.CAPABILITY_PERMISSIONS || [],
    requestId: crypto.randomUUID(),
  };
}

async function executeResearch(env, { query, domains = null, depth = 1, seedUrls = null }) {
  const runtime = createGen2Runtime({ env });
  return runtime.bus.execute("web.research", {
    query,
    ...(Array.isArray(domains) && domains.length ? { domains } : {}),
    ...(Array.isArray(seedUrls) && seedUrls.length ? { seed_urls: seedUrls } : {}),
    depth,
  }, busContext(env));
}

/** Research API handler. */
async function handleResearch(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const method = request.method;

  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    const query = String(body.query || "").trim();
    if (!query) throw new ClientError("Query is required", "MISSING_QUERY", 400);

    const depth = Math.min(Math.max(1, parseInt(body.maxDepth) || 1), 3);
    const domains = body.domains
      ? String(body.domains).split(",").map(d => d.trim()).filter(Boolean).slice(0, 3)
      : null;
    const seedUrls = Array.isArray(body.seed_urls)
      ? body.seed_urls.map(url => String(url || "").trim()).filter(Boolean).slice(0, 6)
      : null;

    try {
      const result = await executeResearch(env, { query, domains, depth, seedUrls });
      result.retrieved_at = new Date().toISOString();
      return json({
        ok: true,
        research: result,
        meta: {
          performed_at: result.provenance?.timestamp || null,
          query_performed_at: result.provenance?.query_performed_at || null,
          provenance_id: result.provenance?.source_id || null,
        }
      });
    } catch (e) {
      console.error(`[Research] Failed: ${e.message}`);
      if (e?.code && e?.status) throw e;
      throw new ClientError(`Research failed: ${e.message}`, "RESEARCH_FAILED", 500);
    }
  }

  if (method === "GET") {
    const url = new URL(request.url);
    const query = String(url.searchParams.get("query") || "").trim();
    if (!query) throw new ClientError("Query parameter required", "MISSING_QUERY", 400);

    try {
      const result = await executeResearch(env, { query, depth: 1 });
      result.retrieved_at = new Date().toISOString();
      return json({ ok: true, research: result });
    } catch (e) {
      console.error(`[Research] Failed GET: ${e.message}`);
      if (e?.code && e?.status) throw e;
      throw new ClientError(`Research failed: ${e.message}`, "RESEARCH_FAILED", 500);
    }
  }

  throw new ClientError("Method not allowed", "METHOD_NOT_ALLOWED", 405);
}

export default handleResearch;