import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRequestTrace,
  normalizeRequestId,
  requestDurationMs,
  requestIdFromRequest,
  structuredErrorPayload,
  traceResponse,
  withRequestTrace,
} from '../../src/core/request-observability.js';

test('request observability reuses a valid inbound correlation id', () => {
  const request = new Request('https://mel.test/api/chat', {
    headers: { 'x-request-id': 'client-trace-1234' },
  });
  const trace = createRequestTrace(request, { now: 1000 });
  assert.equal(trace.requestId, 'client-trace-1234');
  assert.equal(trace.method, 'GET');
  assert.equal(trace.pathname, '/api/chat');
  assert.equal(trace.startedAt, 1000);
});

test('request observability rejects malformed correlation ids', () => {
  const request = new Request('https://mel.test/api/chat', {
    headers: { 'x-request-id': 'bad id with spaces' },
  });
  const id = requestIdFromRequest(request);
  assert.ok(normalizeRequestId(id));
  assert.notEqual(id, 'bad id with spaces');
});

test('request trace is propagated through an immutable request clone', () => {
  const original = new Request('https://mel.test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'bonjour' }),
  });
  const trace = createRequestTrace(original, { requestId: 'mel-core-test-0001', now: 1000 });
  const traced = withRequestTrace(original, trace);
  assert.notEqual(traced, original);
  assert.equal(traced.headers.get('x-mel-request-id'), 'mel-core-test-0001');
  assert.equal(original.headers.get('x-mel-request-id'), null);
});

test('request trace preserves Cloudflare platform metadata used by downstream Core services', () => {
  const original = new Request('https://mel.test/api/chat');
  Object.defineProperty(original, 'cf', {
    value: { city: 'Nîmes', region: 'Occitanie', country: 'FR' },
    configurable: true,
  });
  const trace = createRequestTrace(original, { requestId: 'mel-core-test-cf01', now: 1000 });
  const traced = withRequestTrace(original, trace);
  assert.deepEqual(traced.cf, { city: 'Nîmes', region: 'Occitanie', country: 'FR' });
});

test('response exposes request id and measured duration without changing payload', async () => {
  const trace = {
    requestId: 'mel-core-test-0002',
    method: 'GET',
    pathname: '/api/gen2/readiness',
    startedAt: 1000,
  };
  const events = [];
  const response = traceResponse(
    Response.json({ ok: true }),
    trace,
    { now: 1123, log: { info: value => events.push(JSON.parse(value)) } },
  );
  assert.equal(response.headers.get('x-mel-request-id'), 'mel-core-test-0002');
  assert.equal(response.headers.get('x-mel-duration-ms'), '123');
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'mel.request.completed');
  assert.equal(events[0].duration_ms, 123);
});

test('structured error payload keeps compatibility fields and adds trace metadata', () => {
  const trace = {
    requestId: 'mel-core-test-0003',
    startedAt: 1000,
  };
  const payload = structuredErrorPayload(
    { ok: false, error: 'DB unavailable', code: 'DB_UNAVAILABLE' },
    trace,
    { origin: 'memory', now: 1456 },
  );
  assert.equal(payload.ok, false);
  assert.equal(payload.error, 'DB unavailable');
  assert.equal(payload.code, 'DB_UNAVAILABLE');
  assert.equal(payload.request_id, 'mel-core-test-0003');
  assert.equal(payload.origin, 'memory');
  assert.equal(payload.duration_ms, 456);
  assert.equal(payload.timestamp, '1970-01-01T00:00:01.456Z');
});

test('duration never becomes negative', () => {
  assert.equal(requestDurationMs({ startedAt: 2000 }, 1500), 0);
});
