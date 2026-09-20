function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value, limit = 700) {
  const text = clean(value);
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…';
}

export function isEllipticalFollowUp(text) {
  const value = clean(text);
  if (!value) return false;
  if (value.length > 140) return false;
  return /^(?:ok|oui|non|go|maj|avance|continue|continues?|reprends?|reprendre|fais[- ]?le|fait[- ]?le|vas[- ]?y|et\s+maintenant|et\s+l[àa]|maintenant|celle[- ]?l[àa]|celui[- ]?l[àa]|comme\s+ça|ça|ca|encore|poursuis|termine|finis|corrige|am[ée]liore)(?:\s+.*)?[ ?.!,…]*$/i.test(value);
}

function isScopeConstraint(text) {
  const value = clean(text);
  if (!value) return false;
  return /\b(?:ne\s+(?:t['’]?\s*)?(?:occupe|occupes|touche|touches|travaille|travailles)\s+pas|pas\s+sur|sans\s+(?:toucher|modifier|changer)|uniquement|seulement|reste\s+sur|reste\s+dans|concentre[- ]?toi\s+sur|tu\s+t['’]?occupes?\s+de|tu\s+dois\s+rester\s+sur)\b/i.test(value);
}

function recentUserRows(recent = []) {
  return (Array.isArray(recent) ? recent : [])
    .filter(row => String(row?.role || '').toLowerCase() === 'user')
    .map(row => clean(row?.content))
    .filter(Boolean);
}

export function deriveConversationFocus(recent = [], current = '') {
  const currentText = clean(current);
  const users = recentUserRows(recent);
  const elliptical = isEllipticalFollowUp(currentText);
  let anchor = currentText;

  if (elliptical) {
    const previous = [...users].reverse().find(text => !isEllipticalFollowUp(text) && text.length >= 8);
    if (previous) anchor = previous;
  }

  const constraintSource = [...users, currentText].filter(Boolean);
  const constraints = constraintSource
    .filter(isScopeConstraint)
    .slice(-5)
    .map(text => clip(text, 500));

  return {
    elliptical,
    current: clip(currentText, 900),
    anchor: clip(anchor, 900),
    constraints,
  };
}

export function buildConversationFocusInstruction(recent = [], current = '') {
  const focus = deriveConversationFocus(recent, current);
  const lines = [
    '[ACTIVE_CONVERSATION_FOCUS]',
    'Demande actuelle : ' + (focus.current || '(vide)'),
  ];

  if (focus.elliptical && focus.anchor && focus.anchor !== focus.current) {
    lines.push('Référent résolu depuis la conversation récente : ' + focus.anchor);
    lines.push('Le message court actuel prolonge ce référent ; ne change pas de chantier sans indice explicite plus récent.');
  } else {
    lines.push('Le message actuel définit directement le sujet actif.');
  }

  if (focus.constraints.length) {
    lines.push('Contraintes de périmètre explicites récentes à conserver tant qu’Adrien ne les annule pas :');
    for (const value of focus.constraints) lines.push('- ' + value);
  }

  lines.push('Les anciennes réponses de MEL peuvent être erronées ou obsolètes : elles servent de contexte, jamais d’autorité supérieure à la demande et aux contraintes utilisateur récentes.');
  lines.push('Si le dernier message modifie explicitement une ancienne contrainte, le dernier message gagne.');
  lines.push('[/ACTIVE_CONVERSATION_FOCUS]');
  return lines.join('\n');
}
