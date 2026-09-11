import { classifySemanticOwnerIntent } from './semantic-intent.js';

export function isEvolutionDevelopmentIntent(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  const action = /\b(?:d[ée]veloppe(?:r)?|ajoute(?:r)?|cr[ée]e(?:r)?|construis|construire|impl[ée]mente(?:r)?|apprends?|upgrade|am[ée]liore(?:r)?|modifie(?:r)?|change(?:r)?|remplace(?:r)?|supprime(?:r)?|enl[eè]ve(?:r)?|retire(?:r)?|corrige(?:r)?|r[ée]pare(?:r)?|refactor(?:e|er)?|r[ée][ée]cris|r[ée][ée]crire|[ée]dite(?:r)?|int[eè]gre(?:r)?|branche(?:r)?|raccorde(?:r)?|stylise(?:r)?|d[ée]core(?:r)?|mets?\s+[àa]\s+jour|build|develop|implement|add|modify|change|replace|remove|delete|fix|repair|refactor|rewrite|edit|integrate|wire)\b/i.test(value);

  const target = /\b(?:comp[ée]tence|capacit[ée]|module|outil|int[ée]gration|connecteur|plugin|skill|capability|connector|tool|interface|ui|avatar|th[eè]me|design|style|css|html|javascript|js|code|source|fichier|page|frontend|backend|api|route|worker|chat|prompt|roadmap|feuille\s+de\s+route|test|tests?|bouton|menu|panneau|composant|component|layout)\b/i.test(value);

  return action && target;
}

export function inferAutonomyControlIntent(text) {
  const value = String(text || '').trim();
  if (!value) return null;

  const autonomyDomain = /\b(autonom(?:e|ie|isation)|auto[- ]?d[ée]veloppement|self[- ]?development|feuille\s+de\s+route|roadmap|d[ée]veloppement\s+(?:de\s+)?(?:mel|ton|tes|du\s+programme)|programme\s+mel)\b/i.test(value);
  if (!autonomyDomain) return null;

  const asksStatus = /\b(o[uù]\s+en\s+(?:es|est|sommes)|statut|status|[ée]tat|pr[êe]te?|ready|bloqu[ée]e?|reste|avancement|progression|niveau)\b/i.test(value)
    || /\b(es[- ]tu|est[- ]elle)\b[^.!?]{0,80}\b(autonome|pr[êe]te?|capable)\b/i.test(value);
  if (asksStatus) return { id: 'autonomy.status', input: {} };

  const asksAdvance = /\b(continue|continuer|reprends?|reprendre|avance|avancer|poursuis|poursuivre|travaille|travailler|encha[iî]ne|encha[iî]ner|relance|relancer)\b/i.test(value);
  if (asksAdvance) return { id: 'autonomy.tick', input: {} };

  return null;
}

export function inferCapabilityInspectionIntent(text) {
  const value = String(text || '').trim();
  if (!value) return null;

  const self = /\b(?:mel|toi|tu|tes|ton|ta|elle|ses)\b/i.test(value);
  const capabilityDomain = /\b(?:capacit[ée]s?|comp[ée]tences?|outils?|modules?|fonctions?|fonctionnalit[ée]s?|skills?|capabilities?|ce\s+que\s+tu\s+sais\s+faire|que\s+sais[- ]?tu\s+faire|que\s+peux[- ]?tu\s+faire)\b/i.test(value);
  const asksInventory = /\b(?:quelles?|liste|inventaire|montre|affiche|connais|connaitre|sais|peux|fonctionne|marchent?|actives?|disponibles?|r[ée]elles?|[ée]tat|status|statut|audit|teste?|tester|v[ée]rifie|v[ée]rifier)\b/i.test(value);
  if (!(capabilityDomain && (self || /\btu\b/i.test(value)) && asksInventory)) return null;

  const deep = /\b(?:teste|tester|testes|v[ée]rifie|v[ée]rifier|audit\s+complet|audit\s+profond|r[ée]ellement|pour\s+de\s+vrai|smoke|ex[ée]cute|ex[ée]cuter)\b/i.test(value);
  return { id: 'capability.audit', input: { deep } };
}

