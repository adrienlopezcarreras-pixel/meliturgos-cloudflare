import {
  MASTER_ROADMAP,
  ROADMAP_REGISTRY_REVISION,
  ROADMAP_STATUSES,
  flattenRoadmap,
  roadmapSummary,
  validateRoadmap,
} from './master-roadmap.js';

export const COMPLETION_MATRIX_SCHEMA = 'mel.roadmap.completion-matrix.v1';

const COMPLETE_STATUSES = new Set([
  ROADMAP_STATUSES.DONE,
  ROADMAP_STATUSES.VERIFIED,
]);

const BLOCKED_STATUSES = new Set([
  ROADMAP_STATUSES.BLOCKED_HUMAN,
  ROADMAP_STATUSES.BLOCKED_EXTERNAL,
]);

function percentage(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function normalizeGeneratedAt(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw Object.assign(new Error('COMPLETION_MATRIX_INVALID_GENERATED_AT'), {
      code: 'COMPLETION_MATRIX_INVALID_GENERATED_AT',
    });
  }
  return date.toISOString();
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = String(row[key]);
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = canonical(child);
  }
  return out;
}

function matrixFingerprint(value) {
  const text = JSON.stringify(canonical(value));
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildRow(row) {
  const complete = COMPLETE_STATUSES.has(row.status);
  const blocked = BLOCKED_STATUSES.has(row.status);
  return Object.freeze({
    id: row.id,
    phase_id: row.phase_id,
    phase: row.phase,
    title: row.title,
    priority: row.priority,
    status: row.status,
    next: row.next || '',
    complete,
    blocked,
    actionable: !complete && !blocked,
  });
}

function buildPhase(phase, rows) {
  const phaseRows = rows.filter(row => row.phase_id === phase.id);
  const complete = phaseRows.filter(row => row.complete).length;
  const blocked = phaseRows.filter(row => row.blocked).length;
  const actionable = phaseRows.filter(row => row.actionable).length;
  return Object.freeze({
    id: phase.id,
    title: phase.title,
    total: phaseRows.length,
    complete,
    blocked,
    actionable,
    percent_complete: percentage(complete, phaseRows.length),
  });
}

/**
 * Generate the canonical completion matrix directly from MASTER_ROADMAP.
 * No status is duplicated or maintained separately: every row is derived from
 * the registry at call time, so the matrix cannot silently drift from it.
 */
export function generateCompletionMatrix({ generatedAt = null } = {}) {
  const validation = validateRoadmap();
  if (!validation.ok) {
    throw Object.assign(new Error('COMPLETION_MATRIX_INVALID_ROADMAP'), {
      code: 'COMPLETION_MATRIX_INVALID_ROADMAP',
      issues: validation.issues,
    });
  }

  const rows = flattenRoadmap().map(buildRow);
  const phases = MASTER_ROADMAP.map(phase => buildPhase(phase, rows));
  const baseSummary = roadmapSummary();
  const blocked = rows.filter(row => row.blocked);
  const actionable = rows.filter(row => row.actionable);
  const verified = rows.filter(row => row.status === ROADMAP_STATUSES.VERIFIED);
  const humanActionsRequired = rows.filter(row => row.status === ROADMAP_STATUSES.BLOCKED_HUMAN);
  const externalBlockers = rows.filter(row => row.status === ROADMAP_STATUSES.BLOCKED_EXTERNAL);
  const core = {
    registry_revision: ROADMAP_REGISTRY_REVISION,
    total: rows.length,
    complete: rows.filter(row => row.complete).length,
    verified: verified.length,
    blocked: blocked.length,
    actionable: actionable.length,
    percent_complete: percentage(rows.filter(row => row.complete).length, rows.length),
    percent_verified: percentage(verified.length, rows.length),
    by_status: Object.freeze({ ...countBy(rows, 'status') }),
    by_priority: Object.freeze({ ...countBy(rows, 'priority') }),
  };

  const matrix = {
    schema: COMPLETION_MATRIX_SCHEMA,
    generated_at: normalizeGeneratedAt(generatedAt),
    source: 'src/roadmap/master-roadmap.js',
    registry_revision: ROADMAP_REGISTRY_REVISION,
    matrix_fingerprint: matrixFingerprint({
      ...core,
      phases,
      rows,
    }),
    summary: Object.freeze({
      ...core,
      registry_percent_complete: baseSummary.percent_complete,
    }),
    phases: Object.freeze(phases),
    rows: Object.freeze(rows),
    blockers: Object.freeze(blocked),
    human_actions_required: Object.freeze(humanActionsRequired),
    external_blockers: Object.freeze(externalBlockers),
    next_work: Object.freeze(
      actionable
        .slice()
        .sort((a, b) => {
          const priorityDelta = Number(a.priority.slice(1)) - Number(b.priority.slice(1));
          return priorityDelta || a.phase_id.localeCompare(b.phase_id) || a.id.localeCompare(b.id);
        }),
    ),
  };

  return Object.freeze(matrix);
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

export function completionMatrixToMarkdown(matrix = generateCompletionMatrix()) {
  if (!matrix || matrix.schema !== COMPLETION_MATRIX_SCHEMA || !Array.isArray(matrix.rows)) {
    throw Object.assign(new Error('COMPLETION_MATRIX_INVALID_INPUT'), {
      code: 'COMPLETION_MATRIX_INVALID_INPUT',
    });
  }

  const lines = [
    '# MEL completion matrix',
    '',
    `Schema: \`${matrix.schema}\``,
    `Source: \`${matrix.source}\``,
    `Generated at: ${matrix.generated_at || 'deterministic/no timestamp'}`,
    '',
    `Progress: **${matrix.summary.complete}/${matrix.summary.total} (${matrix.summary.percent_complete}%)**`,
    `Blocked: **${matrix.summary.blocked}** · Actionable: **${matrix.summary.actionable}**`,
    `Verified: **${matrix.summary.verified}/${matrix.summary.total} (${matrix.summary.percent_verified}%)**`,
    `Registry revision: \`${matrix.registry_revision}\` · Fingerprint: \`${matrix.matrix_fingerprint}\``,
    '',
    '## Phases',
    '',
    '| Phase | Total | Complete | Progress | Blocked | Actionable |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const phase of matrix.phases) {
    lines.push(`| ${escapeCell(`${phase.id} — ${phase.title}`)} | ${phase.total} | ${phase.complete} | ${phase.percent_complete}% | ${phase.blocked} | ${phase.actionable} |`);
  }

  lines.push(
    '',
    '## Human actions required',
    '',
  );
  if (!matrix.human_actions_required.length) lines.push('None.');
  else for (const row of matrix.human_actions_required) {
    lines.push(`- **${escapeCell(row.id)}** — ${escapeCell(row.title)}: ${escapeCell(row.next || 'Action required')}`);
  }

  lines.push(
    '',
    '## External blockers',
    '',
  );
  if (!matrix.external_blockers.length) lines.push('None.');
  else for (const row of matrix.external_blockers) {
    lines.push(`- **${escapeCell(row.id)}** — ${escapeCell(row.title)}: ${escapeCell(row.next || 'External dependency')}`);
  }

  lines.push(
    '',
    '## Items',
    '',
    '| ID | Phase | Priority | Status | Complete | Blocked | Title | Next |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  );

  for (const row of matrix.rows) {
    lines.push(`| ${escapeCell(row.id)} | ${escapeCell(row.phase_id)} | ${escapeCell(row.priority)} | ${escapeCell(row.status)} | ${row.complete ? 'yes' : 'no'} | ${row.blocked ? 'yes' : 'no'} | ${escapeCell(row.title)} | ${escapeCell(row.next)} |`);
  }

  return `${lines.join('\n')}\n`;
}

export function completionMatrixToJson(matrix = generateCompletionMatrix(), { space = 2 } = {}) {
  if (!matrix || matrix.schema !== COMPLETION_MATRIX_SCHEMA) {
    throw Object.assign(new Error('COMPLETION_MATRIX_INVALID_INPUT'), {
      code: 'COMPLETION_MATRIX_INVALID_INPUT',
    });
  }
  const indentation = Math.max(0, Math.min(8, Math.trunc(Number(space) || 0)));
  return `${JSON.stringify(matrix, null, indentation)}\n`;
}
