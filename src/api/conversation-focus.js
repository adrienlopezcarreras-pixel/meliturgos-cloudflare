function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}


function normalizeTopicPhrase(value) {
  let topic = clean(value).replace(/[.,;:!?]+$/g, '').trim();
  topic = topic.replace(/^(?:(?:de\s+)?(?:le|la|les|un|une|des|du)|de\s+l['’]|l['’])\s*/i, '').trim();
  return normalize(topic).replace(/\s+/g, ' ').slice(0, 120);
}

const TOPIC_END = '(?=\\s*(?:[,;.!?]|$|\\b(?:mais|et|puis|sauf|alors|ensuite|par\\s+contre)\\b))';
const TOPIC_PHRASE = '([A-Za-zÀ-ÿ0-9_.-]+(?:\\s+[A-Za-zÀ-ÿ0-9_.-]+){0,5})';

function topicPattern(prefix) {
  return new RegExp(prefix + '\\s+' + TOPIC_PHRASE + TOPIC_END, 'ig');
}

function clip(value, limit = 700) {
  const text = clean(value);
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…';
}

const SHORT_FOLLOW_UP = /^(?:ok|oui|non|go|maj|avance|continue|continues?|reprends?|reprendre|fais[- ]?le|fait[- ]?le|vas[- ]?y|et\s+maintenant|et\s+l[àa]|maintenant|celle[- ]?l[àa]|celui[- ]?l[àa]|comme\s+ça|comme\s+ca|ça|ca|encore|poursuis|termine|finis|ça\s+avance|ca\s+avance|c['’]?est\s+bon|c['’]?est\s+fait|c['’]?est\s+fini|fini|termin[ée]|ça\s+marche|ca\s+marche|ça\s+fonctionne|ca\s+fonctionne|o[uù]\s+en\s+es[- ]?tu|tu\s+as\s+fini|tu\s+as\s+termin[ée])[ ?.!,…]*$/i;
const BOUNDED_FOLLOW_UP = /^(?:avance|continue|continues?|reprends?|poursuis|corrige|am[ée]liore|termine|finis)(?:\s+(?:encore|ça|ca|cela|ceci|l[àa][- ]?dessus|la[- ]?dessus|dessus|comme\s+ça|comme\s+ca|le|la|les))?[ ?.!,…]*$/i;

export function isEllipticalFollowUp(text) {
  const value = clean(text);
  if (!value || value.length > 80) return false;
  return SHORT_FOLLOW_UP.test(value) || BOUNDED_FOLLOW_UP.test(value);
}

export function isScopeConstraint(text) {
  const value = clean(text);
  if (!value) return false;
  return /\b(?:ne\s+(?:t['’]?\s*)?(?:occupe|occupes|touche|touches|travaille|travailles)\s+pas|pas\s+sur|sans\s+(?:toucher|modifier|changer)|uniquement|seulement|reste\s+sur|reste\s+dans|concentre[- ]?toi\s+sur|tu\s+t['’]?occupes?\s+de|tu\s+dois\s+rester\s+sur|mon\s+p[ée]rim[eè]tre|ton\s+p[ée]rim[eè]tre)\b/i.test(value);
}

function permissionReset(text) {
  const value = normalize(text);
  return /\b(?:tu peux maintenant|tu peux aussi|desormais tu peux|finalement tu peux|annule|retire|oublie la contrainte|leve la contrainte)\b/.test(value);
}

function topicCandidates(text) {
  const value = clean(text);
  const found = [];
  const patterns = [
    topicPattern("(?:ne\\s+(?:t['’]?\\s*)?(?:occupe|occupes|touche|touches|travaille|travailles)\\s+pas(?:\\s+(?:de|sur|[àa]))?|pas\\s+sur|sans\\s+(?:toucher|modifier|changer)(?:\\s+[àa])?)"),
    topicPattern("(?:uniquement|seulement|reste\\s+sur|concentre[- ]?toi\\s+sur)"),
    topicPattern("(?:toucher|modifier|changer|travailler\\s+sur|t['’]?occuper\\s+de)(?:\\s+(?:[àa]|de|sur))?"),
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const topic = normalizeTopicPhrase(match[1]);
      if (topic) found.push(topic);
    }
  }
  return [...new Set(found.filter(Boolean))].slice(0, 12);
}

function excludedTopics(text) {
  const value = clean(text);
  if (!value) return [];
  const out = [];
  const patterns = [
    topicPattern("ne\\s+(?:t['’]?\\s*)?(?:occupe|occupes|touche|touches|travaille|travailles)\\s+pas(?:\\s+(?:de|sur|[àa]))?"),
    topicPattern("pas\\s+sur"),
    topicPattern("sans\\s+(?:toucher|modifier|changer)(?:\\s+[àa])?"),
  ];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const topic = normalizeTopicPhrase(match[1]);
      if (topic) out.push(topic);
    }
  }
  return [...new Set(out)].slice(0, 12);
}

