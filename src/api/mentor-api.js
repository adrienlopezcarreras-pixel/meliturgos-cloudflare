import { buildProjectLearningPrompt } from '../memory/project-learning-ledger.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0' },
  });
}

function extractWorkersText(payload) {
  if (typeof payload?.response === 'string' && payload.response.trim()) return payload.response.trim();
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) return payload.output_text.trim();
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const choiceText = choice?.message?.content ?? choice?.text;
  if (typeof choiceText === 'string' && choiceText.trim()) return choiceText.trim();
  return '';
}

function compactContext(recent = []) {
  return recent.slice(-8).map((m) => ({
    role: String(m?.role || 'message').slice(0, 24),
    label: String(m?.label || '').slice(0, 48),
    text: String(m?.text || m?.content || '').slice(0, 1400),
  }));
}

function normalizeGuardText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildLocalGuardAdvice(text, recent = []) {
  const context = compactContext(recent);
  const combined = normalizeGuardText(`${context.map((m) => `${m.label || m.role}: ${m.text}`).join('\n')}\nAdrien: ${text}`);
  const warnings = [];

  const spend = /\b(payer|paiement|achat|acheter|achete|achetez|commande|commander|depense|depenser|abonnement|factur|billing|carte bancaire|api payante|credit payant)\b/i.test(combined);
  const destructive = /\b(supprim|delete|effac|erase|overwrite|ecras|reset --hard|force push|force-push|drop table|production|deploi|deploy|publier en prod)\b/i.test(combined);
  const credential = /\b(secret|token|mot de passe|password|cle api|api key|credential|identifiant)\b/i.test(combined);
  const externalAction = /\b(envoyer|send|publier|poster|publication|email|mail|message externe|mettre en ligne|mise en ligne)\b/i.test(combined);
  const claimedDone = /\b(fait|termine|deploye|corrige|installe|mis en ligne|reussi)\b/i.test(combined);
  const hasEvidence = /\b(sha|commit|test|tests|ci|workflow|job[_ -]?id|preuve|log|runtime|http 2\d\d|status 2\d\d)\b/i.test(combined);

  if (spend) warnings.push('Aucune dépense : tout achat, abonnement, crédit ou API facturable exige une autorisation explicite d’Adrien avant exécution.');
  if (destructive) warnings.push('Action sensible détectée : garder une sauvegarde/rollback et demander validation avant suppression, écrasement, force-push ou déploiement risqué.');
  if (credential) warnings.push('Secrets : ne jamais exposer ni recopier une clé, un mot de passe ou un token dans le chat, les logs ou le dépôt.');
  if (externalAction) warnings.push('Action externe : avant envoi/publication, montrer exactement ce qui va partir et obtenir l’accord d’Adrien si l’action est irréversible ou publique.');
  if (claimedDone && !hasEvidence) warnings.push('Une réalisation est affirmée sans preuve visible : exiger commit/SHA, test, CI, job persistant ou autre preuve runtime avant de la considérer comme terminée.');

  const riskLine = warnings.length ? warnings.slice(0, 2).join(' ') : 'Risque immédiat non détecté dans le message. Continuer par une seule modification réversible à la fois.';
  return [
    'Contrôle : Mentor reste en lecture/conseil uniquement ; il ne modifie rien, ne déploie rien et n’autorise aucune dépense.',
    `Vigilance : ${riskLine}`,
    'Prochaine action sûre : terminer la tâche déjà en cours, tester le changement minimal, puis conserver une preuve vérifiable avant de poursuivre.',
  ].join('\n');
}

