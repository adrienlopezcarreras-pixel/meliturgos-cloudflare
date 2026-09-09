import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_WORKER_SOURCE } from '../src/pages/service-worker.js';

test('service worker source provides offline cache fallback for GET requests', () => {
  assert.match(SERVICE_WORKER_SOURCE, /caches\.open/);
  assert.match(SERVICE_WORKER_SOURCE, /caches\.match/);
  assert.match(SERVICE_WORKER_SOURCE, /self\.addEventListener\('install'/);
  assert.match(SERVICE_WORKER_SOURCE, /self\.addEventListener\('fetch'/);
  assert.match(SERVICE_WORKER_SOURCE, /e\.request\.method==='GET'/);
});

test('service worker keeps the current MEL root as an offline fallback', () => {
  assert.match(SERVICE_WORKER_SOURCE, /c\.add\('\/'\)/);
  assert.match(SERVICE_WORKER_SOURCE, /caches\.match\('\/'\)/);
});
