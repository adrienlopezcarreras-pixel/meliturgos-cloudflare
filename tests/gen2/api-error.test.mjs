import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiErrorPayload,
  apiErrorResponse,
  apiErrorStatus,
  classifyApiError,
} from '../../src/core/api-error.js';

test('API error classification is deterministic and bounded', () => {
  assert.equal(classifyApiError('AUTH_REQUIRED'), 'auth');
  assert.equal(classifyApiError('INVALID_JSON'), 'validation');
  assert.equal(classifyApiError('PROVIDER_TIMEOUT'), 'timeout');
  assert.equal(classifyApiError('RATE_LIMITED'), 'quota');
  assert.equal(classifyApiError('NETWORK_FETCH_FAILED'), 'network');
  assert.equal(classifyApiError('MODEL_UNAVAILABLE'), 'model');
  assert.equal(classifyApiError('MEMORY_EXPORT_FAILED'), 'memory');
  assert.equal(classifyApiError('CAPABILITY_DISABLED'), 'tool');
  assert.equal(classifyApiError('SOMETHING_ELSE'), 'internal');
});

test('API error payload preserves compatibility fields and adds correlation metadata', () => {
  const request = new Request('https://mel.test/api/gen2/readiness', {
    headers: { 'x-mel-request-id': 'mel-core-api-0001' },
  });
  const error = Object.assign(new Error('database unavailable'), {
    code: 'DB_UNAVAILABLE',
    status: 503,
  });
  const payload = apiErrorPayload(error, {
    fallback: 'READINESS_FAILED',
    request,
    origin: 'readiness',
    now: 1000,
  });
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'database unavailable');
  assert.equal(payload.code, 'DB_UNAVAILABLE');
  assert.equal(payload.category, 'memory');
  assert.equal(payload.origin, 'readiness');
  assert.equal(payload.request_id, 'mel-core-api-0001');
  assert.equal(payload.retryable, false);
  assert.equal(payload.timestamp, '1970-01-01T00:00:01.000Z');
});

test('network, timeout, quota and model errors are explicitly retryable', () => {
  for (const code of ['NETWORK_ERROR', 'REQUEST_TIMEOUT', 'QUOTA_EXCEEDED', 'MODEL_UNAVAILABLE']) {
    assert.equal(apiErrorPayload({ code, message: code }).retryable, true);
  }
  assert.equal(apiErrorPayload({ code: 'INVALID_JSON', message: 'bad json' }).retryable, false);
});

test('API error status accepts only HTTP error range', () => {
  assert.equal(apiErrorStatus({ status: 404 }), 404);
  assert.equal(apiErrorStatus({ status: 302 }), 500);
  assert.equal(apiErrorStatus({ status: 700 }), 500);
});

test('API error response is non-cacheable and JSON', async () => {
  const response = apiErrorResponse(
    { code: 'AI_PROVIDER_UNAVAILABLE', message: 'provider down', status: 503 },
    { origin: 'council', now: 2000 },
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type') || '', /application\/json/i);
  const payload = await response.json();
  assert.equal(payload.code, 'AI_PROVIDER_UNAVAILABLE');
  assert.equal(payload.origin, 'council');
});
