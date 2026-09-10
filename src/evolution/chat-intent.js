export function isEvolutionDevelopmentIntent(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const action = /\b(d[ée]veloppe(?:r)?|ajoute(?:r)?|cr[ée]e(?:r)?|construis|construire|impl[ée]mente(?:r)?|apprends?|upgrade|am[ée]liore(?:r)?|build|develop|implement|add|learn)\b/i.test(value);
  const target = /\b(comp[ée]tence|capacit[ée]|module|outil|int[ée]gration|connecteur|plugin|skill|capability|connector|tool)\b/i.test(value);
  return action && target;
}

/**
 * Stronger intent used to start the autonomous Mentor/Dev-Bridge loop.
 * It deliberately requires an explicit command about MEL's own development,
 * so ordinary questions about programming are never turned into write jobs.
 */
export function isAutonomousDevelopmentCommand(text) {
  const value = String(text || '').trim();
  if (!value) return false;

  const explicitSelfDevelopment = /\b(?:d[ée]veloppe|am[ée]liore|upgrade|impl[ée]mente|code|fais\s+[ée]voluer|auto-?d[ée]veloppe)\b[^.!?\n]{0,80}\b(?:ton|tes|ta|le\s+programme\s+de\s+mel|mel)\b[^.!?\n]{0,80}\b(?:code|programme|capacit[ée]s?|modules?|autonomie|syst[èe]me|roadmap|feuille\s+de\s+route)\b/i.test(value)
    || /\b(?:ton|tes|ta|mel)\b[^.!?\n]{0,80}\b(?:code|programme|capacit[ée]s?|modules?|autonomie|syst[èe]me|roadmap|feuille\s+de\s+route)\b[^.!?\n]{0,80}\b(?:d[ée]veloppe|am[ée]liore|upgrade|impl[ée]mente|code|fais\s+[ée]voluer|continue|poursuis|reprends)\b/i.test(value);

  const roadmapContinuation = /\b(?:continue|poursuis|reprends|avance|encha[iî]ne)\b[^.!?\n]{0,100}\b(?:ta\s+)?(?:feuille\s+de\s+route|roadmap|d[ée]veloppement|autonomie|mentor|programme)\b/i.test(value);
  const autonomousLoop = /\b(?:mentor|dev\s*bridge|teacher\s*bridge|boucle\s+autonome|d[ée]veloppement\s+autonome|auto-?d[ée]veloppement)\b/i.test(value)
    && /\b(?:lance|continue|active|reprends|poursuis|d[ée]veloppe|code)\b/i.test(value);

  return explicitSelfDevelopment || roadmapContinuation || autonomousLoop;
}

/** Inject only the mandatory preflight; never code generation. */
export async function injectEvolutionPreflightCapability(request) {
  const url = new URL(request.url);
  if (url.pathname !== '/api/chat' || request.method !== 'POST') return request;
  if (!(request.headers.get('content-type') || '').includes('application/json')) return request;
  let body;
  try { body = await request.clone().json(); }
  catch { return request; }
  if (!body || typeof body !== 'object' || body.capability?.id) return request;
  const text = String(body.text ?? body.message ?? body.prompt ?? '').trim();
  if (!isEvolutionDevelopmentIntent(text)) return request;

  body.capability = {
    id: 'evolution.preflight',
    input: {
      goal: text.slice(0, 4000),
      context: { origin: 'chat', rule: 'AI_COUNCIL_BEFORE_CODE' },
      minResponses: 2
    }
  };
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(body), redirect: request.redirect });
}
