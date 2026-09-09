/**
 * WebCapability — Capability for external web interactions
 * 
 * Provides safe, logged web fetch operations with origin tracking.
 * Used by orchestrator to invoke web searches, research, or external data access.
 */

// Lock security: no arbitrary URLs without approval
function validateUrl(urlString) {
  try {
    const url = new URL(urlString);
    
    // Only allow http/https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Protocol ${url.protocol} not allowed`);
    }
    
    // Only allow public domains (no localhost, no private IPs)
    const hostname = url.hostname;
    if (hostname === 'localhost' || 
        hostname.endsWith('.local') ||
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.startsWith('192.0.2.') ||
        hostname.startsWith('198.51.100.') ||
        hostname.startsWith('203.0.113.')) {
      throw new Error(`Private hostname not allowed: ${hostname}`);
    }
    
    // Max length check
    if (urlString.length > 2000) {
      throw new Error(`URL too long: ${urlString.length} characters`);
    }
    
    return { valid: true, url };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Safe web fetch with provenance tracking
 */
async function fetchWebContent(sourceId, url) {
  const validation = validateUrl(url);
  if (!validation.valid) {
    throw new Error(`Invalid URL: ${validation.error}`);
  }
  
  const startTime = Date.now();
  let content = null;
  let error = null;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MELITURGOS/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'fr,en-US;q=0.7,en;q=0.3',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type') || '';  
    if (!contentType.includes('text/html') && !contentType.includes('application/json')) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }
    
    content = await response.text();
    
  } catch (e) {
    error = e.message;
    throw new Error(`Web fetch failed: ${error}`);
  }
  
  const duration = Date.now() - startTime;
  
  // Return structured provenance
  return {
    source_id: sourceId,
    url: validation.url.href,
    content: content.substring(0, 50000), // Limit response size
    truncated: content.length > 50000,
    content_type: contentType,
    fetch_duration_ms: duration,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract URLs from HTML content
 */
function extractUrls(html) {
  const urlPattern = /href=["']([^"']+)["']/gi;
  const urls = new Set();
  let match;
  
  while ((match = urlPattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1]);
      // Only keep http/https public URLs
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        urls.add(url.href);
      }
    } catch (e) {
      // Skip invalid URLs
    }
  }
  
  return Array.from(urls);
}

export { validateUrl, fetchWebContent, extractUrls };