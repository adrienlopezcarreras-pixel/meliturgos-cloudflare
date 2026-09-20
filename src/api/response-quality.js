function cleanText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

export function inferResponseMode(userText) {
  const text=cleanText(userText);
  if(!text) return 'standard';
  const compact=/^(?:ok|go|maj|avance|continue|fini\s*\??|c['’]est\s+bon\s*\??|ça\s+marche\s*\??|ca\s+marche\s*\??|et\s+l[àa]\s*\??|maintenant\s*\??|tu\s+vois\s*\??)$/i.test(text)
    || (text.length<=90 && /\b(?:c['’]est\s+bon|fini|termin[ée]|ça\s+marche|ca\s+marche|avance|maj|statut|status|o[uù]\s+en\s+est|o[uù]\s+en\s+es)\b/i.test(text));
  if(compact) return 'compact_status';
  if(/\b(?:explique|pourquoi|comment|d[ée]taille|analyse|compare|apprends[- ]?moi|teach|explain)\b/i.test(text)) return 'explanatory';
  if(/^\s*(?:est[- ]?ce\s+que|tu\s+peux|peux[- ]?tu|as[- ]?tu|tu\s+as|est[- ]?il|est[- ]?elle)\b/i.test(text) && text.length<180) return 'direct_answer';
  return 'standard';
}

export function buildResponseQualityInstruction(userText) {
  const mode=inferResponseMode(userText);
  const modeRule=mode==='compact_status'
    ? 'MODE COMPACT_STATUS : réponds par le statut/conclusion dans la première phrase, puis 1 à 3 phrases utiles. Ne récite pas tout l’historique ni tous les sous-systèmes.'
    : mode==='direct_answer'
      ? 'MODE DIRECT_ANSWER : réponds oui/non/pas encore ou donne directement le fait demandé dans la première phrase, puis justifie brièvement.'
      : mode==='explanatory'
        ? 'MODE EXPLICATIF : commence par l’idée centrale, puis explique causes, mécanisme et conséquence sans digression inutile.'
        : 'MODE STANDARD : réponse naturelle, directe et proportionnée à la demande.';
  return [
    '[MEL_RESPONSE_QUALITY]',
    `mode=${mode}`,
    modeRule,
    'La première phrase doit répondre à la demande actuelle, pas commenter la méthode de réponse.',
    'VERROU DE SUJET : reste sur le sujet et le niveau demandés dans le dernier message. Ne saute pas vers un ancien chantier, un autre module, une autre branche ou une autre interprétation simplement parce qu’ils existent dans l’historique.',
    'Si le message est elliptique (ex. « continue », « fais-le », « et maintenant ? »), résous d’abord son référent depuis les échanges récents de la même conversation; n’utilise une mémoire plus ancienne que si le référent récent ne suffit pas.',
    'Si plusieurs interprétations restent réellement possibles et qu’elles mèneraient à des actions différentes, demande une clarification courte au lieu de choisir arbitrairement un autre plan.',
    'N’utilise pas « en tant qu’IA », « je dois préciser » ou un préambule défensif quand une réponse factuelle directe est possible.',
    'Ne récite pas l’architecture interne, les garde-fous ou les limitations générales sauf si Adrien les demande ou si une limite change réellement la réponse.',
    'Quand une preuve runtime existe, cite le fait précis (statut, branche, SHA, job, erreur) plutôt qu’une formulation vague.',
    'Distingue : vérifié maintenant / connu par mémoire / non observable. Ne transforme jamais « non observé » en « impossible ».',
    'Si une action est déjà exécutée par un outil, parle au présent ou au passé factuel; ne dis pas « je vais le faire ».',
    'Si une action est seulement mise en file ou en cours, ne dis jamais « c’est fait », « terminé » ou « déployé ».',
    'Garde un ton naturel, calme et conversationnel; évite les répétitions et les formulations mécaniques.',
    '[/MEL_RESPONSE_QUALITY]'
  ].join(' ');
}

function asksCodeAccess(userText) {
  const text=cleanText(userText);
  return /\b(?:acc[eè]s|acc[eè]der|voir|lire|inspecter)\b/i.test(text)
    && /\b(?:code|source|repo|repository|d[ée]p[ôo]t|github)\b/i.test(text);
}

function deniesCodeAccess(text) {
  return /\b(?:je\s+n['’]?ai\s+pas\s+acc[eè]s|je\s+ne\s+peux\s+pas\s+(?:acc[eè]der|voir|lire|inspecter)|je\s+ne\s+vois\s+pas\s+(?:mon|le)\s+(?:code|d[ée]p[ôo]t|repo))\b/i.test(text);
}

function claimsCompletion(text) {
  return /\b(?:c['’]est\s+fait|c['’]est\s+termin[ée]|termin[ée]|fini|d[ée]ploy[ée]\s+en\s+prod(?:uction)?|en\s+production)\b/i.test(text);
}

function successfulCodeEvidence(toolResults=[]) {
  const rows=Array.isArray(toolResults)?toolResults:[];
  for(let i=rows.length-1;i>=0;i--){
    const row=rows[i];
    if(row?.status!=='SUCCEEDED') continue;
    if(!['code.read','code.search','code.integrity'].includes(String(row?.capability||''))) continue;
    const r=row.result||{};
    return {
      capability:String(row.capability),
      path:r.path||r.file||null,
      branch:r.branch||r.self_code?.branch||null,
      head:r.head||r.self_code?.commit||null,
    };
  }
  return null;
}

function latestFailure(toolResults=[]) {
  const rows=Array.isArray(toolResults)?toolResults:[];
  for(let i=rows.length-1;i>=0;i--){
    const row=rows[i];
    if(row?.status==='FAILED') return {capability:String(row.capability||'outil'),error:String(row.error||'CAPABILITY_FAILED')};
  }
  return null;
}

function stripMetaPreamble(text) {
  return cleanText(text)
    .replace(/^En\s+tant\s+qu['’](?:IA|intelligence\s+artificielle)[^.!?]*[.!?]\s*/i,'')
    .replace(/^Je\s+dois\s+pr[ée]ciser\s+que\s+/i,'');
}

export function finalizeEvidenceAlignedResponse({
  text,
  userText,
  codeAccess,
  toolResults=[],
  developmentQueued=null,
}={}) {
  let out=stripMetaPreamble(text);
  const codeEvidence=successfulCodeEvidence(toolResults);

  if(asksCodeAccess(userText) && codeAccess?.available===true && deniesCodeAccess(out)){
    const proof=[];
    if(codeEvidence?.path) proof.push(`fichier ${codeEvidence.path}`);
    if(codeEvidence?.branch) proof.push(`branche ${codeEvidence.branch}`);
    if(codeEvidence?.head) proof.push(`SHA ${String(codeEvidence.head).slice(0,8)}`);
    out=`Oui, j’ai accès à mon dépôt/code MEL via mes capacités code${proof.length ? ` ; cette requête a vérifié ${proof.join(', ')}` : ''}. Une lecture précise n’est affirmée que lorsqu’un outil code l’a réellement exécutée sur la cible demandée.`;
  }

  if(developmentQueued && claimsCompletion(out)){
    const job=String(developmentQueued.job_id||'').trim();
    const status=String(developmentQueued.status||'QUEUED').trim();
    out=`Le développement est enregistré${job?` sous le job ${job}`:''} (statut ${status}). Il n’est pas encore prouvé terminé ni déployé : je le considérerai terminé seulement après une preuve de completion/CI correspondant au niveau annoncé.`;
  }

  const failure=latestFailure(toolResults);
  if(failure && /\b(?:je\s+n['’]?ai\s+pas\s+acc[eè]s|je\s+ne\s+peux\s+pas)\b/i.test(out)){
    out=`L’opération ${failure.capability} a échoué cette fois (${failure.error}). Cet échec ponctuel ne prouve pas une incapacité générale ; les autres capacités restent décrites par leur état runtime courant.`;
  }

  return cleanText(out);
}
