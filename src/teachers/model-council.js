export { createTeacher } from './teacher-interface.js';

/**
 * Mandatory AI state-of-play council before MEL starts developing or materially
 * modifying a capability/module. The caller supplies the model/provider adapter
 * so this remains provider-neutral and can be backed by .augmentio.
 */
export async function runStateOfPlayCouncil({ goal, context = {}, members = [], ask, minResponses = 2 } = {}) {
  const objective = String(goal || '').trim();
  if (!objective) throw Object.assign(new Error('COUNCIL_GOAL_REQUIRED'), { code: 'COUNCIL_GOAL_REQUIRED', status: 400 });
  if (typeof ask !== 'function') throw Object.assign(new Error('COUNCIL_ADAPTER_REQUIRED'), { code: 'COUNCIL_ADAPTER_REQUIRED', status: 500 });

  const uniqueMembers = [...new Set((Array.isArray(members) ? members : []).filter(Boolean).map(String))];
  if (uniqueMembers.length < minResponses) {
    throw Object.assign(new Error('COUNCIL_NOT_ENOUGH_MEMBERS'), { code: 'COUNCIL_NOT_ENOUGH_MEMBERS', status: 503 });
  }

  const brief = {
    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
    goal: objective,
    context,
    questions: [
      'Que sait-on déjà faire dans le système actuel pour cet objectif ?',
      'Quelles briques, capacités ou modules existants faut-il réutiliser plutôt que recréer ?',
      'Quelles informations manquent avant de développer ?',
      'Quelles architectures ou approches sont possibles ?',
      'Quels sont les risques, dépendances, coûts et régressions possibles ?',
      'Quelle approche recommandes-tu et pourquoi ?',
      'Quels tests et critères permettraient de prouver que la compétence fonctionne réellement ?'
    ]
  };

  const settled = await Promise.allSettled(uniqueMembers.map(async member => ({
    member,
    answer: await ask(member, brief)
  })));

  const responses = settled
    .filter(x => x.status === 'fulfilled')
    .map(x => x.value)
    .filter(x => x && x.answer != null);
  const failures = settled
    .map((x, index) => x.status === 'rejected' ? { member: uniqueMembers[index], error: String(x.reason?.message || x.reason || 'UNKNOWN') } : null)
    .filter(Boolean);

  if (responses.length < minResponses) {
    throw Object.assign(new Error('COUNCIL_INSUFFICIENT_RESPONSES'), {
      code: 'COUNCIL_INSUFFICIENT_RESPONSES', status: 503, responses: responses.length, required: minResponses
    });
  }

  return {
    status: 'COMPLETE',
    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
    goal: objective,
    responses,
    failures,
    evidence_required: true,
    development_allowed: true,
    next: 'SYNTHESIZE_STATE_OF_PLAY_THEN_PLAN'
  };
}

/** Hard gate: generation/coding must not begin before a completed AI council. */
export function requireStateOfPlayCouncil(report) {
  if (!report || report.status !== 'COMPLETE' || report.phase !== 'STATE_OF_PLAY_BEFORE_DEVELOPMENT' || report.development_allowed !== true) {
    throw Object.assign(new Error('AI_STATE_OF_PLAY_REQUIRED_BEFORE_DEVELOPMENT'), { code: 'AI_STATE_OF_PLAY_REQUIRED_BEFORE_DEVELOPMENT', status: 409 });
  }
  return report;
}
