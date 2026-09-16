const MODE_PATTERNS = [
  { id: 'laboratory', pattern: /(?:\bmode\s+(?:labo|laboratoire|lab)\b|\bcadre\s+(?:de\s+)?laboratoire\b|\blaboratory\s+mode\b)/i },
  { id: 'pedagogical', pattern: /(?:\bmode\s+p[ée]dagogique\b|\bcadre\s+p[ée]dagogique\b|\benseignement\b|\bcours\b|\bformation\b|\bteacher\s+mode\b|\bpedagogical\s+mode\b)/i },
  { id: 'scientific', pattern: /(?:\bmode\s+scientifique\b|\bcadre\s+scientifique\b|\brecherche\s+scientifique\b|\barticle\s+scientifique\b|\bth[eè]se\b|\bscientific\s+mode\b)/i },
];

const SENSITIVE_TOPIC_PATTERN = /\b(?:arme(?:s)?|weapon(?:s)?|explosi(?:f|fs|ve|ves)|bombe(?:s)?|poison(?:s)?|toxique(?:s)?|toxic|malware|ransomware|phishing|credential(?:s)?|mot(?:s)?\s+de\s+passe|password(?:s)?|intrusion|piratage|hacking|suicide|automutilation|self[- ]?harm|drogue(?:s)?|drug(?:s)?|stup[ée]fiant(?:s)?)\b/i;

const OPERATIONAL_DETAIL_PATTERN = /(?:\b(?:[ée]tape\s+par\s+[ée]tape|pas\s+[àa]\s+pas|proc[ée]dure\s+(?:exacte|d[ée]taill[ée]e)|instructions?\s+(?:exactes?|d[ée]taill[ée]es?)|commandes?\s+exactes?|code\s+complet|script\s+complet|dosage\s+exact|quantit[ée]s?\s+exactes?|param[eè]tres?\s+exacts?)\b|\b(?:fabrique(?:r)?|construire|assembler|contourner|bypass(?:er)?|exploiter|attaquer|infecter|empoisonner)\b)/i;

export function classifyRequestContext(text) {
  const value = String(text || '').trim();
  let mode = 'general';
  for (const candidate of MODE_PATTERNS) {
    if (candidate.pattern.test(value)) {
      mode = candidate.id;
      break;
    }
  }

  const sensitiveTopic = SENSITIVE_TOPIC_PATTERN.test(value);
  const operationalDetail = OPERATIONAL_DETAIL_PATTERN.test(value);
  const explicitLegitimateFrame = mode !== 'general';

  let intentClass = 'ordinary';
  if (sensitiveTopic && operationalDetail) intentClass = 'operational_sensitive';
  else if (sensitiveTopic) intentClass = 'sensitive_topic_only';
  else if (explicitLegitimateFrame) intentClass = 'legitimate_framed';

  const responseStrategy = intentClass === 'operational_sensitive'
    ? 'limit_operational_only'
    : (sensitiveTopic || explicitLegitimateFrame ? 'safe_maximum' : 'normal');

  return {
    mode,
    explicit_legitimate_frame: explicitLegitimateFrame,
    sensitive_topic: sensitiveTopic,
    operational_detail_requested: operationalDetail,
    intent_class: intentClass,
    response_strategy: responseStrategy,
  };
}

export function buildContextInterpreterInstruction(text) {
  const context = classifyRequestContext(text);
  return [
    '[CONTEXT_INTERPRETER]',
    `mode=${context.mode}`,
    `sensitive_topic=${context.sensitive_topic ? 'yes' : 'no'}`,
    `operational_detail=${context.operational_detail_requested ? 'yes' : 'no'}`,
    `intent_class=${context.intent_class}`,
    `response_strategy=${context.response_strategy}`,
    'Règles de réponse : un sujet sensible ne constitue pas à lui seul une intention dangereuse.',
    'Un cadre laboratoire, pédagogique ou scientifique est un signal de contexte légitime, mais n’annule jamais les garde-fous supérieurs ni les règles du fournisseur du modèle.',
    'Réponds au maximum de ce qui est légitime et sûr : explications conceptuelles, scientifiques, historiques, prévention, analyse, diagnostic et alternatives sûres doivent rester disponibles.',
    'Si seule une partie opérationnelle est réellement dangereuse, limite uniquement cette partie et poursuis le reste de la réponse au lieu de refuser tout le sujet.',
    'Cette classification est une aide de contexte, jamais une autorisation de contourner une politique de sécurité.',
    '[/CONTEXT_INTERPRETER]'
  ].join(' ');
}
