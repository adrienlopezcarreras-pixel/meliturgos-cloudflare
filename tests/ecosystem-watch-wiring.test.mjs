import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ecosystem watch is wired once into schedule, API and full-mode activity', async () => {
  const index = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui-entry.js', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/pages/full-mode-control-enhancer.js', import.meta.url), 'utf8');
  const watchRuntime = await readFile(new URL('../src/evaluation/capability-watch-runtime.js', import.meta.url), 'utf8');
  const previewWorkflow = await readFile(new URL('../.github/workflows/deploy-candidate-preview.yml', import.meta.url), 'utf8');

  assert.match(index, /runEcosystemCapabilityWatch/);
  assert.match(ui, /\/api\/mel\/capability-watch/);
  assert.match(ui, /\/api\/mel\/capability-watch\/run/);
  assert.match(ui, /WATCH_FORCE_PREVIEW_ONLY/);
  assert.match(panel, /Veille IA, plugins & arts/);
  assert.equal((index.match(/runEcosystemCapabilityWatch\(env,/g) || []).length, 1);
  assert.match(watchRuntime, /selectEcosystemDiscoveryCandidate/);
  assert.match(watchRuntime, /enqueueSupervisedDevelopmentRequest/);
  assert.match(watchRuntime, /source:\s*'ecosystem-watch'/);
  assert.match(previewWorkflow, /Run isolated GEN2-42 sourced watch proof/);
  assert.match(previewWorkflow, /WATCH_NO_COUNCIL_TEACHER_HANDOFF/);
  assert.match(previewWorkflow, /active_teacher_handoffs/);
  assert.match(previewWorkflow, /teacher_request_id/);
  assert.match(previewWorkflow, /Rebase GEN2-42 Teacher handoff through canonical tick/);
  assert.match(previewWorkflow, /\/api\/gen2\/autonomy\/tick/);
  assert.match(previewWorkflow, /\/api\/teacher\/pending/);
  assert.match(previewWorkflow, /NO_CANONICAL_TEACHER_HANDOFF_AFTER_TICK/);
  assert.match(previewWorkflow, /gen2-42-teacher-rebase\.json/);
});
