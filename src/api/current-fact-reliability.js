const VATICAN_CURRENT_PONTIFF_INDEX = 'https://www.vatican.va/content/vatican/fr/holy-father.html';

function normalized(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const OFFICEHOLDER_ROLE = /\b(?:pape|pontife|saint[- ]?pere|president|premier ministre|prime minister|chef du gouvernement|chancelier|roi|reine|monarque|maire|gouverneur|pdg|ceo|directeur general|patriarche|dalai[- ]?lama)\b/i;
const OFFICEHOLDER_IDENTITY_ASK = /\b(?:qui est|quel est|quelle est|comment s'appelle|comment se nomme|quel est le nom|quelle est le nom|nom du|nom de la|nom de l'|actuel|actuelle|en fonction|titulaire|who is|current)\b/i;
const POPE_ROLE = /\b(?:pape|pontife|saint[- ]?pere)\b/i;

export function inferCurrentFactVerificationPolicy(text) {
  const value = normalized(text);
  if (!value || !OFFICEHOLDER_ROLE.test(value) || !OFFICEHOLDER_IDENTITY_ASK.test(value)) return null;

  const pope = POPE_ROLE.test(value);
  return Object.freeze({
    kind: 'CURRENT_OFFICEHOLDER',
    strict: true,
    role: pope ? 'pope' : 'officeholder',
    preferred_domains: pope ? ['vatican.va'] : [],
    official_seed_urls: pope ? [VATICAN_CURRENT_PONTIFF_INDEX] : [],
    reason: 'MUTABLE_CURRENT_IDENTITY_REQUIRES_FRESH_EVIDENCE',
  });
}

export function hasAuthoritativeCurrentFactEvidence(result, policy = null) {
  const sources = Array.isArray(result?.sources) ? result.sources : [];
  if (!sources.length) return false;

  const preferred = new Set((policy?.preferred_domains || []).map(value => String(value).toLowerCase()));
  return sources.some(source => {
    const kind = String(source?.source_kind || '').toUpperCase();
    const band = String(source?.quality?.band || '').toUpperCase();
    let host = '';
    try { host = new URL(String(source?.url || '')).hostname.toLowerCase(); } catch {}
    const preferredHost = [...preferred].some(domain => host === domain || host.endsWith('.' + domain));
    return kind === 'OFFICIAL_SEED'
      || band === 'HIGH_PROVENANCE'
      || band === 'DIRECT_EVIDENCE'
      || preferredHost;
  });
}

export function currentFactReliabilityInstruction(policy) {
  if (!policy?.strict) return '';
  return [
    'FAIT ACTUEL STRICT : la question porte sur une identité ou fonction susceptible de changer.',
    'Tu dois répondre uniquement à partir du TOOL_RESULT web.research de cette requête et non de ta mémoire de modèle.',
    'Privilégie la source officielle/directe, donne le nom actuel sans extrapoler et indique brièvement la source.',
    'Si la preuve courante est absente, contradictoire ou insuffisante, n’invente aucun nom et dis que le fait ne peut pas être confirmé maintenant.',
  ].join(' ');
}

export const CURRENT_FACT_RELIABILITY = Object.freeze({
  vatican_current_pontiff_index: VATICAN_CURRENT_PONTIFF_INDEX,
});
