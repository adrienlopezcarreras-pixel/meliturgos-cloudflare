export function isEvolutionDevelopmentIntent(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const action = /\b(d[ée]veloppe(?:r)?|ajoute(?:r)?|cr[ée]e(?:r)?|construis|construire|impl[ée]mente(?:r)?|apprends?|upgrade|am[ée]liore(?:r)?|build|develop|implement|add|learn)\b/i.test(value);
  const target = /\b(comp[ée]tence|capacit[ée]|module|outil|int[ée]gration|connecteur|plugin|skill|capability|connector|tool)\b/i.test(value);
  return action && target;
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
