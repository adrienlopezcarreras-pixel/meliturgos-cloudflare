const STOP = new Set([
  'alors','avec','avant','avoir','cela','cette','comme','dans','depuis','elle','elles','encore','entre','etre','faire','faut','mais','meme',
  'nous','pour','plus','quand','sans','sera','sont','tout','toute','toutes','tous','vous','votre','vos','quel','quelle','quoi','comment',
  'peux','peut','dois','doit','vais','fait','dire','moi','mon','mes','ton','tes','notre','leur','leurs','une','des','les','aux','sur',
  'reponse','reponses','mel','adrien','maintenant','encore'
]);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function tokens(value) {
  return [...new Set((normalize(value).match(/[a-z0-9]{4,}/g) || []).filter(token => !STOP.has(token)))];
}

const TOPIC_FAMILIES = [
  new Set(['communication','reponse','reponses','coherence','contradiction','sujet','contexte','memoire','capacite','capacites','conversation','comprehension','perimetre','historique']),
  new Set(['code','depot','repo','repository','github','branche','branch','commit','sha','fichier','source']),
  new Set(['deploy','deploiement','production','preview','release','ci','workflow','test']),
  new Set(['travail','travaux','job','jobs','tache','taches','autonomie','roadmap','processus']),
];

function familyOverlap(anchor, response) {
  const a = new Set(tokens(anchor));
  const r = new Set(tokens(response));
  for (const family of TOPIC_FAMILIES) {
    const anchorInFamily = [...family].some(token => a.has(token));
    if (!anchorInFamily) continue;
    if ([...family].some(token => r.has(token))) return true;
  }
  return false;
}

function overlap(anchor, response) {
  const a = tokens(anchor);
  if (!a.length) return { ratio:1, shared:[], anchor_tokens:a, family_match:true };
  const r = new Set(tokens(response));
  const shared = a.filter(token => r.has(token));
  return { ratio:shared.length / a.length, shared, anchor_tokens:a, family_match:familyOverlap(anchor, response) };
}

function claimsDone(text) {
  return /\b(?:c['’]est\s+fait|c['’]est\s+termin[ée]|j['’]ai\s+termin[ée]?|j['’]ai\s+d[ée]ploy[ée]|d[ée]ploy[ée]\s+en\s+prod(?:uction)?|termin[ée]|fini)\b/i.test(String(text || ''));
}