function buildSystemPrompt(projectMemory) {
  return [
    'Tu es Mentor, relecteur prudent de MELITURGOS. Tu conseilles MEL mais tu ne commandes pas directement les outils.',
    'Mode strict : lecture et conseil uniquement. Tu ne dois jamais prétendre avoir modifié, testé, déployé, envoyé ou payé quoi que ce soit.',
    'Adrien est le propriétaire et décide. Toute dépense, abonnement, API facturable, publication externe, suppression, écrasement, force-push, changement de secrets ou action irréversible exige son autorisation explicite.',
    'Protège le projet : une seule version canonique, changements petits et réversibles, tests avant déploiement, preuve runtime avant de déclarer une tâche terminée, rollback disponible.',
    'Si une tâche est déjà active, recommande de la finir et de la vérifier avant d’en ouvrir une autre.',
    'Comprends les fautes de frappe et l’orthographe approximative sans exiger de reformulation.',
    'Réponds en français moderne et direct. Maximum trois points : risque/doublon, prochaine action exacte, preuve à exiger.',
    projectMemory,
  ].join('\n\n');
}

function mentorRuntimeStatus(env) {
  const remoteAllowed = Boolean(env?.AI)
    && String(env.MEL_MENTOR_FREE_AI_ENABLED || '').toLowerCase() === 'true'
    && String(env.MEL_MENTOR_ACCOUNT_CONFIRMED_FREE || '').toLowerCase() === 'true';
  return {
    ok: true,
    role: 'mentor',
    control_mode: 'advisory-read-only',
    billing_policy: remoteAllowed ? 'zero-euro-explicitly-confirmed' : 'zero-euro-fail-closed',
    external_inference_allowed: remoteAllowed,
    effective_provider: remoteAllowed ? 'workers-ai' : 'local-guard',
    model: remoteAllowed ? String(env.MEL_MENTOR_FREE_MODEL || '@cf/zai-org/glm-4.7-flash') : 'deterministic-safety-review',
  };
}

export function handleMentorStatus(request, env) {
  if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);
  return json(mentorRuntimeStatus(env));
}

export async function handleMentorChat(request, env) {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED', code: 'METHOD_NOT_ALLOWED' }, 405);
  const body = await request.json().catch(() => ({}));
  const text = String(body?.text || body?.message || '').trim();
  if (!text) return json({ error: 'message required', code: 'MENTOR_MESSAGE_REQUIRED' }, 400);

  const recent = Array.isArray(body?.context) ? body.context : [];
  const localAdvice = buildLocalGuardAdvice(text, recent);
  const runtimeStatus = mentorRuntimeStatus(env);

  if (!runtimeStatus.external_inference_allowed) {
    return json({
      ok: true,
      role: 'mentor',
      provider: 'local-guard',
      model: runtimeStatus.model,
      control_mode: runtimeStatus.control_mode,
      billing_policy: runtimeStatus.billing_policy,
      external_inference_used: false,
      text: localAdvice,
    });
  }

  const model = runtimeStatus.model;
  const projectMemory = buildProjectLearningPrompt();
  const context = compactContext(recent);
  const messages = [
    { role: 'system', content: buildSystemPrompt(projectMemory) },
    ...context.map((m) => ({ role: m.role === 'mentor' ? 'assistant' : 'user', content: `${m.label || m.role}: ${m.text}` })),
    { role: 'user', content: `Adrien: ${text}\n\nRelecture locale de sécurité à respecter :\n${localAdvice}` },
  ];

  try {
    const result = await env.AI.run(model, {
      messages,
      max_completion_tokens: 500,
      temperature: 0.2,
      chat_template_kwargs: { enable_thinking: false },
    });
    const answer = extractWorkersText(result);
    if (!answer) throw new Error('EMPTY_PROVIDER_RESPONSE');
    return json({
      ok: true,
      role: 'mentor',
      provider: 'workers-ai',
      model,
      control_mode: runtimeStatus.control_mode,
      billing_policy: runtimeStatus.billing_policy,
      external_inference_used: true,
      text: answer,
    });
  } catch (error) {
    return json({
      ok: true,
      role: 'mentor',
      provider: 'local-guard',
      model: 'deterministic-safety-review',
      control_mode: 'advisory-read-only',
      billing_policy: 'zero-euro-fallback',
      external_inference_used: false,
      degraded_reason: String(error?.message || error),
      text: localAdvice,
    });
  }
}

export { extractWorkersText, buildLocalGuardAdvice, mentorRuntimeStatus };
