import { requestIdFromRequest } from './request-observability.js';

const CATEGORY_RULES = Object.freeze([
  ['auth', /AUTH|UNAUTH|FORBIDDEN|PERMISSION|DENIED/i],
  ['validation', /INVALID|REQUIRED|UNSUPPORTED|BAD_REQUEST|VALIDATION|SCHEMA/i],
  ['timeout', /TIMEOUT|TIMED_OUT|DEADLINE/i],
  ['quota', /QUOTA|RATE_LIMIT|TOO_MANY|LIMIT_EXCEEDED/i],
  ['network', /NETWORK|FETCH|ECONN|DNS|HTTP_UPSTREAM/i],
  ['model', /MODEL|AI_|PROVIDER/i],
  ['memory', /MEMORY|RAG|ARCHIVE|D1|DB_/i],
  ['tool', /CAPABILITY|TOOL|PLUGIN|CONNECTOR/i],
  ['parsing', /JSON|PARSE|DECODE|ENCODING/i],
]);

export function classifyApiError(code = '') {
  const normalized = String(code || 'INTERNAL_ERROR').toUpperCase();
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(normalized)) return category;
  }
  return 'internal';
}

export function apiErrorStatus(error, fallbackStatus = 500) {
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  return fallbackStatus;
}

export function apiErrorPayload(error, {
  fallback = 'INTERNAL_ERROR',
  request = null,
  origin = 'mel-core',
  now = Date.now(),
} = {}) {
  const code = String(error?.code || fallback || 'INTERNAL_ERROR');
  const message = String(error?.message || code);
  const category = classifyApiError(code);
  return {
    ok: false,
    error: message,
    code,
    category,
    origin,
    request_id: request ? requestIdFromRequest(request) : null,
    timestamp: new Date(Number.isFinite(Number(now)) ? Number(now) : Date.now()).toISOString(),
    retryable: ['timeout', 'quota', 'network', 'model'].includes(category),
  };
}

export function apiErrorResponse(error, options = {}) {
  return Response.json(
    apiErrorPayload(error, options),
    {
      status: apiErrorStatus(error, options.fallbackStatus || 500),
      headers: { 'cache-control': 'no-store' },
    },
  );
}
