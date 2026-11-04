// Run from a system outside Cloudflare (for example GitHub Actions).
// This is evidence gathering, NOT an automatic failover actuator.
const DEFAULT_ATTEMPTS = 3;
const MAX_HEALTH_RESPONSE_BYTES = 64 * 1024;

// The heartbeat response is tiny. A public server, reverse proxy or
// malicious endpoint may otherwise send an arbitrarily large body before
// .text() finishes, exhausting the independent monitor's memory.
async function checkHealthMarker(response, expectedText) {
  const stream = response?.body;
  if (!stream?.getReader) {
    // Preserve the existing fetch stubs while bounding their result too.
    if (typeof response?.text !== 'function') return {ok:false,code:'HEALTH_BODY_UNAVAILABLE'};
    const body = await response.text();
    const size = new TextEncoder().encode(String(body)).byteLength;
    return size > MAX_HEALTH_RESPONSE_BYTES
      ? {ok:false,code:'HEALTH_BODY_TOO_LARGE'}
      : {ok:String(body).includes(expectedText),code:'EXPECTED_MARKER_NOT_FOUND'};
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  let total = 0, body = '';
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HEALTH_RESPONSE_BYTES)
        return {ok:false,code:'HEALTH_BODY_TOO_LARGE'};
      body += decoder.decode(value, {stream:true});
    }
    body += decoder.decode();
    return {ok:body.includes(expectedText),code:'EXPECTED_MARKER_NOT_FOUND'};
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

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
      let checked;
      try { checked = await checkHealthMarker(response, expectedText); }
      catch { return { status: 'UNKNOWN', code: 'HEALTH_BODY_UNREADABLE', http_status: status }; }
      if (!checked.ok) return { status: 'UNKNOWN', code: checked.code, http_status: status };
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