function deniesCode(text) {
  return /\b(?:je\s+n['’]?ai\s+pas\s+acc[eè]s|je\s+ne\s+peux\s+pas\s+(?:acc[eè]der|voir|lire|inspecter))\b/i.test(String(text || ''));
}

function formalAddress(text) {
  return /\b(?:vous|votre|vos)\b/i.test(String(text || ''));
}

function actionOnTopic(response, topic) {
  const n = normalize(response);
  const t = normalize(topic);
  if (!t || !n.includes(t)) return false;
  const i = n.indexOf(t);
  const around = n.slice(Math.max(0, i - 100), Math.min(n.length, i + t.length + 100));
  return /\b(?:je\s+(?:travaille|modifie|corrige|deploie|touche|ouvre|analyse)|j[' ]ai\s+(?:modifie|corrige|deploie|touche)|on\s+(?:travaille|modifie|corrige)|je\s+m[' ]occupe)\b/.test(around)
    && !/\b(?:je\s+ne\s+touche\s+pas|je\s+ne\s+m[' ]occupe\s+pas|sans\s+toucher|hors\s+perimetre|exclu)\b/.test(around);
}

function recentAssistantClaims(recent = []) {
  const claims = [];
  for (const row of (Array.isArray(recent) ? recent : []).slice(-12)) {
    if (String(row?.role || '').toLowerCase() !== 'assistant') continue;
    const text = String(row?.content || '');
    if (deniesCode(text)) claims.push({ kind:'CODE_ACCESS', value:'DENIED', text:clean(text).slice(0,240) });
    else if (/\bj['’]ai\s+acc[eè]s\b.*\b(?:code|d[ée]p[ôo]t|repo)\b/i.test(text)) claims.push({ kind:'CODE_ACCESS', value:'AVAILABLE', text:clean(text).slice(0,240) });
    if (claimsDone(text)) claims.push({ kind:'COMPLETION', value:'DONE', text:clean(text).slice(0,240) });
    else if (/\b(?:pas\s+encore|en\s+cours|non\s+termin[ée]|pas\s+d[ée]ploy[ée])\b/i.test(text)) claims.push({ kind:'COMPLETION', value:'NOT_DONE', text:clean(text).slice(0,240) });
  }
  return claims.slice(-8);
}

export function assessResponseQuality({
  userText='',
  responseText='',
  focus=null,
  codeAccess=null,
  developmentQueued=null,
  toolResults=[],
  recent=[],
} = {}) {
  const response = clean(responseText);
  const issues = [];
  const anchor = clean(focus?.anchor || userText);
  const relevance = overlap(anchor, response);

  if (!response) issues.push({ code:'EMPTY_RESPONSE', severity:'high' });
  if (/^(?:en\s+tant\s+qu['’](?:ia|intelligence\s+artificielle)|je\s+dois\s+pr[ée]ciser)/i.test(response)) {
    issues.push({ code:'META_PREAMBLE', severity:'medium' });
  }
  if (formalAddress(response)) issues.push({ code:'FORMAL_ADDRESS', severity:'low' });

  const minimumOffTopicLength = /^(?:ok|go|maj|avance|continue|reprends?|fais[- ]?le|vas[- ]?y|poursuis|termine|finis|corrige|am[ée]liore)/i.test(clean(userText))
    ? 45
    : 90;
  if (
    response.length >= minimumOffTopicLength
    && relevance.anchor_tokens.length >= 4
    && relevance.shared.length === 0
    && relevance.family_match !== true
    && !focus?.needs_clarification
  ) {
    issues.push({ code:'POSSIBLE_OFF_TOPIC', severity:'high', anchor:anchor.slice(0,300) });
  }

  for (const topic of Array.isArray(focus?.excluded_topics) ? focus.excluded_topics : []) {
    if (actionOnTopic(response, topic)) {
      issues.push({ code:'EXCLUDED_SCOPE_ACTION', severity:'high', topic:String(topic).slice(0,120) });
    }
  }

  if (codeAccess?.available === true && deniesCode(response)) {
    issues.push({ code:'CODE_ACCESS_CONTRADICTION', severity:'high' });
  }

  if (developmentQueued && claimsDone(response)) {
    const status = String(developmentQueued.status || '').toUpperCase();
    if (!['COMPLETED','DONE','SUCCEEDED'].includes(status)) {
      issues.push({ code:'UNSUPPORTED_COMPLETION', severity:'high', status });
    }
  }

  const failedTools = (Array.isArray(toolResults) ? toolResults : []).filter(row => row?.status === 'FAILED');
  if (failedTools.length && /\b(?:je\s+n['’]?ai\s+pas\s+acc[eè]s|je\s+ne\s+peux\s+pas)\b/i.test(response)) {
    issues.push({ code:'GLOBALIZED_TOOL_FAILURE', severity:'high', capability:String(failedTools.at(-1)?.capability || '') });
  }

  const previousClaims = recentAssistantClaims(recent);
  const latestCode = [...previousClaims].reverse().find(row => row.kind === 'CODE_ACCESS');
  if (latestCode && codeAccess?.available === true && latestCode.value === 'DENIED' && !deniesCode(response)) {
    issues.push({ code:'RECENT_CODE_CLAIM_CORRECTED_BY_RUNTIME', severity:'info' });
  }

  return {
    ok: !issues.some(issue => issue.severity === 'high'),
    issues,
    relevance:{
      anchor_tokens:relevance.anchor_tokens.length,
      shared_tokens:relevance.shared.length,
      ratio:Number(relevance.ratio.toFixed(3)),
      family_match:relevance.family_match === true,
    },
  };
}

async function ensureTable(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS mel_response_quality_events (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_excerpt TEXT NOT NULL, response_excerpt TEXT NOT NULL, focus_json TEXT NOT NULL DEFAULT '{}', issues_json TEXT NOT NULL DEFAULT '[]', relevance_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)").run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_response_quality_events_conversation ON mel_response_quality_events(conversation_id, created_at)').run();
}

export async function persistResponseQualityEvent(env = {}, {
  conversationId='',
  userText='',
  responseText='',
  focus=null,
  assessment=null,
} = {}) {
  if (!env?.DB || !assessment || !Array.isArray(assessment.issues) || !assessment.issues.length) return false;
  try {
    await ensureTable(env.DB);
    await env.DB.prepare('INSERT INTO mel_response_quality_events(id,conversation_id,user_excerpt,response_excerpt,focus_json,issues_json,relevance_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(
        crypto.randomUUID(),
        String(conversationId || '').slice(0,200),
        clean(userText).slice(0,1000),
        clean(responseText).slice(0,2000),
        JSON.stringify(focus || {}),
        JSON.stringify(assessment.issues.slice(0,20)),
        JSON.stringify(assessment.relevance || {}),
        Date.now(),
      )
      .run();
    return true;
  } catch {
    return false;
  }
}


export function enforceResponseQuality({ responseText='', userText='', focus=null, assessment=null } = {}) {
  const original = clean(responseText);
  const issues = Array.isArray(assessment?.issues) ? assessment.issues : [];
  const severe = issues.filter(issue => issue?.severity === 'high').map(issue => String(issue.code || ''));
  if (!severe.length) return original;

  const scopeFailure = severe.includes('POSSIBLE_OFF_TOPIC') || severe.includes('EXCLUDED_SCOPE_ACTION');
  if (!scopeFailure) return original;

  const anchor = clean(focus?.anchor || userText);
  const operational = /^(?:ok|go|maj|avance|continue|reprends?|fais[- ]?le|vas[- ]?y|poursuis|termine|finis|corrige|am[ée]liore)\b/i.test(clean(userText));
  if (anchor) {
    return operational
      ? 'Je reste uniquement sur ce périmètre : « ' + anchor.slice(0, 500) + ' ». La réponse générée dérivait hors sujet, donc je l’ai bloquée au lieu de changer de chantier.'
      : 'Je reste sur ta demande : « ' + anchor.slice(0, 500) + ' ». La réponse générée dérivait hors sujet, donc je ne te l’envoie pas comme si elle répondait correctement à ta question.';
  }
  return 'Je n’ai pas de référent fiable pour cette réponse et je préfère demander une précision plutôt que partir sur le mauvais sujet.';
}
