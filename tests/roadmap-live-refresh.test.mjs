import test from 'node:test';
import assert from 'node:assert/strict';
import { ROADMAP_LIVE_REFRESH_PATCH, enhanceRoadmapLiveRefresh } from '../src/pages/roadmap-live-refresh-enhancer.js';
import { enhanceMvpBehavior } from '../src/pages/mvp-behavior-enhancer.js';

test('roadmap refresh clears in-page cache and forces no-store API reads', () => {
  assert.match(ROADMAP_LIVE_REFRESH_PATCH, /roadmapCache=null/);
  assert.match(ROADMAP_LIVE_REFRESH_PATCH, /\/api\/gen2\/roadmap/);
  assert.match(ROADMAP_LIVE_REFRESH_PATCH, /cache:'no-store'/);
  assert.match(ROADMAP_LIVE_REFRESH_PATCH, /REFRESH_MS=30000/);
});

test('roadmap enhancer is idempotent and only targets the full roadmap surface', async () => {
  const html='<!doctype html><body><section data-panel="roadmap"><div id="roadmapList"></div></section></body>';
  const first=await enhanceRoadmapLiveRefresh(new Response(html,{headers:{'content-type':'text/html'}}));
  const firstText=await first.text();
  assert.match(firstText,/mel-roadmap-live-refresh-runtime/);
  assert.equal(first.headers.get('cache-control'),'no-store');
  const second=await enhanceRoadmapLiveRefresh(new Response(firstText,{headers:{'content-type':'text/html'}}));
  const secondText=await second.text();
  assert.equal((secondText.match(/mel-roadmap-live-refresh-runtime/g)||[]).length,1);
});

test('full mode behavior pipeline includes the roadmap live refresher', async () => {
  const html='<!doctype html><body><section data-panel="chat"><input id="chatInput"></section><section data-panel="roadmap"><div id="roadmapList"></div></section></body>';
  const response=await enhanceMvpBehavior(new Response(html,{headers:{'content-type':'text/html'}}));
  const body=await response.text();
  assert.match(body,/mel-full-control-runtime/);
  assert.match(body,/mel-roadmap-live-refresh-runtime/);
});
