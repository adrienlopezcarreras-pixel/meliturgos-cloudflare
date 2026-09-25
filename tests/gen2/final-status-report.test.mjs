import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPLETION_MATRIX_SCHEMA,
  generateCompletionMatrix,
} from '../../src/roadmap/completion-matrix.js';
import {
  FINAL_STATUS_REPORT_SCHEMA,
  finalStatusReportToJson,
  finalStatusReportToMarkdown,
  generateFinalStatusReport,
} from '../../src/roadmap/final-status-report.js';

function makeMatrix({ rows, blockers = [], nextWork = rows.filter(row => !row.complete && !row.blocked), complete } = {}) {
  const total = rows.length;
  const completeCount = complete ?? rows.filter(row => row.complete).length;
  return {
    schema: COMPLETION_MATRIX_SCHEMA,
    generated_at: '2026-09-15T20:45:00.000Z',
    source: 'src/roadmap/master-roadmap.js',
    summary: {
      total,
      complete: completeCount,
      blocked: blockers.length,
      actionable: nextWork.length,
      percent_complete: total ? Math.round((completeCount / total) * 100) : 0,
      by_status: {},
      by_priority: {},
      registry_percent_complete: total ? Math.round((completeCount / total) * 100) : 0,
    },
    phases: [],
    rows,
    blockers,
    next_work: nextWork,
  };
}

function row(id, { priority = 'P2', complete = false, blocked = false, status = 'PLANNED' } = {}) {
  return {
    id,
    phase_id: 'PX',
    phase: 'Test',
    title: `Task ${id}`,
    priority,
    status,
    next: `Next ${id}`,
    complete,
    blocked,
    actionable: !complete && !blocked,
  };
}

test('GEN2-61 derives report summary and evidence from the canonical GEN2-60 matrix', () => {
  const matrix = generateCompletionMatrix({ generatedAt: '2026-09-15T20:45:00.000Z' });
  const report = generateFinalStatusReport({ matrix });

  assert.equal(report.schema, FINAL_STATUS_REPORT_SCHEMA);
  assert.equal(report.source.schema, COMPLETION_MATRIX_SCHEMA);
  assert.equal(report.source.path, matrix.source);
  assert.equal(report.generated_at, matrix.generated_at);
  assert.deepEqual(report.summary, matrix.summary);
  assert.deepEqual(report.next_work.map(item => item.id), matrix.next_work.map(item => item.id));
});

test('GEN2-61 fails closed while critical work or blockers remain', () => {
  const blocked = row('BLOCKED', { priority: 'P1', blocked: true, status: 'BLOCKED_HUMAN' });
  const matrix = makeMatrix({
    rows: [
      row('DONE', { priority: 'P0', complete: true, status: 'DONE_VERIFIED' }),
      row('P0-OPEN', { priority: 'P0' }),
      row('P1-OPEN', { priority: 'P1' }),
      row('P2-OPEN', { priority: 'P2' }),
      blocked,
    ],
    blockers: [blocked],
  });

  const report = generateFinalStatusReport({ matrix });
  assert.equal(report.verdict, 'BLOCKED');
  assert.equal(report.ready_for_final_milestone, false);
  assert.deepEqual(report.critical_open.map(item => item.id), ['P0-OPEN', 'P1-OPEN']);
  assert.deepEqual(report.blockers.map(item => item.id), ['BLOCKED']);
  assert.equal(report.gates.roadmap_complete, false);
  assert.equal(report.gates.no_blockers, false);
  assert.equal(report.gates.no_open_p0, false);
  assert.equal(report.gates.no_open_p1, false);
});

test('GEN2-61 reports IN_PROGRESS without blockers and MATURE only for a complete matrix', () => {
  const incompleteMatrix = makeMatrix({ rows: [row('P2-OPEN', { priority: 'P2' })] });
  const incomplete = generateFinalStatusReport({ matrix: incompleteMatrix });
  assert.equal(incomplete.verdict, 'IN_PROGRESS');
  assert.equal(incomplete.ready_for_final_milestone, false);
  assert.equal(incomplete.gates.no_open_p0, true);
  assert.equal(incomplete.gates.no_open_p1, true);

  const done = row('DONE', { priority: 'P0', complete: true, status: 'DONE_VERIFIED' });
  const matureMatrix = makeMatrix({ rows: [done], blockers: [], nextWork: [], complete: 1 });
  const mature = generateFinalStatusReport({ matrix: matureMatrix });
  assert.equal(mature.verdict, 'MATURE');
  assert.equal(mature.ready_for_final_milestone, true);
  assert.deepEqual(mature.gates, {
    roadmap_complete: true,
    no_blockers: true,
    no_open_p0: true,
    no_open_p1: true,
  });
});

