/**
 * WebCapability — safe, provenance-aware external web fetch operations.
 */

function validateUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Protocol ${url.protocol} not allowed`);
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.startsWith('127.') || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.') || hostname.startsWith('192.0.2.') || hostname.startsWith('198.51.100.') || hostname.startsWith('203.0.113.')) {
      throw new Error(`Private hostname not allowed: ${hostname}`);
    }
    if (urlString.length > 2000) throw new Error(`URL too long: ${urlString.length} characters`);
    return { valid: true, url };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

async function fetchWebContent(sourceId, url, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const validation = validateUrl(url);
  if (!validation.valid) throw new Error(`Invalid URL: ${validation.error}`);
  if (typeof fetchImpl !== 'function') throw new Error('WEB_FETCH_UNAVAILABLE');

  const startTime = Date.now();
  let content = '';
  let contentType = '';
  try {
    const response = await fetchImpl(validation.url.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MELITURGOS/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.2',
        'Accept-Language': 'fr,en-US;q=0.7,en;q=0.3',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/json') && !contentType.includes('text/plain')) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
    }
    content = await response.text();
  } catch (e) {
    throw new Error(`Web fetch failed: ${e.message}`);
  }

  const bounded = content.slice(0, 50000);
  return {
    source_id: sourceId,
    url: validation.url.href,
    content: bounded,
    truncated: content.length > bounded.length,
    content_type: contentType,
    fetch_duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

function extractUrls(html) {
  const urlPattern = /href=["']([^"']+)["']/gi;
  const urls = new Set();
  let match;
  while ((match = urlPattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1]);
      if (url.protocol === 'http:' || url.protocol === 'https:') urls.add(url.href);
    } catch {}
  }
  return Array.from(urls);
}

export { validateUrl, fetchWebContent, extractUrls };
