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

/**
 * Owner development requests become durable supervised-autonomy jobs rather
 * than one-shot planning answers. Fast deterministic rules handle obvious
 * commands; a zero-added-cost FAST semantic classifier handles natural,
 * elliptical and contextual formulations supplied by the active UI.
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
    if (autonomy) {
      body.capability = autonomy;
    } else if (capabilityInspection) {
      body.capability = capabilityInspection;
      body.intent_routing = { mode: 'deterministic', intent: 'CAPABILITY_STATUS', confidence: 1 };
    } else {
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
