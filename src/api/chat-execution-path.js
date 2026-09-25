const FAST_SOCIAL_PATTERNS = Object.freeze([
  /^(?:bonjour|bonsoir|salut|coucou|hello|hey)[ !?.…]*$/i,
  /^(?:merci|merci beaucoup|super merci|parfait merci|thanks|thank you)[ !?.…]*$/i,
  /^(?:au revoir|bonne nuit|à plus|a plus|à bientôt|a bientot|bye)[ !?.…]*$/i,
  /^(?:ça va|ca va|comment ça va|comment ca va|tu vas bien|comment vas-tu)[ ?!.…]*$/i,
  /^(?:qui es-tu|qui es tu|présente-toi|presente-toi)[ ?!.…]*$/i,
]);

const FAST_BLOCKING_SIGNALS = Object.freeze([
  /\b(?:souviens|rappelle|mémoire|memoire|historique|archive)\b/i,
  /\b(?:cherche|recherche|trouve|web|internet|actualité|actualite|météo|meteo|prix|horaire|près de moi|pres de moi|proche de moi)\b/i,
  /\b(?:code|source|github|repo|fichier|fonction|classe|module|api|backend|frontend|bug|corrige|répare|repare|développe|developpe|implémente|implemente)\b/i,
  /\b(?:travail|tâche|tache|job|roadmap|projet|décision|decision|continue|reprends|avance)\b/i,
  /\b(?:analyse|raisonne|explique|pourquoi|compare|résume|resume|calcule|traduis)\b/i,
]);

export const CHAT_EXECUTION_PATHS = Object.freeze({
  FAST: 'FAST',
  STANDARD: 'STANDARD',
});

export function classifyChatExecutionPath({
  text,
  body = {},
  focus = {},
  inferredCapability = null,
  personalProfileIntent = false,
  releaseSmoke = false,
} = {}) {
  const value = String(text || '').trim();
  if (!value) return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'EMPTY' };
  if (releaseSmoke) return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'RELEASE_SMOKE' };
  if (body?.capability?.id || inferredCapability?.id) {
    return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'CAPABILITY_REQUIRED' };
  }
  if (body?.parallel === true) return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'PARALLEL_REQUESTED' };
  if (personalProfileIntent) return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'PERSONAL_PROFILE' };
  if (focus?.needs_clarification === true || focus?.elliptical === true) {
    return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'CONTEXT_DEPENDENT' };
  }
  if (value.length > 160) return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'TOO_LONG' };
  if (FAST_BLOCKING_SIGNALS.some(pattern => pattern.test(value))) {
    return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'HEAVY_SIGNAL' };
  }
  if (FAST_SOCIAL_PATTERNS.some(pattern => pattern.test(value))) {
    return { mode: CHAT_EXECUTION_PATHS.FAST, reason: 'BOUNDED_SOCIAL' };
  }
  return { mode: CHAT_EXECUTION_PATHS.STANDARD, reason: 'DEFAULT' };
}

export function buildFastPathSystemPrompt({
  identityPrompt = '',
  qualityInstruction = '',
  focusInstruction = '',
  themeInstruction = '',
  voiceReply = false,
} = {}) {
  return [
    'Tu es MEL, l’intelligence artificielle personnelle d’Adrien. Ton identité/persona est féminine et tu restes une IA, jamais une humaine.',
    identityPrompt,
    qualityInstruction,
    focusInstruction,
    themeInstruction,
    'FAST PATH MEL : conversation sociale courte uniquement. Réponds immédiatement, naturellement et sans lancer de recherche, mémoire longue, audit ou outil.',
    voiceReply
      ? 'MODE VOCAL : réponds en une à trois phrases courtes et directement prononçables.'
      : 'Réponse courte et naturelle.',
    'Réponds en français sauf demande contraire.',
    'Adrien doit être tutoyé : utilise « tu », « ton », « ta », « tes » et jamais le vouvoiement.',
    'N’invente aucune action effectuée, donnée récente, souvenir ou capacité non vérifiée.',
  ].filter(Boolean).join(' ');
}