export function inferWebResearchIntent(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (/\b(?:mail|email|gmail|outlook|agenda|calendrier|drive|onedrive|fichier(?:s)?\s+priv[ée]s?|mes\s+fichiers|mes\s+mails)\b/i.test(value)) return null;

  const explicitWeb = /\b(?:internet|web|en\s+ligne|online|sur\s+le\s+net|sources?\s+web)\b/i.test(value);
  const explicitAction = /\b(?:cherche|chercher|recherche|rechercher|regarde|regarder|v[ée]rifie|v[ée]rifier|trouve|trouver|consulte|consulter|search|look\s*up|check|find)\b/i.test(value);
  const freshness = /\b(?:actualit[ée]s?|news|derni[eè]res?\s+(?:infos?|nouvelles?|donn[ée]es?)|latest|r[ée]cent(?:e|es|s)?|aujourd['’]hui|today|en\s+ce\s+moment|current)\b/i.test(value);
  if (!((explicitAction && explicitWeb) || (explicitAction && freshness) || (explicitWeb && freshness))) return null;

  return { id: 'web.research', input: { query: value.slice(0, 2000), depth: 2 } };
}

export function inferCodeIntegrityIntent(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const codeDomain = /\b(?:code|source|sources|repo|repository|d[ée]p[ôo]t|github|branche|branch)\b/i.test(value);
  const integrityAction = /\b(?:int[ée]grit[ée]|integrity|propre|sain|coh[ée]rent|v[ée]rifie|v[ée]rifier|contr[ôo]le|contr[ôo]ler|check)\b/i.test(value);
  return codeDomain && integrityAction ? { id: 'code.integrity', input: {} } : null;
}

export function inferOpenWorkIntent(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const workDomain = /\b(?:travaux?|t[âa]ches?|jobs?|work|missions?|boucles?)\b/i.test(value);
  const asksOpen = /\b(?:ouverts?|en\s+cours|en\s+attente|inachev[ée]s?|restent?|reprendre|reprends?|resume|pending|running|waiting)\b/i.test(value);
  if (!(workDomain && asksOpen)) return null;
  const limitMatch = value.match(/\b(\d{1,3})\b/);
  const limit = Math.max(1, Math.min(100, Number(limitMatch?.[1]) || 20));
  return { id: 'work.open', input: { limit } };
}

export function inferModuleProposalIntent(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  const proposal = /\b(?:propose|proposer|pr[ée]pare|pr[ée]parer|imagine|imaginer|sp[ée]cifie|sp[ée]cifier|draft)\b/i.test(value);
  const moduleDomain = /\b(?:module|skill|comp[ée]tence|capacit[ée]|plugin)\b/i.test(value);
  const directCoding = /\b(?:d[ée]veloppe|impl[ée]mente|code|programme|[ée]cris\s+le\s+code|build)\b/i.test(value);
  if (!(proposal && moduleDomain) || directCoding) return null;
  return { id: 'evolution.module.propose', input: { goal: value.slice(0, 4000) } };
}

function enqueueCapability(goal, body, requestKey) {
  return {
    id: 'evolution.enqueue',
    input: {
      goal: String(goal || '').trim().slice(0, 4000),
      conversationId: String(body.conversation_id ?? body.conversationId ?? '').slice(0, 200),
      requestKey: String(requestKey || '').slice(0, 200),
    }
  };
}

function routeDeterministic(body, route, intent) {
  body.capability = route;
  body.intent_routing = { mode: 'deterministic', intent, confidence: 1 };
}

/**
 * Owner requests become durable supervised jobs or explicit read-only runtime
 * capabilities. Fast deterministic rules handle obvious commands; a
 * zero-added-cost FAST semantic classifier handles natural, elliptical and
 * contextual formulations supplied by the active UI.
 */
export async function injectEvolutionPreflightCapability(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat' || request.method !== 'POST') return request;
  if (!(request.headers.get('content-type') || '').includes('application/json')) return request;
  let body;
  try { body = await request.clone().json(); }
  catch { return request; }
  if (!body || typeof body !== 'object' || body.capability?.id) return request;
  const text = String(body.text ?? body.message ?? body.prompt ?? '').trim();
  if (!text) return request;

  const requestKey = body.client_message_id ?? body.message_id ?? body.request_id ?? body.id ?? '';

  if (isEvolutionDevelopmentIntent(text)) {
    body.capability = enqueueCapability(text, body, requestKey);
  } else {
    const autonomy = inferAutonomyControlIntent(text);
    const capabilityInspection = autonomy ? null : inferCapabilityInspectionIntent(text);
    const codeIntegrity = autonomy || capabilityInspection ? null : inferCodeIntegrityIntent(text);
    const openWork = autonomy || capabilityInspection || codeIntegrity ? null : inferOpenWorkIntent(text);
    const moduleProposal = autonomy || capabilityInspection || codeIntegrity || openWork ? null : inferModuleProposalIntent(text);
    const webResearch = autonomy || capabilityInspection || codeIntegrity || openWork || moduleProposal ? null : inferWebResearchIntent(text);

    if (autonomy) routeDeterministic(body, autonomy, 'AUTONOMY_CONTROL');
    else if (capabilityInspection) routeDeterministic(body, capabilityInspection, 'CAPABILITY_STATUS');
    else if (codeIntegrity) routeDeterministic(body, codeIntegrity, 'CODE_INTEGRITY');
    else if (openWork) routeDeterministic(body, openWork, 'OPEN_WORK');
    else if (moduleProposal) routeDeterministic(body, moduleProposal, 'MODULE_PROPOSAL');
    else if (webResearch) routeDeterministic(body, webResearch, 'WEB_RESEARCH');
    else {
      const semantic = await classifySemanticOwnerIntent({
        text,
        context: String(body.intent_context || '').slice(-8000),
      });
      if (!semantic || semantic.intent === 'NONE') return request;
      if (semantic.intent === 'DEVELOPMENT_REQUEST') {
        body.capability = enqueueCapability(semantic.resolvedGoal || text, body, requestKey);
      } else if (semantic.intent === 'AUTONOMY_ADVANCE') {
        body.capability = { id: 'autonomy.tick', input: {} };
      } else if (semantic.intent === 'AUTONOMY_STATUS') {
        body.capability = { id: 'autonomy.status', input: {} };
      } else if (semantic.intent === 'CAPABILITY_STATUS') {
        body.capability = { id: 'capability.audit', input: { deep: /\b(?:teste|test|v[ée]rifie|audit\s+complet|audit\s+profond|r[ée]ellement|smoke|ex[ée]cute)\b/i.test(text) } };
      } else if (semantic.intent === 'WEB_RESEARCH') {
        body.capability = { id: 'web.research', input: { query: String(semantic.resolvedQuery || text).slice(0, 2000), depth: 2 } };
      } else {
        return request;
      }
      body.intent_routing = {
        mode: 'semantic',
        intent: semantic.intent,
        confidence: semantic.confidence,
      };
    }
  }

  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(body), redirect: request.redirect });
}
