import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { flattenRoadmap, roadmapSummary, getRoadmapPayload } from '../src/roadmap/master-roadmap.js';
import { onRequestGet as renderFullMode } from '../src/pages/full-interface-v2.js';

test('master roadmap is comprehensive and includes major product targets', () => {
  const rows = flattenRoadmap();
  const ids = new Set(rows.map(x => x.id));
  assert.ok(rows.length >= 90, `expected comprehensive roadmap, got ${rows.length}`);
  for (const id of [
    'GEN2-01','GEN2-56','GEN2-63','MEL-CODE-01','MEL-AUG-01','MEL-COUNCIL-01',
    'MEL-EVOL-01','MEL-WORK-01','MEL-VOICE-01','MEL-AVATAR-02','GEN2-27','GEN2-28',
    'MEL-SEC-04','MEL-RES-01','MEL-REL-03'
  ]) assert.ok(ids.has(id), `missing roadmap item ${id}`);
  const summary = roadmapSummary();
  assert.equal(summary.total, rows.length);
  assert.ok(summary.percent_complete >= 0 && summary.percent_complete <= 100);
  assert.equal(getRoadmapPayload().ok, true);
});

test('control center v2 exposes current roadmap, multi-AI controls, diagnostics and the single legacy rollback path', async () => {
  const page = await (await renderFullMode({})).text();
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(page, /Centre de contrôle/);
  assert.match(page, /Multi-IA/);
  assert.match(page, /Travail/);
  assert.match(page, /Feuille de route complète/);
  assert.match(page, /Diagnostic/);
  assert.match(page, /\/api\/gen2\/roadmap/);
  assert.match(router, /handleFullModeV2/);
  assert.doesNotMatch(router, /\/professor-v1/);
  assert.match(router, /\/professor-legacy/);
  assert.match(router, /\/api\/gen2\/roadmap/);
  assert.match(router, /\/api\/gen2\/code\/self-check/);
});
