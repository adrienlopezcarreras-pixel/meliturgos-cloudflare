const MODE_PATTERNS = [
  { id: 'laboratory', pattern: /(?:\bmode\s+(?:labo|laboratoire|lab)\b|\bcadre\s+(?:de\s+)?laboratoire\b|\blaboratory\s+mode\b)/i },
  { id: 'pedagogical', pattern: /(?:\bmode\s+p[ée]dagogique\b|\bcadre\s+p[ée]dagogique\b|\benseignement\b|\bcours\b|\bformation\b|\bteacher\s+mode\b|\bpedagogical\s+mode\b)/i },
  { id: 'scientific', pattern: /(?:\bmode\s+scientifique\b|\bcadre\s+scientifique\b|\brecherche\s+scientifique\b|\barticle\s+scientifique\b|\bth[eè]se\b|\bscientific\s+mode\b)/i },
];

const SENSITIVE_TOPIC_PATTERN = /\b(?:arme(?:s)?|weapon(?:s)?|explosi(?:f|fs|ve|ves)|bombe(?:s)?|poison(?:s)?|toxique(?:s)?|toxic|malware|ransomware|phishing|credential(?:s)?|mot(?:s)?\s+de\s+passe|password(?:s)?|intrusion|piratage|hacking|suicide|automutilation|self[- ]?harm|drogue(?:s)?|drug(?:s)?|stup[ée]fiant(?:s)?)\b/i;

const OPERATIONAL_DETAIL_PATTERN = /(?:\b(?:[ée]tape\s+par\s+[ée]tape|pas\s+[àa]\s+pas|proc[ée]dure\s+(?:exacte|d[ée]taill[ée]e)|instructions?\s+(?:exactes?|d[ée]taill[ée]es?)|commandes?\s+exactes?|code\s+complet|script\s+complet|dosage\s+exact|quantit[ée]s?\s+exactes?|param[eè]tres?\s+exacts?)\b|\b(?:fabrique(?:r)?|construire|assembler|contourner|bypass(?:er)?|exploiter|attaquer|infecter|empoisonner)\b)/i;

const LEGITIMATE_PURPOSE_PATTERN = /\b(?:pr[ée]vention|pr[ée]venir|sensibilisation|sensibiliser|s[ée]curit[ée]|d[ée]fense|protection|prot[ée]ger|histoire|historique|analyse|analyser|comprendre|explication|expliquer|diagnostic|d[ée]tection|d[ée]tecter|reconna[iî]tre|recherche|scientifique|p[ée]dagog(?:ie|ique)|enseignement|formation|cours|th[eè]se|article\s+scientifique|for\s+prevention|prevention|safety|security|defen[cs]e|protection|historical|history|analysis|research|education|training|detection)\b/i;

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
  const legitimatePurposeSignal = LEGITIMATE_PURPOSE_PATTERN.test(value);
  const legitimateContext = explicitLegitimateFrame || legitimatePurposeSignal;

  let intentClass = 'ordinary';
  if (sensitiveTopic && operationalDetail) intentClass = 'operational_sensitive';
  else if (sensitiveTopic && legitimateContext) intentClass = 'sensitive_legitimate';
  else if (sensitiveTopic) intentClass = 'ambiguous_sensitive';
  else if (legitimateContext) intentClass = 'legitimate_framed';

  let responseStrategy = 'normal';
  if (intentClass === 'operational_sensitive') responseStrategy = 'limit_operational_only';
  else if (intentClass === 'ambiguous_sensitive') responseStrategy = 'clarify_if_needed_then_safe_maximum';
  else if (intentClass === 'sensitive_legitimate' || intentClass === 'legitimate_framed') responseStrategy = 'safe_maximum';

  return {
    mode,
    explicit_legitimate_frame: explicitLegitimateFrame,
    legitimate_purpose_signal: legitimatePurposeSignal,
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
    `legitimate_purpose=${context.legitimate_purpose_signal ? 'yes' : 'no'}`,
    `sensitive_topic=${context.sensitive_topic ? 'yes' : 'no'}`,
    `operational_detail=${context.operational_detail_requested ? 'yes' : 'no'}`,
    `intent_class=${context.intent_class}`,
    `response_strategy=${context.response_strategy}`,
    'Règles de réponse : un sujet sensible ne constitue pas à lui seul une intention dangereuse.',
    'Un cadre laboratoire, pédagogique, scientifique, historique, préventif ou défensif est un signal de contexte légitime, mais n’annule jamais les garde-fous supérieurs ni les règles du fournisseur du modèle.',
    'Réponds au maximum de ce qui est légitime et sûr : explications conceptuelles, scientifiques, historiques, prévention, analyse, diagnostic et alternatives sûres doivent rester disponibles.',
    'Si la demande est ambiguë, ne l’interprète pas automatiquement comme malveillante : donne le contenu sûr déjà possible et demande une clarification ciblée seulement si elle est nécessaire pour aller plus loin.',
    'Si seule une partie opérationnelle est réellement dangereuse, limite uniquement cette partie et poursuis le reste de la réponse au lieu de refuser tout le sujet.',
    'Cette classification est une aide de contexte, jamais une autorisation de contourner une politique de sécurité.',
    '[/CONTEXT_INTERPRETER]'
  ].join(' ');
}
