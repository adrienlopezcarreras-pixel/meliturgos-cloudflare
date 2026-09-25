import { generateCompletionMatrix } from './completion-matrix.js';

export const HUMAN_ACTIONS_SCHEMA = 'mel.roadmap.human-actions-required.v2';

function priorityRank(value) {
  const n = Number(String(value || '').replace(/^P/, ''));
  return Number.isFinite(n) ? n : 99;
}

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function exactAction(row, matrix) {
  return Object.freeze({
    id: row.id,
    phase_id: row.phase_id,
    priority: row.priority,
    status: row.status,
    title: row.title,
    instruction: row.next || 'Action humaine requise',
    resolution_criterion: row.next || 'Mettre à jour la roadmap uniquement après preuve explicite de résolution',
    source: Object.freeze({
      path: matrix.source,
      registry_revision: matrix.registry_revision,
      matrix_fingerprint: matrix.matrix_fingerprint,
      roadmap_item_id: row.id,
      roadmap_status: row.status,
    }),
  });
}

export function validateHumanActionsRequired(report, { matrix = null } = {}) {
  const sourceMatrix = matrix ?? generateCompletionMatrix();
  const issues = [];

  if (!report || report.schema !== HUMAN_ACTIONS_SCHEMA || !Array.isArray(report.actions)) {
    return Object.freeze({ ok: false, issues: Object.freeze(['HUMAN_ACTIONS_INVALID_REPORT']) });
  }

  const expectedRows = sourceMatrix.human_actions_required || [];
  const expectedIds = new Set(expectedRows.map(row => row.id));
  const seen = new Set();

  for (const action of report.actions) {
    const id = clean(action?.id, 200);
    if (!id) issues.push('HUMAN_ACTION_ID_REQUIRED');
    else if (seen.has(id)) issues.push(`HUMAN_ACTION_DUPLICATE:${id}`);
    else seen.add(id);

    if (!expectedIds.has(id)) issues.push(`HUMAN_ACTION_GHOST:${id}`);
    if (action?.status !== 'BLOCKED_HUMAN') issues.push(`HUMAN_ACTION_STATUS_INVALID:${id}`);
    if (!clean(action?.instruction)) issues.push(`HUMAN_ACTION_INSTRUCTION_REQUIRED:${id}`);
    if (!clean(action?.resolution_criterion)) issues.push(`HUMAN_ACTION_RESOLUTION_CRITERION_REQUIRED:${id}`);

    const source = action?.source || {};
    if (source.path !== sourceMatrix.source) issues.push(`HUMAN_ACTION_SOURCE_PATH_MISMATCH:${id}`);
    if (source.registry_revision !== sourceMatrix.registry_revision) issues.push(`HUMAN_ACTION_REVISION_MISMATCH:${id}`);
    if (source.matrix_fingerprint !== sourceMatrix.matrix_fingerprint) issues.push(`HUMAN_ACTION_FINGERPRINT_MISMATCH:${id}`);
    if (source.roadmap_item_id !== id) issues.push(`HUMAN_ACTION_SOURCE_ID_MISMATCH:${id}`);
    if (source.roadmap_status !== 'BLOCKED_HUMAN') issues.push(`HUMAN_ACTION_SOURCE_STATUS_MISMATCH:${id}`);
  }

  for (const id of expectedIds) {
    if (!seen.has(id)) issues.push(`HUMAN_ACTION_MISSING:${id}`);
  }

  if (report.count !== report.actions.length) issues.push('HUMAN_ACTION_COUNT_MISMATCH');
  if (report.requires_human_action !== (report.actions.length > 0)) {
    issues.push('HUMAN_ACTION_REQUIRED_FLAG_MISMATCH');
  }

  return Object.freeze({
    ok: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

export function getHumanActionsRequired({ matrix = null } = {}) {
  const sourceMatrix = matrix ?? generateCompletionMatrix();
  const actions = (sourceMatrix.human_actions_required || [])
    .map(row => exactAction(row, sourceMatrix))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)
      || a.phase_id.localeCompare(b.phase_id)
      || a.id.localeCompare(b.id));

  const report = Object.freeze({
    ok: true,
    schema: HUMAN_ACTIONS_SCHEMA,
    source: sourceMatrix.source,
    registry_revision: sourceMatrix.registry_revision,
    matrix_fingerprint: sourceMatrix.matrix_fingerprint,
    requires_human_action: actions.length > 0,
    count: actions.length,
    actions: Object.freeze(actions),
  });

  const validation = validateHumanActionsRequired(report, { matrix: sourceMatrix });
  if (!validation.ok) {
    const error = new Error('HUMAN_ACTIONS_INCONSISTENT');
    error.code = 'HUMAN_ACTIONS_INCONSISTENT';
    error.issues = validation.issues;
    throw error;
  }
  return report;
}
