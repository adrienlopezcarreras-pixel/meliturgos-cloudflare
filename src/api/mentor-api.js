import { buildProjectLearningPrompt } from '../memory/project-learning-ledger.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' },
  });
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const out = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      const text = part?.text || part?.output_text;
      if (typeof text === 'string' && text.trim()) out.push(text.trim());
    }
  }
  return out.join('\n\n').trim();
}

export async function handleMentorChat(request, env) {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);
  const body = await request.json().catch(() => ({}));
  const text = String(body?.text || body?.message || '').trim();
  if (!text) return json({ error: 'message required', code: 'MENTOR_MESSAGE_REQUIRED' }, 400);

  // Fail closed: the UI must never pretend a Workers-AI model is ChatGPT.
  if (!env.OPENAI_API_KEY || String(env.MEL_MENTOR_ENABLED || '').toLowerCase() !== 'true') {
    return json({
      ok: false,
      code: 'MENTOR_BRIDGE_NOT_CONFIGURED',
      error: 'Le pont ChatGPT Mentor est installé mais pas autorisé. OPENAI_API_KEY + MEL_MENTOR_ENABLED=true requis.',
      provider: 'openai',
      model: null,
    }, 503);
  }

  const model = String(env.MEL_MENTOR_MODEL || 'gpt-5.6-sol');
  const recent = Array.isArray(body?.context) ? body.context.slice(-16) : [];
  const contextText = recent.map((m) => `${String(m?.label || m?.role || 'message')}: ${String(m?.text || m?.content || '')}`).join('\n');
  const projectMemory = buildProjectLearningPrompt();
  const instructions = [
    'Tu es Mentor, le partenaire OpenAI principal de MELITURGOS.',
    'Tu n’es pas la session ChatGPT du navigateur et tu ne dois jamais prétendre disposer de la mémoire privée du compte ChatGPT.',
    'Tu disposes en revanche de la mémoire de projet MELITURGOS ci-dessous et du fil partagé transmis à chaque requête.',
    'Adrien est le propriétaire. Par défaut, tu réponds en priorité dans le salon collaboratif.',
    'Si Adrien s’adresse explicitement à MEL, laisse MEL répondre en priorité.',
    'Si Adrien s’adresse explicitement à une autre IA ou au Council, ne te substitue pas à elle.',
    'Pour le développement: une seule version canonique, pas de branches concurrentes durables, conseils brefs et actionnables.',
    'Comprends les fautes de frappe et l’orthographe approximative sans exiger une reformulation.',
    projectMemory,
  ].join('\n\n');

  const input = contextText ? `${contextText}\n\nAdrien: ${text}` : `Adrien: ${text}`;
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model, instructions, input, max_output_tokens: 1800 }),
    });
  } catch (error) {
    return json({ ok: false, code: 'MENTOR_NETWORK_ERROR', error: String(error?.message || error) }, 502);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({ ok: false, code: 'MENTOR_OPENAI_ERROR', error: data?.error?.message || `OpenAI HTTP ${response.status}`, provider: 'openai', model }, 502);
  }
  const answer = extractOutputText(data);
  if (!answer) return json({ ok: false, code: 'MENTOR_EMPTY_RESPONSE', error: 'Réponse Mentor vide.', provider: 'openai', model }, 502);
  return json({
    ok: true,
    role: 'mentor',
    provider: 'openai',
    model,
    memory_scope: 'mel-project-ledger+shared-room',
    text: answer,
    response_id: data?.id || null,
  });
}

export { extractOutputText };