test('GEN2-61 renders deterministic Markdown and JSON without mutating status', () => {
  const open = row('OPEN|PIPE', { priority: 'P0' });
  const report = generateFinalStatusReport({ matrix: makeMatrix({ rows: [open] }) });
  const markdown = finalStatusReportToMarkdown(report);
  const json = finalStatusReportToJson(report);
  const parsed = JSON.parse(json);

  assert.match(markdown, /^# MEL final status report/m);
  assert.match(markdown, /Verdict: \*\*IN_PROGRESS\*\*/);
  assert.match(markdown, /OPEN\\\|PIPE/);
  assert.equal(parsed.schema, FINAL_STATUS_REPORT_SCHEMA);
  assert.equal(parsed.ready_for_final_milestone, false);
  assert.equal(parsed.critical_open[0].status, 'PLANNED');
});

test('GEN2-61 rejects malformed completion evidence', () => {
  assert.throws(
    () => generateFinalStatusReport({ matrix: { schema: 'wrong' } }),
    { code: 'FINAL_STATUS_REPORT_INVALID_MATRIX' },
  );
  assert.throws(
    () => finalStatusReportToMarkdown({ schema: FINAL_STATUS_REPORT_SCHEMA }),
    { code: 'FINAL_STATUS_REPORT_INVALID_INPUT' },
  );
});


test('GEN2-61 preserves completion-matrix revision/fingerprint evidence when present', () => {
  const base = makeMatrix({ rows: [row('OPEN', { priority: 'P2' })] });
  base.registry_revision = '2026-09-25.10';
  base.matrix_fingerprint = 'fnv1a-deadbeef';

  const report = generateFinalStatusReport({ matrix: base });
  assert.equal(report.source.registry_revision, '2026-09-25.10');
  assert.equal(report.source.matrix_fingerprint, 'fnv1a-deadbeef');

  const markdown = finalStatusReportToMarkdown(report);
  assert.match(markdown, /2026-09-25\.10/);
  assert.match(markdown, /fnv1a-deadbeef/);
});

test('GEN2-61 separates human actions from external blockers while retaining the full blocker list', () => {
  const human = row('HUMAN', { priority: 'P1', blocked: true, status: 'BLOCKED_HUMAN' });
  const external = row('EXTERNAL', { priority: 'P1', blocked: true, status: 'BLOCKED_EXTERNAL' });
  const matrix = makeMatrix({
    rows: [human, external],
    blockers: [human, external],
    nextWork: [],
  });
  matrix.human_actions_required = [human];
  matrix.external_blockers = [external];

  const report = generateFinalStatusReport({ matrix });
  assert.deepEqual(report.human_actions_required.map(item => item.id), ['HUMAN']);
  assert.deepEqual(report.external_blockers.map(item => item.id), ['EXTERNAL']);
  assert.deepEqual(report.blockers.map(item => item.id), ['EXTERNAL', 'HUMAN']);

  const markdown = finalStatusReportToMarkdown(report);
  assert.match(markdown, /## Human actions required/);
  assert.match(markdown, /## External blockers/);
  assert.match(markdown, /## All blockers/);
});

test('GEN2-61 never claims maturity from an incomplete but blocker-free roadmap', () => {
  const matrix = makeMatrix({
    rows: [
      row('DONE', { complete: true, status: 'DONE_VERIFIED', priority: 'P0' }),
      row('P2-OPEN', { priority: 'P2' }),
    ],
    blockers: [],
  });
  const report = generateFinalStatusReport({ matrix });
  assert.equal(report.verdict, 'IN_PROGRESS');
  assert.equal(report.ready_for_final_milestone, false);
  assert.equal(report.gates.roadmap_complete, false);
});