function recentUserRows(recent = []) {
  return (Array.isArray(recent) ? recent : [])
    .filter(row => String(row?.role || '').toLowerCase() === 'user')
    .map(row => clean(row?.content))
    .filter(Boolean);
}

function deDupeRecent(values, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const value of [...values].reverse()) {
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clip(value, 500));
    if (out.length >= limit) break;
  }
  return out.reverse();
}

export function deriveConversationFocus(recent = [], current = '', persisted = null) {
  const currentText = clean(current);
  const users = recentUserRows(recent);
  const elliptical = isEllipticalFollowUp(currentText);
  const persistedAnchor = clean(persisted?.anchor || '');
  let anchor = currentText;
  let anchorSource = 'current';

  if (elliptical) {
    const previous = [...users].reverse().find(text => !isEllipticalFollowUp(text) && text.length >= 8);
    if (previous) {
      anchor = previous;
      anchorSource = 'recent';
    } else if (persistedAnchor) {
      anchor = persistedAnchor;
      anchorSource = 'persisted';
    } else {
      anchor = '';
      anchorSource = 'missing';
    }
  }

  const persistedConstraints = Array.isArray(persisted?.constraints) ? persisted.constraints.map(clean).filter(Boolean) : [];
  const currentConstraints = [...users, currentText].filter(Boolean).filter(isScopeConstraint);
  let constraints = deDupeRecent([...persistedConstraints, ...currentConstraints], 8);

  const persistedExcluded = Array.isArray(persisted?.excluded_topics) ? persisted.excluded_topics.map(normalize).filter(Boolean) : [];
  let excluded = [...new Set([...persistedExcluded, ...currentConstraints.flatMap(excludedTopics)])];

  if (permissionReset(currentText)) {
    const mentioned = topicCandidates(currentText);
    if (mentioned.length) {
      excluded = excluded.filter(topic => !mentioned.some(item => item === topic || item.includes(topic) || topic.includes(item)));
      constraints = constraints.filter(value => !mentioned.some(item => normalize(value).includes(item)));
    } else {
      constraints = currentConstraints.slice(-5);
      excluded = currentConstraints.flatMap(excludedTopics);
    }
  }

  return {
    elliptical,
    current: clip(currentText, 900),
    anchor: clip(anchor, 900),
    anchor_source: anchorSource,
    constraints,
    excluded_topics: [...new Set(excluded)].slice(-12),
    needs_clarification: elliptical && !anchor,
  };
}

export function buildConversationFocusInstruction(recent = [], current = '', persisted = null) {
  const focus = deriveConversationFocus(recent, current, persisted);
  const lines = [
    '[ACTIVE_CONVERSATION_FOCUS]',
    'Demande actuelle : ' + (focus.current || '(vide)'),
  ];

  if (focus.needs_clarification) {
    lines.push('Le message actuel est elliptique mais aucun référent récent ou persistant fiable n’est disponible.');
    lines.push('Demande une clarification courte au lieu de choisir un ancien sujet.');
  } else if (focus.elliptical && focus.anchor && focus.anchor !== focus.current) {
    lines.push('Référent résolu depuis ' + focus.anchor_source + ' : ' + focus.anchor);
    lines.push('Le message court actuel prolonge ce référent ; ne change pas de chantier sans indice explicite plus récent.');
  } else {
    lines.push('Le message actuel définit directement le sujet actif.');
  }

  if (focus.constraints.length) {
    lines.push('Contraintes de périmètre explicites récentes à conserver tant qu’Adrien ne les annule pas :');
    for (const value of focus.constraints) lines.push('- ' + value);
  }

  if (focus.excluded_topics.length) {
    lines.push('Sujets explicitement exclus du périmètre actif : ' + focus.excluded_topics.join(', ') + '.');
  }

  lines.push('Les anciennes réponses de MEL peuvent être erronées ou obsolètes : elles servent de contexte, jamais d’autorité supérieure à la demande et aux contraintes utilisateur récentes.');
  lines.push('Si le dernier message modifie explicitement une ancienne contrainte, le dernier message gagne.');
  lines.push('[/ACTIVE_CONVERSATION_FOCUS]');
  return lines.join('\n');
}
