import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPLETION_MATRIX_SCHEMA,
  completionMatrixToJson,
  completionMatrixToMarkdown,
  generateCompletionMatrix,
} from '../../src/roadmap/completion-matrix.js';
import {
  MASTER_ROADMAP,
  flattenRoadmap,
  roadmapSummary,
} from '../../src/roadmap/master-roadmap.js';

test('GEN2-60 derives every matrix row from the canonical roadmap exactly once', () => {
  const sourceRows = flattenRoadmap();
  const matrix = generateCompletionMatrix();

  assert.equal(matrix.schema, COMPLETION_MATRIX_SCHEMA);
  assert.equal(matrix.generated_at, null);
  assert.equal(matrix.source, 'src/roadmap/master-roadmap.js');
  assert.equal(matrix.rows.length, sourceRows.length);
  assert.equal(matrix.summary.total, sourceRows.length);
  assert.deepEqual(matrix.rows.map(row => row.id), sourceRows.map(row => row.id));
  assert.equal(new Set(matrix.rows.map(row => row.id)).size, sourceRows.length);

  for (let index = 0; index < sourceRows.length; index += 1) {
    const source = sourceRows[index];
    const row = matrix.rows[index];
    assert.equal(row.id, source.id);
    assert.equal(row.phase_id, source.phase_id);
    assert.equal(row.priority, source.priority);
    assert.equal(row.status, source.status);
    assert.equal(row.title, source.title);
    assert.equal(row.next, source.next || '');
  }
});

test('GEN2-60 summary and phase totals reconcile with the registry', () => {
  const matrix = generateCompletionMatrix();
  const summary = roadmapSummary();

  assert.equal(matrix.summary.complete, summary.complete);
  assert.equal(matrix.summary.percent_complete, summary.percent_complete);
  assert.equal(matrix.summary.registry_percent_complete, summary.percent_complete);
  assert.equal(matrix.phases.length, MASTER_ROADMAP.length);
  assert.equal(matrix.phases.reduce((sum, phase) => sum + phase.total, 0), matrix.summary.total);
  assert.equal(matrix.phases.reduce((sum, phase) => sum + phase.complete, 0), matrix.summary.complete);
  assert.equal(matrix.phases.reduce((sum, phase) => sum + phase.blocked, 0), matrix.summary.blocked);
  assert.equal(matrix.phases.reduce((sum, phase) => sum + phase.actionable, 0), matrix.summary.actionable);
  assert.equal(matrix.summary.complete + matrix.summary.blocked + matrix.summary.actionable, matrix.summary.total);
});

test('GEN2-60 exposes blockers and deterministic priority-ordered next work', () => {
  const matrix = generateCompletionMatrix();

  assert.ok(matrix.blockers.every(row => row.blocked && !row.complete && !row.actionable));
  assert.ok(matrix.next_work.every(row => row.actionable && !row.complete && !row.blocked));

  for (let index = 1; index < matrix.next_work.length; index += 1) {
    const previous = matrix.next_work[index - 1];
    const current = matrix.next_work[index];
    assert.ok(Number(previous.priority.slice(1)) <= Number(current.priority.slice(1)));
  }
});

test('GEN2-60 renders stable Markdown and JSON directly from the generated matrix', () => {
  const generatedAt = '2026-09-15T20:30:00.000Z';
  const matrix = generateCompletionMatrix({ generatedAt });
  const markdown = completionMatrixToMarkdown(matrix);
  const json = completionMatrixToJson(matrix);
  const parsed = JSON.parse(json);

  assert.match(markdown, /^# MEL completion matrix/m);
  assert.match(markdown, /GEN2-60/);
  assert.match(markdown, /2026-09-15T20:30:00.000Z/);
  assert.equal(parsed.schema, COMPLETION_MATRIX_SCHEMA);
  assert.equal(parsed.generated_at, generatedAt);
  assert.equal(parsed.summary.total, matrix.summary.total);
  assert.equal(parsed.rows.length, matrix.rows.length);
});

test('GEN2-60 rejects invalid timestamps instead of emitting ambiguous evidence', () => {
  assert.throws(
    () => generateCompletionMatrix({ generatedAt: 'not-a-date' }),
    { code: 'COMPLETION_MATRIX_INVALID_GENERATED_AT' },
  );
});


test('GEN2-60 binds the matrix to the exact roadmap revision and a deterministic fingerprint', () => {
  const first = generateCompletionMatrix({ generatedAt: '2026-09-25T09:30:00.000Z' });
  const second = generateCompletionMatrix({ generatedAt: '2026-09-25T10:30:00.000Z' });

  assert.match(first.registry_revision, /^2026-/);
  assert.match(first.matrix_fingerprint, /^fnv1a-[a-f0-9]{8}$/);
  assert.equal(first.matrix_fingerprint, second.matrix_fingerprint);
  assert.equal(first.summary.verified <= first.summary.complete, true);
  assert.equal(first.summary.percent_verified <= first.summary.percent_complete, true);
});

test('GEN2-60 separates human actions from external blockers without hiding either from total blockers', () => {
  const matrix = generateCompletionMatrix();
  const humanIds = new Set(matrix.human_actions_required.map(row => row.id));
  const externalIds = new Set(matrix.external_blockers.map(row => row.id));

  assert.ok(matrix.human_actions_required.every(row => row.status === 'BLOCKED_HUMAN'));
  assert.ok(matrix.external_blockers.every(row => row.status === 'BLOCKED_EXTERNAL'));
  assert.equal(
    matrix.human_actions_required.length + matrix.external_blockers.length,
    matrix.summary.blocked,
  );
  for (const id of humanIds) assert.equal(externalIds.has(id), false);
});

test('GEN2-60 Markdown renders exact human and external blocker sections', () => {
  const matrix = generateCompletionMatrix();
  const markdown = completionMatrixToMarkdown(matrix);

  assert.match(markdown, /## Human actions required/);
  assert.match(markdown, /## External blockers/);
  assert.match(markdown, /Registry revision:/);
  assert.match(markdown, /Fingerprint:/);
  for (const row of matrix.human_actions_required.slice(0, 3)) {
    assert.ok(markdown.includes(row.id));
  }
});
