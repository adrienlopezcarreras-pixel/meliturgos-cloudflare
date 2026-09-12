import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { flattenRoadmap, roadmapSummary, getRoadmapPayload, validateRoadmap } from '../src/roadmap/master-roadmap.js';
import { onRequestGet as renderFullMode } from '../src/pages/full-interface-v2.js';

test('master roadmap is comprehensive, unique and internally consistent', () => {
  const rows = flattenRoadmap();
  const ids = new Set(rows.map(x => x.id));
  assert.ok(rows.length >= 90, `expected comprehensive roadmap, got ${rows.length}`);
  assert.equal(ids.size, rows.length, 'roadmap item ids must be unique');
  for (const id of [
    'GEN2-01','GEN2-56','GEN2-63','MEL-CODE-01','MEL-AUG-01','MEL-COUNCIL-01',
    'MEL-EVOL-01','MEL-WORK-01','MEL-VOICE-01','MEL-AVATAR-02','GEN2-27','GEN2-28',
    'MEL-SEC-04','MEL-RES-01','MEL-REL-03'
  ]) assert.ok(ids.has(id), `missing roadmap item ${id}`);

  // These old entries duplicated canonical deliverables and must not return.
  assert.equal(ids.has('MEL-UI-04'), false, 'Mode complet must have one canonical roadmap item');
  assert.equal(ids.has('MEL-EVAL-02'), false, 'pre-release canary must have one canonical roadmap item');

  const validation = validateRoadmap();
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  assert.deepEqual(validation.issues, []);

  const summary = roadmapSummary();
  assert.equal(summary.total, rows.length);
  assert.ok(summary.percent_complete >= 0 && summary.percent_complete <= 100);
  const payload = getRoadmapPayload();
  assert.equal(payload.ok, true);
  assert.equal(payload.validation.ok, true);
});

test('canonical control center exposes one Work, roadmap, diagnostics, multi-AI and rollback path', async () => {
  const response = await renderFullMode({});
  const page = await response.text();
  const router = await readFile(new URL('../src/router.js', import.meta.url), 'utf8');
  assert.match(page, /Mode complet/);
  assert.match(page, /Multi-IA/);
  assert.match(page, /Work/);
  assert.match(page, /Feuille de route/);
  assert.match(page, /Diagnostic/);
  assert.match(page, /\.augmentio & Council/);
  assert.match(page, /\/api\/gen2\/roadmap/);
  assert.match(page, /\/api\/gen2\/code\/self-check/);
  assert.match(page, /\/professor-legacy/);
  assert.match(router, /handleFullModeV2/);
  assert.match(router, /url\.pathname === "\/professor"/);
  assert.match(router, /\/professor-legacy/);
});
