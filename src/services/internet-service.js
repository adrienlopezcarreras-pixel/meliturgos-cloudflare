import { fetchWebContent, validateUrl } from '../devices/web-capability.js';

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

  pageSource(page, fallbackUrl, kind = 'DIRECT_SOURCE') {
    const html = typeof page === 'string' ? page : String(page?.content || '');
    if (!html) return null;
    const url = page?.url || fallbackUrl;
    return {
      url,
      content: html,
      title: this.extractTitle(html, url),
      snippet: this.extractSnippet(html),
      image_url: this.extractImageUrl(html, url),
      source_kind: kind,
      provenance: typeof page === 'object' ? {
        source_id: page.source_id,
        fetched_at: page.timestamp,
        content_type: page.content_type,
        fetch_duration_ms: page.fetch_duration_ms,
        truncated: page.truncated,
      } : null,
    };
  }

  normalizeResultLink(href, baseUrl) {
    try {
      let candidate = new URL(String(href || '').trim(), baseUrl);
      const host = candidate.hostname.toLowerCase().replace(/\.$/, '');

      // Unwrap the two search redirects used by our bounded discovery pages.
      if ((host === 'google.com' || host.endsWith('.google.com')) && candidate.pathname === '/url') {
        const target = candidate.searchParams.get('q') || candidate.searchParams.get('url');
        if (!target) return null;
        candidate = new URL(target);
      } else if ((host === 'duckduckgo.com' || host.endsWith('.duckduckgo.com')) && candidate.searchParams.has('uddg')) {
        const target = candidate.searchParams.get('uddg');
        if (!target) return null;
        candidate = new URL(target);
      }

      const normalizedHost = candidate.hostname.toLowerCase().replace(/\.$/, '');
      if (normalizedHost === 'google.com' || normalizedHost.endsWith('.google.com')) return null;
      if (normalizedHost === 'duckduckgo.com' || normalizedHost.endsWith('.duckduckgo.com')) return null;
      const validation = validateUrl(candidate.href);
      return validation.valid ? validation.url.href : null;
    } catch {
      return null;
    }
  }

  extractCandidateLinks(html, baseUrl, limit = 12) {
    const source = String(html || '');
    const pattern = /href\s*=\s*["']([^"']+)["']/gi;
    const links = [];
    const seen = new Set();
    let match;
    while ((match = pattern.exec(source)) !== null && links.length < Math.max(1, Math.min(30, Number(limit) || 12))) {
      const normalized = this.normalizeResultLink(match[1], baseUrl);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      links.push(normalized);
    }
    return links;
  }

  normalizeSeedUrls(seedUrls, limit = 6) {
    const out = [];
    const seen = new Set();
    for (const raw of Array.isArray(seedUrls) ? seedUrls : []) {
      const validation = validateUrl(String(raw || '').trim());
      if (!validation.valid) continue;
      const url = validation.url.href;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= Math.max(1, Math.min(6, Number(limit) || 6))) break;
    }
    return out;
  }

  async research(query, domains = null, maxDepth = 1, seedUrls = null) {
    await this.ensureRateLimit();
    const querySanitized = String(query || '').trim();
    if (!querySanitized) throw new Error('INVALID_QUERY');
    const depth = Math.max(1, Math.min(3, Number(maxDepth) || 1));
    const officialSeedUrls = this.normalizeSeedUrls(seedUrls, 6);
    const officialSources = [];
    for (const url of officialSeedUrls) {
      try {
        const page = await this.fetchPage(url);
        const source = this.pageSource(page, url, 'OFFICIAL_SEED');
        if (source) officialSources.push(source);
      } catch (e) {
        console.error(`InternetService official seed failed for ${url}:`, e.message);
      }
    }

    const searchUrls = [];
    if (depth >= 1) searchUrls.push(`https://www.google.com/search?q=${encodeURIComponent(querySanitized)}`);
    if (depth >= 2) searchUrls.push(`https://duckduckgo.com/html/?q=${encodeURIComponent(querySanitized)}`);
    if (depth >= 3 && Array.isArray(domains)) {
      for (const domain of domains.slice(0, 3)) {
        const clean = String(domain || '').trim();
        if (clean) searchUrls.push(`https://${clean}/search?q=${encodeURIComponent(querySanitized)}`);
      }
    }

    const searchResults = officialSources.length ? [] : await Promise.all(searchUrls.slice(0, 3).map(async url => {
      try {
        const page = await this.fetchPage(url);
        return this.pageSource(page, url, 'SEARCH_INDEX');
      } catch (e) {
        console.error(`InternetService research failed for ${url}:`, e.message);
        return null;
      }
    }));
    const searchIndexes = searchResults.filter(Boolean);

    // Depth 2+ means: use search engines for discovery, then inspect a small
    // number of actual public result pages. Search pages remain fallback
    // evidence only; when direct sources resolve, citations point to them.
    const discovered = [];
    const seen = new Set();
    if (depth >= 2) {
      for (const index of searchIndexes) {
        for (const url of this.extractCandidateLinks(index.content, index.url, 12)) {
          if (seen.has(url)) continue;
          seen.add(url);
          discovered.push(url);
          if (discovered.length >= 8) break;
        }
        if (discovered.length >= 8) break;
      }
    }

    const directSources = [];
    const followLimit = depth >= 3 ? 3 : 2;
    for (const url of discovered.slice(0, followLimit)) {
      try {
        const page = await this.fetchPage(url);
        const source = this.pageSource(page, url, 'DIRECT_SOURCE');
        if (source) directSources.push(source);
      } catch (e) {
        console.error(`InternetService direct source failed for ${url}:`, e.message);
      }
    }

    const sources = officialSources.length ? officialSources : (directSources.length ? directSources : searchIndexes);
    return {
      query: querySanitized,
      sources,
      citations_count: sources.length,
      depth,
      discovery: {
        official_seed_urls: officialSeedUrls,
        official_sources_loaded: officialSources.length,
        search_indexes: searchIndexes.map(source => ({
          url: source.url,
          title: source.title,
          provenance: source.provenance,
        })),
        candidate_urls_found: discovered.length,
        direct_sources_loaded: directSources.length,
      },
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
      const fetchImpl = typeof this.env?.MEL_WEB_FETCH === 'function' ? this.env.MEL_WEB_FETCH : fetch;
      return await fetchWebContent(this.sourceId, url, { fetchImpl });
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

  extractImageUrl(html, baseUrl) {
    const source = String(html || '');
    const patterns = [
      /<meta[^>]+property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::url)?["']/i,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i,
    ];
    for (const pattern of patterns) {
      const match = source.match(pattern);
      if (!match?.[1]) continue;
      try {
        const candidate = new URL(match[1].trim(), baseUrl);
        const validation = validateUrl(candidate.href);
        if (validation.valid) return validation.url.href;
      } catch {}
    }
    return null;
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
