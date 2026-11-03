// Run from a system outside Cloudflare (for example GitHub Actions).
// This is evidence gathering, NOT an automatic failover actuator.
const DEFAULT_ATTEMPTS = 3;

export function validateExternalHealthUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) return false;
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') ||
        /^(127|10|0|169\.254|192\.168)\./.test(url.hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname) ||
        url.hostname === '[::1]') return false;
    // The monitor URL is public; tokens must never be placed in query strings.
    return !url.search;
  } catch {
    return false;
  }
}

export async function probeExternalHealth(url, { fetchImpl = fetch, timeoutMs = 10000, expectedText = '' } = {}) {
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      headers: { Accept: 'text/html,application/json', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(Math.max(500, Math.min(30000, timeoutMs))),
    });
    const status = Number(response?.status || 0);
    if (status >= 300 && status < 500) return { status: 'UNKNOWN', code: 'HTTP_AUTH_OR_ROUTING', http_status: status };
    if (status >= 500) return { status: 'DOWN', code: 'HTTP_SERVER_FAILURE', http_status: status };
    if (status < 200 || status >= 300) return { status: 'DOWN', code: 'HTTP_NOT_OK', http_status: status };
    if (expectedText) {
      const body = (await response.text()).slice(0, 100000);
      if (!body.includes(expectedText)) return { status: 'UNKNOWN', code: 'EXPECTED_MARKER_NOT_FOUND', http_status: status };
    }
    return { status: 'UP', code: 'HTTP_REACHABLE', http_status: status };
  } catch {
    return { status: 'DOWN', code: 'NETWORK_OR_TIMEOUT', http_status: null };
  }
}

export async function monitorExternalHealth({
  url,
  fetchImpl = fetch,
  attempts = DEFAULT_ATTEMPTS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  delayMs = 1500,
  expectedText = '',
} = {}) {
  if (!validateExternalHealthUrl(url)) return Object.freeze({
    schema: 'mel.external-health-monitor/v1',
    status: 'UNKNOWN', code: 'HEALTH_URL_NOT_CONFIGURED_OR_INVALID',
    independent: true, failover_performed: false, samples: [],
  });
  const count = Math.max(3, Math.min(5, Math.trunc(attempts) || DEFAULT_ATTEMPTS));
  const samples = [];
  for (let n = 0; n < count; n++) {
    if (n > 0) await sleep(delayMs);
    samples.push(await probeExternalHealth(url, { fetchImpl, expectedText }));
  }
  const up = samples.filter(row => row.status === 'UP').length;
  const down = samples.filter(row => row.status === 'DOWN').length;
  const quorum = Math.floor(count / 2) + 1;
  const status = up >= quorum ? 'UP' : down >= quorum ? 'DOWN' : 'UNKNOWN';
  return Object.freeze({
    schema: 'mel.external-health-monitor/v1', status,
    code: status === 'UNKNOWN' ? 'NO_HEALTH_QUORUM' : status === 'DOWN' ? 'OUTAGE_QUORUM' : 'HEALTH_QUORUM',
    independent: true, failover_performed: false,
    target_host: new URL(url).hostname,
    samples: Object.freeze(samples),
    observed_at: new Date().toISOString(),
  });
}
