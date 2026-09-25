import {
  COMPLETION_MATRIX_SCHEMA,
  generateCompletionMatrix,
} from './completion-matrix.js';

export const FINAL_STATUS_REPORT_SCHEMA = 'mel.roadmap.final-status-report.v1';

const PRIORITY_ORDER = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });

function reportError(code) {
  return Object.assign(new Error(code), { code });
}

function assertMatrix(matrix) {
  if (!matrix || matrix.schema !== COMPLETION_MATRIX_SCHEMA) {
    throw reportError('FINAL_STATUS_REPORT_INVALID_MATRIX');
  }
  if (!Array.isArray(matrix.rows) || !Array.isArray(matrix.phases) || !Array.isArray(matrix.blockers) || !Array.isArray(matrix.next_work)) {
    throw reportError('FINAL_STATUS_REPORT_INVALID_MATRIX');
  }
  if (!matrix.summary || typeof matrix.summary.total !== 'number' || typeof matrix.summary.complete !== 'number') {
    throw reportError('FINAL_STATUS_REPORT_INVALID_MATRIX');
  }
}

function cloneRows(rows) {
  return rows.map(row => structuredClone(row));
}

function sortOutstanding(rows) {
  return rows.slice().sort((a, b) => {
    const priorityDelta = (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
    return priorityDelta || String(a.phase_id).localeCompare(String(b.phase_id)) || String(a.id).localeCompare(String(b.id));
  });
}

function maturityVerdict({ roadmapComplete, noBlockers, noOpenP0, noOpenP1 }) {
  if (roadmapComplete && noBlockers && noOpenP0 && noOpenP1) return 'MATURE';
  if (!noBlockers) return 'BLOCKED';
  return 'IN_PROGRESS';
}

/**
 * Produce a deterministic, evidence-based final status report from GEN2-60's
 * canonical completion matrix. The report never upgrades roadmap statuses and
 * therefore cannot claim maturity while work or blockers remain in the source.
 */
export function generateFinalStatusReport({ matrix, generatedAt = null } = {}) {
  const sourceMatrix = matrix ?? generateCompletionMatrix({ generatedAt });
  assertMatrix(sourceMatrix);

  const outstanding = sortOutstanding(sourceMatrix.rows.filter(row => !row.complete && !row.blocked));
  const blockers = sortOutstanding(sourceMatrix.blockers);
  const humanActionsRequired = sortOutstanding(
    Array.isArray(sourceMatrix.human_actions_required)
      ? sourceMatrix.human_actions_required
      : blockers.filter(row => row.status === 'BLOCKED_HUMAN'),
  );
  const externalBlockers = sortOutstanding(
    Array.isArray(sourceMatrix.external_blockers)
      ? sourceMatrix.external_blockers
      : blockers.filter(row => row.status === 'BLOCKED_EXTERNAL'),
  );
  const openP0 = outstanding.filter(row => row.priority === 'P0');
  const openP1 = outstanding.filter(row => row.priority === 'P1');
  const roadmapComplete = sourceMatrix.summary.total > 0 && sourceMatrix.summary.complete === sourceMatrix.summary.total;
  const noBlockers = blockers.length === 0;
  const noOpenP0 = openP0.length === 0;
  const noOpenP1 = openP1.length === 0;
  const readyForFinalMilestone = roadmapComplete && noBlockers && noOpenP0 && noOpenP1;

  return Object.freeze({
    schema: FINAL_STATUS_REPORT_SCHEMA,
    generated_at: sourceMatrix.generated_at ?? null,
    source: Object.freeze({
      schema: sourceMatrix.schema,
      path: sourceMatrix.source,
      registry_revision: sourceMatrix.registry_revision || null,
      matrix_fingerprint: sourceMatrix.matrix_fingerprint || null,
    }),
    verdict: maturityVerdict({ roadmapComplete, noBlockers, noOpenP0, noOpenP1 }),
    ready_for_final_milestone: readyForFinalMilestone,
    summary: Object.freeze(structuredClone(sourceMatrix.summary)),
    gates: Object.freeze({
      roadmap_complete: roadmapComplete,
      no_blockers: noBlockers,
      no_open_p0: noOpenP0,
      no_open_p1: noOpenP1,
    }),
    critical_open: Object.freeze(cloneRows([...openP0, ...openP1])),
    blockers: Object.freeze(cloneRows(blockers)),
    human_actions_required: Object.freeze(cloneRows(humanActionsRequired)),
    external_blockers: Object.freeze(cloneRows(externalBlockers)),
    next_work: Object.freeze(cloneRows(sourceMatrix.next_work)),
    phases: Object.freeze(sourceMatrix.phases.map(phase => structuredClone(phase))),
  });
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function appendRows(lines, rows, emptyMessage) {
  if (!rows.length) {
    lines.push(emptyMessage, '');
    return;
  }
  lines.push('| ID | Priority | Status | Phase | Title | Next |', '| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(`| ${escapeCell(row.id)} | ${escapeCell(row.priority)} | ${escapeCell(row.status)} | ${escapeCell(row.phase_id)} | ${escapeCell(row.title)} | ${escapeCell(row.next)} |`);
  }
  lines.push('');
}

export function finalStatusReportToMarkdown(report = generateFinalStatusReport()) {
  if (!report || report.schema !== FINAL_STATUS_REPORT_SCHEMA || !report.gates || !report.summary) {
    throw reportError('FINAL_STATUS_REPORT_INVALID_INPUT');
  }

  const lines = [
    '# MEL final status report',
    '',
    `Schema: \`${report.schema}\``,
    `Source: \`${report.source?.schema || 'unknown'}\` from \`${report.source?.path || 'unknown'}\``,
    `Registry revision: ${report.source?.registry_revision || 'not exposed by matrix'}`,
    `Matrix fingerprint: ${report.source?.matrix_fingerprint || 'not exposed by matrix'}`,
    `Generated at: ${report.generated_at || 'deterministic/no timestamp'}`,
    '',
    `Verdict: **${report.verdict}**`,
    `Ready for final milestone: **${yesNo(report.ready_for_final_milestone)}**`,
    `Progress: **${report.summary.complete}/${report.summary.total} (${report.summary.percent_complete}%)**`,
    '',
    '## Maturity gates',
    '',
    '| Gate | Pass |',
    '| --- | --- |',
    `| Roadmap complete | ${yesNo(report.gates.roadmap_complete)} |`,
    `| No blockers | ${yesNo(report.gates.no_blockers)} |`,
    `| No open P0 | ${yesNo(report.gates.no_open_p0)} |`,
    `| No open P1 | ${yesNo(report.gates.no_open_p1)} |`,
    '',
    '## Critical open work',
    '',
  ];

  appendRows(lines, report.critical_open || [], 'No open P0/P1 work.');
  lines.push('## Human actions required', '');
  appendRows(lines, report.human_actions_required || [], 'No human actions required.');
  lines.push('## External blockers', '');
  appendRows(lines, report.external_blockers || [], 'No external blockers.');
  lines.push('## All blockers', '');
  appendRows(lines, report.blockers || [], 'No blockers.');
  lines.push('## Next work', '');
  appendRows(lines, report.next_work || [], 'No actionable work remains.');

  return `${lines.join('\n')}\n`;
}

export function finalStatusReportToJson(report = generateFinalStatusReport(), { space = 2 } = {}) {
  if (!report || report.schema !== FINAL_STATUS_REPORT_SCHEMA) {
    throw reportError('FINAL_STATUS_REPORT_INVALID_INPUT');
  }
  const indentation = Math.max(0, Math.min(8, Math.trunc(Number(space) || 0)));
  return `${JSON.stringify(report, null, indentation)}\n`;
}
