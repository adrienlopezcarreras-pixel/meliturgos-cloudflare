const PROFILES=Object.freeze({
  chat:{
    id:'chat',
    title_policy:'optional',
    section_policy:'only_when_helpful',
    paragraph_max_sentences:4,
    bullets:'for parallel items or steps',
    tables:'only for compact comparisons or structured facts',
    emphasis:'sparingly for key decisions or statuses',
    whitespace:'separate logical blocks',
  },
  brief:{
    id:'brief',
    title_policy:'short descriptive title',
    section_policy:'summary then evidence then next action',
    paragraph_max_sentences:3,
    bullets:'preferred for actions and evidence',
    tables:'only for status matrices',
    emphasis:'key status and blocker only',
    whitespace:'high',
  },
  report:{
    id:'report',
    title_policy:'required',
    section_policy:'executive summary, findings, evidence, risks, next actions',
    paragraph_max_sentences:5,
    bullets:'for findings and actions',
    tables:'for comparisons, matrices and repeated fields',
    emphasis:'section-level only',
    whitespace:'generous',
  },
  document:{
    id:'document',
    title_policy:'required',
    section_policy:'logical heading hierarchy with introduction and conclusion when relevant',
    paragraph_max_sentences:5,
    bullets:'for true lists, not prose fragments',
    tables:'for genuinely tabular data',
    emphasis:'consistent and restrained',
    whitespace:'print-readable',
  },
  email:{
    id:'email',
    title_policy:'subject separate from body when requested',
    section_policy:'opening, purpose, useful details, closing',
    paragraph_max_sentences:3,
    bullets:'only for several concrete requests or facts',
    tables:'avoid unless essential',
    emphasis:'minimal',
    whitespace:'compact',
  },
  comparison:{
    id:'comparison',
    title_policy:'optional',
    section_policy:'criteria, compact comparison, implications',
    paragraph_max_sentences:4,
    bullets:'for caveats',
    tables:'preferred when the same attributes apply to several options',
    emphasis:'differences only',
    whitespace:'balanced',
  },
});

export function inferPresentationProfile(text=''){
  const value=String(text||'').toLowerCase();
  if(/\b(?:mail|email|courriel|message\s+professionnel)\b/.test(value)) return PROFILES.email;
  if(/\b(?:rapport|audit|compte\s+rendu|dossier|analyse\s+compl[eè]te)\b/.test(value)) return PROFILES.report;
  if(/\b(?:document|docx|pdf|lettre|notice|m[ée]moire|article)\b/.test(value)) return PROFILES.document;
  if(/\b(?:compare|comparatif|versus|vs\.?|tableau\s+comparatif)\b/.test(value)) return PROFILES.comparison;
  if(/\b(?:brief|synth[eè]se|r[ée]sum[ée]|point\s+rapide|maj\s+liste)\b/.test(value)) return PROFILES.brief;
  return PROFILES.chat;
}

export function buildPresentationInstruction(text='',{voiceReply=false}={}){
  if(voiceReply) return 'PRÉSENTATION VOCALE : phrases courtes, ordre logique, aucune mise en page lourde.';
  const profile=inferPresentationProfile(text);
  return [
    'PRÉSENTATION ET MISE EN PAGE : applique une hiérarchie visuelle propre et cohérente.',
    'Évite les murs de texte, les titres décoratifs inutiles, les listes composées de phrases qui devraient rester un paragraphe et les tableaux artificiels.',
    'Utilise des paragraphes courts, des sections seulement lorsqu elles améliorent la navigation, des listes pour des éléments réellement parallèles et des tableaux uniquement pour des données comparables.',
    'Garde une typographie Markdown sobre : titres hiérarchiques, gras parcimonieux, espacement régulier.',
    'Pour un document ou rapport, pense comme un maquettiste éditorial : ordre de lecture, densité, respiration, cohérence des niveaux, légendes et données alignées.',
    'Ne sacrifie jamais la précision factuelle à la présentation.',
    'PROFIL DE SORTIE : '+JSON.stringify(profile),
  ].join(' ');
}

export function presentationLayoutPlan(kind='chat'){
  const id=String(kind||'chat').toLowerCase();
  return structuredClone(PROFILES[id]||PROFILES.chat);
}

export function registerPresentationCapabilities(bus){
  bus.discover({
    id:'presentation.layout.plan',
    name:'Plan de présentation et mise en page',
    category:'presentation',
    version:'1.0.0',
    provider:'mel',
    description:'Returns a deterministic presentation/layout contract for chat, briefs, reports, documents, email or comparisons.',
    input_schema:{
      type:'object',
      properties:{
        kind:{type:'string',enum:Object.keys(PROFILES)},
      },
      additionalProperties:false,
    },
    output_schema:{type:'object',additionalProperties:true},
    risk:'LOW',
    permissions:[],
    health:'HEALTHY',
    enabled:true,
  },async input=>({
    schema:'mel.presentation-layout/v1',
    profile:presentationLayoutPlan(input?.kind||'chat'),
  }));
}
