const MAX_STEPS = 8;

export function objectiveFromMessage(text) {
  const raw = String(text ?? '').replace(/\s+/g, ' ').trim();
  const spoken = raw.replace(/^(?:ok\s+)?mel[,:]?\s+/i, '');
  if (spoken.length < 8 || spoken.length > 2000) return '';
  const explicit = spoken.match(/^(?:objectif|but|mission)\s*[:\-–]\s*(.+)$/i);
  if (explicit?.[1]) return explicit[1].trim().slice(0, 400);
  if (/^(?:je veux|j'aimerais|fais(?:-moi)?|fait|crée|cree|construis|développe|developpe|prépare|prepare|mets en place)\b/i.test(spoken)) {
    return spoken.slice(0, 400);
  }
  return '';
}

function clauses(text) {
  return text
    .split(/\s*(?:\n+|;\s+| puis | ensuite | et ensuite )\s*/i)
    .map(part => part.trim())
    .filter(part => part.length >= 3);
}

function fallbackSteps(objective) {
  const deliverable = /vector|svg|dessin/i.test(objective) ? 'le dessin vectoriel'
    : /classeur|tableau|sheet|csv/i.test(objective) ? 'le classeur'
    : /\bpdf\b/i.test(objective) ? 'le PDF'
    : /\b(?:doc|document|texte)\b/i.test(objective) ? 'le document'
    : 'le résultat';
  return [
    'Cadrer : ' + objective.slice(0, 140),
    'Produire ' + deliverable,
    'Vérifier que le résultat s’ouvre',
    'Montrer le lien ou le fichier',
  ];
}

export function stepsForObjective(objective) {
  const parts = clauses(objective);
  const labels = (parts.length >= 2 ? parts : fallbackSteps(objective))
    .slice(0, MAX_STEPS)
    .map(label => label.replace(/[.]+$/, '').slice(0, 180));
  return labels.map((label, index) => ({
    id: 's' + (index + 1),
    label,
    state: index === 0 ? 'doing' : 'todo',
  }));
}

export function applyObjectiveStep(steps, { stepId = '', state = '', label = '' } = {}) {
  const next = (Array.isArray(steps) ? steps : []).map(step => ({ ...step }));
  const text = String(label || '').trim().slice(0, 180);
  if (!stepId && text) {
    if (next.length >= MAX_STEPS) return next;
    next.push({ id: 's' + (next.length + 1), label: text, state: 'todo' });
    return next;
  }
  const row = next.find(step => step.id === stepId);
  if (!row || !['todo', 'doing', 'done'].includes(state)) return next;
  if (state === 'doing') {
    for (const step of next) if (step.state === 'doing') step.state = 'todo';
  }
  row.state = state;
  return next;
}
