import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_WORKER_SOURCE } from '../src/pages/service-worker.js';

test('service worker source provides offline cache fallback for GET requests', () => {
  assert.match(SERVICE_WORKER_SOURCE, /caches\.open/);
  assert.match(SERVICE_WORKER_SOURCE, /cache\.match\(request\)/);
  assert.match(SERVICE_WORKER_SOURCE, /self\.addEventListener\('install'/);
  assert.match(SERVICE_WORKER_SOURCE, /self\.addEventListener\('fetch'/);
  assert.match(SERVICE_WORKER_SOURCE, /request\.method!=='GET'/);
});

test('service worker never persists private HTML as an offline fallback', () => {
  assert.doesNotMatch(SERVICE_WORKER_SOURCE, /const FALLBACK='\/'/);
  assert.doesNotMatch(SERVICE_WORKER_SOURCE, /cache\.add\('\/'\)|cache\.add\(FALLBACK\)/);
  assert.match(SERVICE_WORKER_SOURCE, /request\.mode==='navigate'.*return/);
  assert.match(SERVICE_WORKER_SOURCE, /url\.pathname\.startsWith\('\/assets\/'\)/);
});
