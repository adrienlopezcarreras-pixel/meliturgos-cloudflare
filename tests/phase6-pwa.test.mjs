import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_WORKER_SOURCE } from '../src/pages/service-worker.js';
import { NORMAL_RUNTIME_SOURCE } from '../src/pages/mvp-runtime.js';
import { PWA_MANIFEST, PWA_MANIFEST_JSON } from '../src/pages/pwa-manifest.js';
import { readFile } from 'node:fs/promises';

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

test('normal client actually registers the service worker and revalidation is kept alive', () => {
  assert.match(NORMAL_RUNTIME_SOURCE, /navigator\.serviceWorker\.register\('\/sw\.js'/);
  assert.match(SERVICE_WORKER_SOURCE, /meliturgos-static-v8/);
  assert.match(SERVICE_WORKER_SOURCE, /event\.waitUntil\(update/);
});


test('GEN2-26 exposes an installable manifest without embedding credentials or private state', async () => {
  assert.equal(PWA_MANIFEST.name,'MEL');
  assert.equal(PWA_MANIFEST.short_name,'MEL');
  assert.equal(PWA_MANIFEST.start_url,'/mvp');
  assert.equal(PWA_MANIFEST.scope,'/');
  assert.equal(PWA_MANIFEST.display,'standalone');
  assert.equal(PWA_MANIFEST.lang,'fr-FR');
  assert.ok(Array.isArray(PWA_MANIFEST.icons) && PWA_MANIFEST.icons.length>=1);
  assert.doesNotMatch(PWA_MANIFEST_JSON,/token|secret|password|authorization|cookie|credential/i);

  const page=await readFile(new URL('../src/pages/mvp-interface-v3.js',import.meta.url),'utf8');
  assert.match(page,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(page,/name="theme-color"/);
});

test('GEN2-26 pre-cache is restricted to safe runtime assets and never private HTML/API', () => {
  assert.match(SERVICE_WORKER_SOURCE,/const PRECACHE=\['\/normal-runtime\.js','\/assets\/avatars\/mel-full\.webp/);
  assert.doesNotMatch(SERVICE_WORKER_SOURCE,/PRECACHE=.*['"]\/(?:mvp|professor|api\/)/);
  assert.match(SERVICE_WORKER_SOURCE,/credentials:'same-origin'/);
  assert.match(SERVICE_WORKER_SOURCE,/cache:'no-store'/);
  assert.match(SERVICE_WORKER_SOURCE,/url\.pathname==='\/manifest\.webmanifest'.*return/);
});
