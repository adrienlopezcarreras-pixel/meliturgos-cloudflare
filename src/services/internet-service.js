/**
 * InternetService — bounded web research with provenance, rate limiting and safe fetches.
 */
class InternetService {
  constructor(env = {}) {
    this.env = env;
    this.sourceId = this.generateSourceId();
    this.lastFetch = 0;
    this.minInterval = 1000;
  }

  generateSourceId() {
    return `web-svc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  ensureRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastFetch;
    if (elapsed < this.minInterval) {
      const delay = this.minInterval - elapsed;
      return new Promise(resolve => setTimeout(() => { this.lastFetch = Date.now(); resolve(); }, delay));
    }
    this.lastFetch = now;
    return Promise.resolve();
  }

  async research(query, domains = null, maxDepth = 1) {
    await this.ensureRateLimit();
    const querySanitized = String(query || '').trim();
    if (!querySanitized) throw new Error('INVALID_QUERY');

    const urls = [];
    if (maxDepth >= 1) urls.push(`https://www.google.com/search?q=${encodeURIComponent(querySanitized)}`);
    if (maxDepth >= 2) urls.push(`https://duckduckgo.com/html/?q=${encodeURIComponent(querySanitized)}`);
    if (maxDepth >= 3 && Array.isArray(domains)) {
      for (const domain of domains.slice(0, 3)) {
        const clean = String(domain || '').trim();
        if (clean) urls.push(`https://${clean}/search?q=${encodeURIComponent(querySanitized)}`);
      }
    }

    const results = await Promise.all(urls.slice(0, 3).map(async url => {
      try {
        const page = await this.fetchPage(url);
        const html = typeof page === 'string' ? page : String(page?.content || '');
        if (!html) return null;
        return {
          url: page?.url || url,
          content: html,
          title: this.extractTitle(html, page?.url || url),
          snippet: this.extractSnippet(html),
          provenance: typeof page === 'object' ? {
            source_id: page.source_id,
            fetched_at: page.timestamp,
            content_type: page.content_type,
            fetch_duration_ms: page.fetch_duration_ms,
            truncated: page.truncated,
          } : null,
        };
      } catch (e) {
        console.error(`InternetService research failed for ${url}:`, e.message);
        return null;
      }
    }));

    const sources = results.filter(Boolean);
    return {
      query: querySanitized,
      sources,
      citations_count: sources.length,
      depth: maxDepth,
      citation: this.buildCitation(sources),
      summary: this.summarizeSources(sources),
      provenance: {
        source_id: this.sourceId,
        timestamp: new Date().toISOString(),
        query_performed_at: new Date().toISOString(),
      },
    };
  }

  async fetchPage(url) {
    await this.ensureRateLimit();
    if (String(url).length > 500) throw new Error('URL too long');
    try {
      const webCapability = await import('../devices/web-capability.js');
      const fetchImpl = typeof this.env?.MEL_WEB_FETCH === 'function' ? this.env.MEL_WEB_FETCH : fetch;
      return await webCapability.fetchWebContent(this.sourceId, url, { fetchImpl });
    } catch (e) {
      throw new Error(`fetchPage(${url}) failed: ${e.message}`);
    }
  }

  extractTitle(html, url) {
    const match = String(html).match(/<title[^>]*>([^<]*)<\/title>/i);
    if (match?.[1]) return match[1].trim();
    try { return new URL(url).hostname; } catch { return 'Unknown'; }
  }

  extractSnippet(html) {
    const source = String(html);
    const snippet = source.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      source.match(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (snippet?.[1]) return snippet[1].trim();
    return source.slice(0, 300).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
  }

  buildCitation(sources) {
    return sources.map((source, i) => `[${i + 1}] ${source.title}\nURL: ${source.url}\nSnippet: ${source.snippet.slice(0, 200)}`).join('\n\n');
  }

  summarizeSources(sources) {
    if (!sources.length) return 'No sources found or all sources failed to load.';
    const titles = [...new Set(sources.map(source => source.title))];
    return `Found ${sources.length} relevant sources covering: ${titles.slice(0, 5).join(', ') || 'multiple topics'}.`;
  }
}

export default InternetService;
