import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripLegacyNormalVisualLayers } from '../src/professor-live-learning-entry.js';
import { enhanceThemeAvatars } from '../src/pages/theme-avatar-enhancer.js';
import { BOOTSTRAP_CORRECTIONS } from '../src/learning/bootstrap-corrections.js';

test('shared candidate workflows only listen to the canonical candidate branch', async () => {
  const full = await readFile(new URL('../.github/workflows/full-candidate-ci.yml', import.meta.url), 'utf8');
  const teacher = await readFile(new URL('../.github/workflows/runtime-teacher-smoke.yml', import.meta.url), 'utf8');
  for (const source of [full, teacher]) {
    assert.match(source, /candidate\/mel-clean-autonomy/);
    assert.doesNotMatch(source, /candidate\/augmentio-core/);
    assert.doesNotMatch(source, /candidate\/mel-ui-selfaware-integration/);
  }
});

test('normal surface delivers one visual owner while preserving functional cleanup', async () => {
  const html = `<!doctype html><html data-theme="classic"><head>
    <style id="mel-owner-visual-fix">.legacy-a{display:block}</style>
    <style id="mel-new-hd-scenes">.legacy-b{display:block}</style>
  </head><body>
    <div id="avatar" class="avatar"><img src="/legacy.webp"></div>
    <button data-theme-choice="classic">Classic</button>
    <script id="mel-normal-page-cleanup">window.functionalCleanup=true;</script>
    <script id="mel-normal-release-runtime">window.legacyVisual=true;</script>
  </body></html>`;
  const stripped = await stripLegacyNormalVisualLayers(new Response(html, { headers: { 'content-type': 'text/html' } }));
  const themed = await enhanceThemeAvatars(stripped);
  const body = await themed.text();
  assert.doesNotMatch(body, /mel-owner-visual-fix/);
  assert.doesNotMatch(body, /mel-new-hd-scenes/);
  assert.doesNotMatch(body, /mel-normal-release-runtime/);
  assert.match(body, /mel-normal-page-cleanup/);
  assert.match(body, /mel-theme-avatar-runtime/);
  assert.equal((body.match(/mel-theme-avatar-runtime/g) || []).length, 1);
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
