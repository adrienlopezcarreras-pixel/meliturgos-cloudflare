const REQUEST_ID_HEADER = 'x-mel-request-id';
const DURATION_HEADER = 'x-mel-duration-ms';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function safeNow(now) {
  const value = Number(now);
  return Number.isFinite(value) ? value : Date.now();
}

function fallbackRequestId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return `mel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeRequestId(value) {
  const id = String(value || '').trim();
  return REQUEST_ID_PATTERN.test(id) ? id : '';
}

export function requestIdFromRequest(request, fallback = '') {
  const candidate = request?.headers?.get?.(REQUEST_ID_HEADER)
    || request?.headers?.get?.('x-request-id')
    || '';
  return normalizeRequestId(candidate) || normalizeRequestId(fallback) || fallbackRequestId();
}

export function createRequestTrace(request, { now = Date.now(), requestId = '' } = {}) {
  const startedAt = safeNow(now);
  let pathname = '/';
  try {
    pathname = new URL(request?.url || 'https://mel.invalid/').pathname || '/';
  } catch {}
  return Object.freeze({
    requestId: normalizeRequestId(requestId) || requestIdFromRequest(request),
    method: String(request?.method || 'GET').toUpperCase(),
    pathname,
    startedAt,
    startedAtIso: new Date(startedAt).toISOString(),
  });
}

export function preservePlatformRequestMetadata(source, target) {
  if (!(target instanceof Request)) return target;
  const platformCf = source?.cf && typeof source.cf === 'object' ? source.cf : null;
  if (platformCf && !target.cf) {
    try {
      Object.defineProperty(target, 'cf', {
        value: platformCf,
        configurable: true,
      });
    } catch {}
  }
  return target;
}

export function withRequestTrace(request, trace) {
  if (!(request instanceof Request)) return request;
  const headers = new Headers(request.headers);
  headers.set(REQUEST_ID_HEADER, trace?.requestId || requestIdFromRequest(request));

  // Cloudflare attaches platform metadata (notably request.cf) outside the
  // standard Fetch Request fields. A plain Request clone can drop it, which
  // changes downstream behaviour such as coarse network-location hints.
  const platformCf = request.cf && typeof request.cf === 'object' ? request.cf : null;
  const traced = new Request(request, platformCf ? { headers, cf: platformCf } : { headers });
  return preservePlatformRequestMetadata(request, traced);
}

export function requestDurationMs(trace, now = Date.now()) {
  const startedAt = Number(trace?.startedAt);
  const finishedAt = safeNow(now);
  if (!Number.isFinite(startedAt)) return 0;
  return Math.max(0, Math.round(finishedAt - startedAt));
}

export function structuredErrorPayload(payload = {}, trace, {
  origin = 'mel-core',
  now = Date.now(),
} = {}) {
  const base = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...payload }
    : { error: String(payload || 'INTERNAL_ERROR') };
  return {
    ...base,
    request_id: trace?.requestId || null,
    origin,
    timestamp: new Date(safeNow(now)).toISOString(),
    duration_ms: requestDurationMs(trace, now),
  };
}

export function traceResponse(response, trace, {
  now = Date.now(),
  log = console,
  origin = 'mel-core',
} = {}) {
  if (!(response instanceof Response)) return response;
  const durationMs = requestDurationMs(trace, now);

  try {
    log?.info?.(JSON.stringify({
      event: 'mel.request.completed',
      request_id: trace?.requestId || null,
      method: trace?.method || null,
      path: trace?.pathname || null,
      status: response.status,
      duration_ms: durationMs,
      timestamp: new Date(safeNow(now)).toISOString(),
    }));
  } catch {}

  // WebSocket upgrade responses and other non-standard bodies must not be
  // reconstructed at the boundary.
  if (response.status === 101 || response.webSocket) return response;

  const headers = new Headers(response.headers);
  if (trace?.requestId) headers.set(REQUEST_ID_HEADER, trace.requestId);
  headers.set(DURATION_HEADER, String(durationMs));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function logRequestStart(trace, { log = console } = {}) {
  try {
    log?.info?.(JSON.stringify({
      event: 'mel.request.started',
      request_id: trace?.requestId || null,
      method: trace?.method || null,
      path: trace?.pathname || null,
      timestamp: trace?.startedAtIso || new Date().toISOString(),
    }));
  } catch {}
}

export const REQUEST_OBSERVABILITY_HEADERS = Object.freeze({
  request_id: REQUEST_ID_HEADER,
  duration_ms: DURATION_HEADER,
});
