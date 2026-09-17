import test from 'node:test';
import assert from 'node:assert/strict';
import { WORK_TRUTH_PATCH, enhanceWorkTruth } from '../src/pages/work-truth-enhancer.js';

test('Work truth enhancer reads persistent Professor jobs instead of the transient bridge cache', async () => {
  assert.match(WORK_TRUTH_PATCH, /\/api\/professor\/dev\/status/);
  assert.match(WORK_TRUTH_PATCH, /\/api\/professor\/dev\/jobs/);
  assert.doesNotMatch(WORK_TRUTH_PATCH, /fetch\(['"]\/api\/dev-bridge\/jobs/);
  assert.match(WORK_TRUTH_PATCH, /Aucun job persistant actif ou récent/);

  const source = '<!doctype html><body><section data-panel="work"><pre id="workOut"></pre></section></body>';
  const response = await enhanceWorkTruth(new Response(source, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  const html = await response.text();
  assert.match(html, /mel-work-truth-runtime/);
  assert.match(html, /Cycle d’évolution · état réel/);
});
