import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_WORKER_SOURCE } from '../src/pages/service-worker.js';

test('service worker uses network-first navigation with offline fallback', () => {
  assert.match(SERVICE_WORKER_SOURCE, /fetch\(request,\{cache:'no-store'\}\)/);
  assert.match(SERVICE_WORKER_SOURCE, /caches\.match\(ROOT\)/);
  assert.match(SERVICE_WORKER_SOURCE, /request\.mode==='navigate'/);
  assert.match(SERVICE_WORKER_SOURCE, /request\.destination==='document'/);
});

test('service worker immediately activates and purges stale MEL caches', () => {
  assert.match(SERVICE_WORKER_SOURCE, /meliturgos-gen2-v2/);
  assert.match(SERVICE_WORKER_SOURCE, /self\.skipWaiting\(\)/);
  assert.match(SERVICE_WORKER_SOURCE, /self\.clients\.claim\(\)/);
  assert.match(SERVICE_WORKER_SOURCE, /caches\.delete/);
});

test('service worker keeps a refreshed MEL root as offline fallback', () => {
  assert.match(SERVICE_WORKER_SOURCE, /cache\.put\(ROOT,fresh\.clone\(\)\)/);
  assert.match(SERVICE_WORKER_SOURCE, /caches\.match\(ROOT\)/);
});

test('service worker replaces themed hand cursor with a standard avatar pointer', () => {
  assert.match(SERVICE_WORKER_SOURCE, /mel-cursor-polish/);
  assert.match(SERVICE_WORKER_SOURCE, /html\[data-theme\] \.avatar\{cursor:pointer!important\}/);
});
