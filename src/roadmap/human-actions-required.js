import { generateCompletionMatrix } from './completion-matrix.js';

export const HUMAN_ACTIONS_SCHEMA = 'mel.roadmap.human-actions-required.v1';

function priorityRank(value) {
  const n = Number(String(value || '').replace(/^P/, ''));
  return Number.isFinite(n) ? n : 99;
}

export function getHumanActionsRequired() {
  const matrix = generateCompletionMatrix();
  const actions = matrix.human_actions_required
    .map(row => Object.freeze({
      id: row.id,
      phase_id: row.phase_id,
      priority: row.priority,
      title: row.title,
      instruction: row.next || 'Action humaine requise',
    }))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)
      || a.phase_id.localeCompare(b.phase_id)
      || a.id.localeCompare(b.id));

  return Object.freeze({
    ok: true,
    schema: HUMAN_ACTIONS_SCHEMA,
    source: matrix.source,
    registry_revision: matrix.registry_revision,
    matrix_fingerprint: matrix.matrix_fingerprint,
    requires_human_action: actions.length > 0,
    count: actions.length,
    actions: Object.freeze(actions),
  });
}
