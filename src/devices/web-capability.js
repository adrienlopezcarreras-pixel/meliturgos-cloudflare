/**
 * WebCapability — safe, provenance-aware external web fetch operations.
 */

function privateIpv4(hostname) {
  const parts = String(hostname || '').split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b, c] = parts.map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link local / cloud metadata IP range
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark networks
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function privateIpv6(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!host.includes(':')) return false;
  if (host === '::' || host === '::1') return true;
  if (host.startsWith('fc') || host.startsWith('fd')) return true; // unique local fc00::/7
  if (/^fe[89ab]/.test(host)) return true; // link-local fe80::/10
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice('::ffff:'.length);
    return privateIpv4(mapped);
  }
  return false;
}

function validateUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Protocol ${url.protocol} not allowed`);
    if (url.username || url.password) throw new Error('Embedded URL credentials are not allowed');
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
    const bareHostname = hostname.replace(/^\[/, '').replace(/\]$/, '');
    if (
      bareHostname === 'localhost' ||
      bareHostname.endsWith('.localhost') ||
      bareHostname.endsWith('.local') ||
      bareHostname.endsWith('.internal') ||
      privateIpv4(bareHostname) ||
      privateIpv6(bareHostname)
    ) {
      throw new Error(`Private hostname not allowed: ${hostname}`);
    }
    if (String(urlString).length > 2000) throw new Error(`URL too long: ${String(urlString).length} characters`);
    return { valid: true, url };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

async function fetchValidatedRedirectChain(initialUrl, { fetchImpl, timeoutMs, maxRedirects = 4 } = {}) {
  let current = initialUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const validation = validateUrl(current);
    if (!validation.valid) throw new Error(`Invalid URL: ${validation.error}`);
    const response = await fetchImpl(validation.url.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MELITURGOS/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.2',
        'Accept-Language': 'fr,en-US;q=0.7,en;q=0.3',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect ${response.status} without location`);
      if (hop >= maxRedirects) throw new Error('Too many redirects');
      current = new URL(location, validation.url).href;
      continue;
    }
    return { response, finalUrl: validation.url.href, redirectCount: hop };
  }
  throw new Error('Too many redirects');
}

async function fetchWebContent(sourceId, url, { fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const validation = validateUrl(url);
  if (!validation.valid) throw new Error(`Invalid URL: ${validation.error}`);
  if (typeof fetchImpl !== 'function') throw new Error('WEB_FETCH_UNAVAILABLE');

  const startTime = Date.now();
  let content = '';
  let contentType = '';
  let finalUrl = validation.url.href;
  let redirectCount = 0;
  try {
    const fetched = await fetchValidatedRedirectChain(finalUrl, { fetchImpl, timeoutMs });
    const response = fetched.response;
    finalUrl = fetched.finalUrl;
    redirectCount = fetched.redirectCount;
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
    url: finalUrl,
    content: bounded,
    truncated: content.length > bounded.length,
    content_type: contentType,
    redirect_count: redirectCount,
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
      if (validateUrl(url.href).valid) urls.add(url.href);
    } catch {}
  }
  return Array.from(urls);
}

export { validateUrl, fetchWebContent, extractUrls };
