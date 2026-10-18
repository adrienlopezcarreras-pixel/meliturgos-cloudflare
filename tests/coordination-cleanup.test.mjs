import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripLegacyNormalVisualLayers } from '../src/professor-live-learning-entry.js';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';

test('shared candidate workflows enforce canonical full CI on every candidate push', async () => {
  const full = await readFile(new URL('../.github/workflows/full-candidate-ci.yml', import.meta.url), 'utf8');
  const teacher = await readFile(new URL('../.github/workflows/runtime-teacher-smoke.yml', import.meta.url), 'utf8');

  assert.ok(full.includes('  push:'), 'full candidate CI must run on push');
  assert.ok(full.includes('      - candidate/mel-clean-autonomy'), 'must cover canonical candidate');
  assert.match(full, /workflow_dispatch:/);
  assert.doesNotMatch(full, /TEMPORARY DEV-LIGHT MODE/);
  assert.doesNotMatch(full, /candidate\/augmentio-core/);
  assert.doesNotMatch(full, /candidate\/mel-ui-selfaware-integration/);

  assert.match(teacher, /candidate\/mel-clean-autonomy/);
  assert.doesNotMatch(teacher, /candidate\/augmentio-core/);
  assert.doesNotMatch(teacher, /candidate\/mel-ui-selfaware-integration/);
});


test('MEL durable learning contains the canonical cleanup and handoff lesson', () => {
  const lesson = BOOTSTRAP_CORRECTIONS.find(row => row.id === 'bootstrap-canonical-cleanup-handoff-20260916');
  assert.ok(lesson);
  assert.equal(lesson.validated, true);
  assert.match(lesson.after, /candidate\/mel-clean-autonomy/);
  assert.match(lesson.after, /full CI \+ Teacher\/runtime \+ preview verts/);
  assert.match(lesson.after, /une seule couche de présentation/);
  assert.match(lesson.after, /sans force-push/);
});

test('parallel-work protocol defines exact-sha validation and no rollback-over-newer-production rules', async () => {
  const protocol = await readFile(new URL('../docs/MEL_PARALLEL_WORK_PROTOCOL.md', import.meta.url), 'utf8');
  assert.match(protocol, /candidate\/mel-clean-autonomy/);
  assert.match(protocol, /release\/mel-2026-09-10-r3-3/);
  assert.match(protocol, /full candidate CI/i);
  assert.match(protocol, /Teacher\/runtime smoke/i);
  assert.match(protocol, /isolated preview/i);
  assert.match(protocol, /Never deploy an older green SHA over a newer production tree/i);
  assert.match(protocol, /one presentation owner/i);
});
