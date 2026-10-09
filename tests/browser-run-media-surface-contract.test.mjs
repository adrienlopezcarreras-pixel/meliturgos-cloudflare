import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../browser-companion/runtime/worker.js',import.meta.url),'utf8');

test('Browser Run media endpoints are explicit, bounded, and contain no generic script execution surface',()=>{
  for(const route of [
    '/v1/media/resize-image',
    '/v1/media/render-video',
    '/v1/media/process-video',
    '/v1/media/sample-video',
  ]) assert.match(source,new RegExp(route.replaceAll('/','\\/')));

  assert.match(source,/slice\(0, 3\)/);
  assert.match(source,/boundedNumber\(payload\.duration_ms, 3000, 1500, 6000\)/);
  assert.match(source,/boundedNumber\(payload\.image_count, 4, 3, 8\)/);
  assert.match(source,/boundedNumber\(payload\.max_edge,510,64,510\)/);
  assert.match(source,/base64\.length > 16_000_000/);
  assert.match(source,/buffer\.byteLength > 12_000_000/);
  assert.doesNotMatch(source,/new Function\s*\(/);
  assert.doesNotMatch(source,/eval\s*\(\s*(?:payload|request|body|input)/);
  assert.doesNotMatch(source,/javascript\.eval/);
  assert.doesNotMatch(source,/exec-script/);
});

test('media routes accept only their fixed schemas and do not enter the generic browser action protocol',()=>{
  assert.match(source,/mel\.media\.browser-render-video\/v1/);
  assert.match(source,/mel\.media\.browser-resize-image\/v1/);
  assert.match(source,/mel\.media\.browser-process-video\/v1/);
  assert.match(source,/mel\.media\.browser-sample-video\/v1/);
  const mediaRouteIndex=source.indexOf("/v1/media/render-video");
  const genericRouteIndex=source.indexOf("['/v1/browser/perform', '/v1/browser/close']");
  assert.ok(mediaRouteIndex>=0);
  assert.ok(genericRouteIndex>mediaRouteIndex);
});

test('video generation is visibly frame-animation and never claims a premium generative-video provider',async()=>{
  const runtime=await readFile(new URL('../src/media/workers-ai-media-capabilities.js',import.meta.url),'utf8');
  assert.match(runtime,/engine: 'generated-frame-animation'/);
  assert.match(runtime,/provider: 'workers-ai\+browser-run'/);
  assert.doesNotMatch(runtime,/provider:\s*['"](?:veo|seedance|dreamina)['"]/i);
});


test('video render uses an isolated browser context so unrelated navigation cannot destroy page.evaluate',()=>{
  const start=source.indexOf('async function renderMediaVideo');
  const end=source.indexOf('function normalizeVideoPayload',start);
  assert.ok(start>=0 && end>start);
  const renderSource=source.slice(start,end);
  assert.match(renderSource,/const context = await browser\.newContext\(\)/);
  assert.match(renderSource,/const page = await context\.newPage\(\)/);
  assert.doesNotMatch(renderSource,/browser\.contexts\?\.\(\)\[0\]/);
  assert.doesNotMatch(renderSource,/context\.pages\?\.\(\)\[0\]/);
});


test('media browser sessions use an extended keep-alive so long MediaRecorder work is not cut at 60 seconds',()=>{
  assert.match(source,/const MEDIA_KEEP_ALIVE_MS = 600000;/);
  assert.match(source,/launch\(env\.BROWSER, \{ keep_alive: MEDIA_KEEP_ALIVE_MS \}\)/);
});


test('video render is state-polled instead of held inside one long page.evaluate promise',()=>{
  const start=source.indexOf('async function renderMediaVideo');
  const end=source.indexOf('function normalizeVideoPayload',start);
  assert.ok(start>=0 && end>start);
  const renderSource=source.slice(start,end);
  assert.match(renderSource,/window\.__melVideoRender = \{ status: 'RUNNING'/);
  assert.match(renderSource,/while \(Date\.now\(\) < deadline\)/);
  assert.match(renderSource,/window\.__melVideoRender \|\| \{ status: 'MISSING'/);
  assert.match(renderSource,/MEDIA_VIDEO_RENDER_TIMEOUT/);
  assert.match(renderSource,/MEDIARECORDER_STOP_TIMEOUT/);
  assert.doesNotMatch(renderSource,/const result = await page\.evaluate\(async/);
});


test('video render uses a headless-safe timer scheduler instead of requestAnimationFrame',()=>{
  const start=source.indexOf('async function renderMediaVideo');
  const end=source.indexOf('function normalizeVideoPayload',start);
  assert.ok(start>=0 && end>start);
  const renderSource=source.slice(start,end);
  assert.match(renderSource,/frameIntervalMs/);
  assert.match(renderSource,/setTimeout\(draw, frameIntervalMs\)/);
  assert.match(renderSource,/MEDIA_VIDEO_FRAME_SCHEDULER_TIMEOUT/);
  assert.doesNotMatch(renderSource,/requestAnimationFrame\(draw\)/);
});
