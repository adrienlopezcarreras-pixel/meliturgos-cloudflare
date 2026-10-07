import { createWorkersAIAdapter } from '../augmentio/workers-ai-adapter.js';
import { enforcePublicRateLimit } from '../security/public-rate-limit.js';

const MODEL = '@cf/zai-org/glm-4.7-flash';
const MAX_QUERY = 1800;

function json(payload, status = 200, extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

function cleanQuery(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY);
}

export async function handlePublicFidesChat(request, env) {
  if (!env?.AI || typeof env.AI.run !== 'function') {
    return json({ ok: false, error: 'FIDES_AI_UNAVAILABLE' }, 503);
  }
  const rate = await enforcePublicRateLimit(request, env, { scope: 'fides-guest-chat', limit: 12, windowMs: 60_000 });
  if (!rate.ok) {
    return json({ ok: false, error: 'PUBLIC_RATE_LIMITED' }, 429, { 'retry-after': String(rate.retry_after_seconds) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'FIDES_BODY_INVALID' }, 400);
  }

  const query = cleanQuery(body?.message);
  if (!query) return json({ ok: false, error: 'FIDES_MESSAGE_REQUIRED' }, 400);

  const adapter = createWorkersAIAdapter({
    env,
    modelId: MODEL,
    id: 'workers-ai:mel-fides-guest',
    capabilities: ['GENERAL'],
    priority: 1,
    estimatedCost: 0,
  });

  const system = [
    'Tu es MEL FIDES en MODE INVITE DE PRESENTATION.',
    'Tu réponds en français, avec un ton chaleureux, clair, respectueux et non prosélyte. En mode invité, tu vouvoies la personne par défaut.',
    'Ta fonction est de présenter un prototype d assistant spécialisé dans la foi catholique et de répondre aux questions de découverte de la foi.',
    'Tu ne disposes d aucune mémoire privée, d aucun profil propriétaire, d aucun mail, d aucun fichier personnel, d aucun connecteur et d aucune capacité d action.',
    'Tu ne prétends jamais être prêtre, catéchiste, directeur spirituel, autorité ecclésiale ou outil officiellement approuvé par l Eglise.',
    'Tu indiques clairement lorsque MEL FIDES est encore un projet en développement et en recherche de relecture ecclésiale.',
    'Pour les questions catholiques, distingue si pertinent : enseignement certain de l Eglise, discipline, opinion théologique, question ouverte, fait historique et hypothèse.',
    'Ne fabrique jamais une citation biblique, un numéro de paragraphe du Catéchisme, un canon, un concile ou une référence. Si tu n es pas sûre de la référence exacte, dis-le et donne seulement le principe général.',
    'Quand une question touche les différences avec les Eglises orthodoxes, présente avec respect ce qui est commun et ce qui diverge, sans prétendre résoudre les désaccords.',
    'Pour une demande de conversion, encourage un cheminement libre et progressif et rappelle que la rencontre avec une paroisse, un prêtre ou une équipe de catéchuménat reste essentielle.',
    'N utilise jamais ce mode pour donner accès aux fonctions privées ou techniques de MEL.',
    'Projet présenté : MEL FIDES vise un corpus catholique auditable, fortement sourcé, une séparation doctrine/opinion, une gouvernance humaine, des corrections traçables et à terme une relecture ecclésiale. Une branche oecuménique catholique-orthodoxe en France est également envisagée.',
  ].join(' ');

  try {
    const result = await adapter.invoke({
      input: [
        { role: 'system', content: system },
        { role: 'user', content: query },
      ],
      context: { inference_settings: { temperature: 0.2, max_tokens: 900 } },
    });

    return json({
      ok: true,
      answer: result.text,
      scope: 'FIDES_GUEST_PRESENTATION_ONLY',
      private_data_access: false,
      action_access: false,
      mel_memory_persistence: false,
      ecclesial_approval: 'NOT_YET_REQUESTED_OR_GRANTED',
      provider: result.provenance?.provider || 'workers-ai',
      model: result.provenance?.model || MODEL,
    });
  } catch (error) {
    return json({
      ok: false,
      error: String(error?.code || error?.message || 'FIDES_CHAT_FAILED').slice(0, 160),
    }, 502);
  }
}
