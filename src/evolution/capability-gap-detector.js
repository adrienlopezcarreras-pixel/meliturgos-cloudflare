const STOP = new Set(['alors','avec','avoir','cette','comment','dans','des','elle','est','faire','faut','les','mais','mes','mon','pour','plus','peux','peut','que','qui','sans','sur','tout','tous','une','veux','voudrais','the','and','for','with','from','this','that','can','could','would']);

const SYNONYMS = Object.freeze({
  mail: ['email','gmail','outlook'], email: ['mail','gmail','outlook'],
  agenda: ['calendar','calendrier'], calendrier: ['calendar','agenda'],
  code: ['coding','developpement','developper','programme','repository','repo'],
  developpement: ['code','coding','developper','evolution'],
  recherche: ['search','web','research'], web: ['research','recherche','browser','navigateur'],
  fichier: ['file','document'], document: ['file','fichier','pdf'],
  memoire: ['memory','remember','souvenir'],
  voix: ['voice','audio','micro','speech'], audio: ['voice','voix','speech'],
  appareil: ['device','pc','telephone','android','windows'],
  telephone: ['android','mobile','device','appareil'],
  ordinateur: ['pc','windows','device','appareil'],
  image: ['vision','photo','picture'], video: ['multimodal','media'],
  autonomie: ['autonomy','agent','work','evolution'],
});

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function terms(value) {
  const base = normalize(value).split(/[^a-z0-9_.:-]+/).filter(word => word.length >= 3 && !STOP.has(word));
  const expanded = new Set(base);
  for (const word of base) for (const alt of SYNONYMS[word] || []) expanded.add(alt);
  return [...expanded].slice(0, 60);
}

function capabilityText(row) {
  return normalize([row?.id,row?.name,row?.category,row?.description,row?.provider].filter(Boolean).join(' '));
}

function state(row) {
  if (row?.enabled === false) return 'BLOCKED';
  const health = String(row?.health || '').toUpperCase();
  if (health === 'HEALTHY') return 'AVAILABLE';
  if (health === 'UNAVAILABLE') return 'BLOCKED';
  if (health === 'DEGRADED') return 'DEGRADED';
  return 'REGISTERED';
}

export function detectCapabilityGap({ goal, capabilities = [], threshold = 2 } = {}) {
  const objective = String(goal || '').trim();
  if (!objective) {
    const error = new Error('GAP_GOAL_REQUIRED');
    error.code = 'GAP_GOAL_REQUIRED';
    error.status = 400;
    throw error;
  }
  const queryTerms = terms(objective);
  const scored = (Array.isArray(capabilities) ? capabilities : []).map(row => {
    const haystack = capabilityText(row);
    let score = 0;
    const matched = [];
    for (const term of queryTerms) {
      if (haystack.includes(term)) { score += term.includes('.') || term.includes(':') ? 3 : 1; matched.push(term); }
    }
    if (normalize(row?.id) === normalize(objective)) score += 8;
    return { id: String(row?.id || ''), name: String(row?.name || row?.id || ''), category: String(row?.category || ''), state: state(row), score, matched_terms: [...new Set(matched)].slice(0, 12) };
  }).filter(row => row.id && row.score > 0).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 8);

  const best = scored[0] || null;
  const required = Math.max(1, Math.min(6, Number(threshold) || 2));
  const available = scored.filter(row => row.score >= required && row.state === 'AVAILABLE');
  const blocked = scored.filter(row => row.score >= required && ['BLOCKED','DEGRADED'].includes(row.state));

  let classification = 'POSSIBLE_GAP';
  if (available.length) classification = 'MATCHED_AVAILABLE';
  else if (blocked.length) classification = 'MATCHED_BUT_BLOCKED';
  else if (best && best.score > 0) classification = 'AMBIGUOUS';

  return {
    ok: true,
    goal: objective.slice(0, 4000),
    classification,
    confidence: best ? Math.min(1, best.score / Math.max(required * 2, 4)) : 0,
    best_match: best,
    candidates: scored,
    next_action: classification === 'POSSIBLE_GAP'
      ? 'Run evolution.preflight before proposing new code.'
      : classification === 'MATCHED_BUT_BLOCKED'
        ? 'Inspect the blocking dependency before creating new capability code.'
        : classification === 'AMBIGUOUS'
          ? 'Use semantic routing or inspect related capabilities before declaring a gap.'
          : 'Use the existing capability before creating duplicate code.',
    truth_rule: 'Presence is not proof of execution; health/test evidence remains authoritative.',
  };
}
