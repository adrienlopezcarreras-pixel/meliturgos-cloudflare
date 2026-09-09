/**
 * InternetService — High-level service for web-based operations
 * 
 * Wraps WebCapability with provenance tracking, rate limiting, and enrichment.
 * Available capabilities:
 * - SEARCH: Search engine queries with multi-engine support
 * - RESEARCH: Rich web search with citation generation
 * - AGGREGATE: Fetch multiple sources for comparison
 */

class InternetService {
  constructor(env) {
    this.env = env;
    this.sourceId = this.generateSourceId();
    this.lastFetch = 0;
    this.minInterval = 1000; // 1 second between fetches
  }
  
  /**
   * Generate unique provenance source ID
   */
  generateSourceId() {
    return `web-svc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Rate limiter: ensure minimum interval between requests
   */
  ensureRateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastFetch;
    console.log(`  [RateLimit] lastFetch: ${this.lastFetch}, now: ${now}, elapsed: ${elapsed}ms, minInterval: ${this.minInterval}ms`);
    
    if (elapsed < this.minInterval) {
      const delay = this.minInterval - elapsed;
      console.log(`  [RateLimit] Sleeping for ${delay}ms`);
      return new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastFetch = now;
    return Promise.resolve();
  }
  
  /**
   * Detailed web research with provenance and citation
   */
  async research(query, domains = null, maxDepth = 1) {
    // Rate limit
    await this.ensureRateLimit();
    
    const sources = [];
    const querySanitized = query.trim();
    
    // Build URLs based on depth
    const urls = [];
    if (maxDepth >= 1) {
      urls.push(`https://www.google.com/search?q=${encodeURIComponent(querySanitized)}`);
    }
    
    // Secondary sources for depth > 1
    if (maxDepth >= 2) {
      urls.push(`https://duckduckgo.com/html/?q=${encodeURIComponent(querySanitized)}`);
    }
    
    if (maxDepth >= 3 && domains && Array.isArray(domains) && domains.length > 0) {
      for (const domain of domains) {
        urls.push(`https://${domain}/search?q=${encodeURIComponent(querySanitized)}`);
      }
    }
    
    // Fetch in parallel with strategic waiting
    const fetchPromises = urls.slice(0, 3).map(async (url) => {
      try {
        const content = await this.fetchPage(url);
        if (content === null) {
          return null;
        }
        
        return {
          url,
          content,
          title: this.extractTitle(content, url),
          snippet: this.extractSnippet(content),
          sources_count: Math.floor(Math.random() * 5) + 1, // Simulated
        };
      } catch (e) {
        console.error(`InternetService research failed for ${url}:`, e.message);
        return null;
      }
    });
    
    const results = await Promise.all(fetchPromises);
    
    // Filter out failures
    sources.push(...results.filter(r => r !== null));
    
    // Build citation
    const citation = this.buildCitation(sources, querySanitized);
    
    return {
      query: querySanitized,
      sources,
      citations_count: sources.length,
      depth: maxDepth,
      summary: this.summarizeSources(sources),
      provenance: {
        source_id: this.sourceId,
        timestamp: new Date().toISOString(),
        query_performed_at: new Date().toISOString(),
      },
    };
  }
  
  /**
   * Simple single-page fetch
   */
  async fetchPage(url) {
    await this.ensureRateLimit(); // Rate limit before each fetch
    
    try {
      // Use WebCapability (imported dynamically to avoid circular deps)
      const webCapability = (await import('../devices/web-capability.js'));

      // Don't fetch extremely long URLs
      if (url.length > 500) {
        throw new Error('URL too long');
      }

      return await webCapability.fetchWebContent(this.sourceId, url);
    } catch (e) {
      throw new Error(`fetchPage(${url}) failed: ${e.message}`);
    }
  }
  
  /**
   * Extract page title from HTML
   */
  extractTitle(html, url) {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return 'Unknown';
    }
  }
  
  /**
   * Extract page snippet from HTML
   */
  extractSnippet(html) {
    const snippet = html.match(/<[^>]+class="[^"]*description[^"]*"[^>]*>([^<]*)<\/title>/i) ||
                    html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i);
    
    if (snippet && snippet[1]) {
      return snippet[1].trim();
    }
    
    // Fallback: take first 150 chars
    return html.substring(0, 150).replace(/<[^>]+>/g, ' ').trim();
  }
  
  /**
   * Build citation string for ProvenanceService
   */
  buildCitation(sources, query) {
    return sources.map((s, i) => {
      const id = i + 1;
      return `[${id}] Source: ${s.title}\nURL: ${s.url}\nSnippet: ${s.snippet.substring(0, 200)}`;
    }).join('\n\n');
  }
  
  /**
   * Summarize sources after research
   */
  summarizeSources(sources) {
    if (sources.length === 0) {
      return 'No sources found or all sources failed to load.';
    }
    
    const titles = sources.map(s => s.title);
    const uniqueTitles = [...new Set(titles)];
    
    return `Found ${sources.length} relevant sources (HTML available) covering topics: ${uniqueTitles.slice(0, 5).join(', ') || 'multiple topics'}.`;
  }
}

export default InternetService;