/**
 * Research API - P2 Internet Real
 *
 * Endpoint: /api/gen2/web/research
 *
 * Returns real web search results with:
 * - Real URLs from Google/DuckDuckGo
 * - Real HTML content fetched
 * - Provenance tracking (source_id, timestamp, retrieve_at)
 * - Citation generation
 * - Timeout and error handling
 */

import { requireAuth } from "../core/security.js";
import { json } from "../core/http.js";
import { ClientError } from "../core/errors.js";
import InternetService from "../services/internet-service.js";

/**
 * Research API handler
 */
async function handleResearch(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;

  const method = request.method;

  // POST /api/web/research - Main research endpoint
  if (method === "POST") {
    const body = await request.json().catch(() => ({}));
    
    const query = String(body.query || "").trim();
    if (!query) {
      throw new ClientError("Query is required", "MISSING_QUERY", 400);
    }

    const maxDepth = Math.min(
      Math.max(1, parseInt(body.maxDepth) || 1),
      3
    );
    const domains = body.domains ? String(body.domains).split(",").map(d => d.trim()).filter(d => d) : null;

    try {
      const internetService = new InternetService(env);
      const result = await internetService.research(query, domains, maxDepth);

      // Add retrieved_at provenance
      result.retrieved_at = new Date().toISOString();

      return json({
        ok: true,
        research: result,
        meta: {
          performed_at: result.provenance.timestamp,
          query_performed_at: result.provenance.query_performed_at,
          provenance_id: result.provenance.source_id,
        }
      });

    } catch (e) {
      console.error(`[Research] Failed: ${e.message}`);
      throw new ClientError(
        `Research failed: ${e.message}`,
        "RESEARCH_FAILED",
        500
      );
    }
  }

  // GET /api/web/research?query=... - Simple search endpoint
  if (method === "GET") {
    const url = new URL(request.url);
    const query = url.searchParams.get("query");
    if (!query) {
      throw new ClientError("Query parameter required", "MISSING_QUERY", 400);
    }

    try {
      const internetService = new InternetService(env);
      const result = await internetService.research(query, null, 1);
      result.retrieved_at = new Date().toISOString();

      return json({
        ok: true,
        research: result,
      });
    } catch (e) {
      console.error(`[Research] Failed GET: ${e.message}`);
      throw new ClientError(
        `Research failed: ${e.message}`,
        "RESEARCH_FAILED",
        500
      );
    }
  }

  throw new ClientError("Method not allowed", "METHOD_NOT_ALLOWED", 405);
}

export default handleResearch;