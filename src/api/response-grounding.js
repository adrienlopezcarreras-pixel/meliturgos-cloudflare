function n(value) {
  const out = Number(value);
  return Number.isFinite(out) ? out : 0;
}

function shortSha(value) {
  const text = String(value || '').trim();
  return /^[0-9a-f]{40}$/i.test(text) ? text.slice(0, 8) : (text || null);
}

function section(state, name) {
  const row = state?.sections?.[name];
  return row && typeof row === 'object' ? row : null;
}

function statusCounts(work) {
  const counts = {};
  for (const row of Array.isArray(work) ? work : []) {
    const status = String(row?.status || 'UNKNOWN').toUpperCase();
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function flags(question) {
  const text = String(question || '').toLowerCase();
  const memory = /m[ée]moire|chat\s*gpt|archive|conversation|souvenir|r[ée]cup[eè]r|synchron/i.test(text);
  const code = /code|repo|repository|branche|branch|commit|sha|d[ée]ploiement|changement|modification|impl[ée]ment/i.test(text);
  const work = /travaux?|jobs?|t[âa]ches?|processus|en\s+cours|avance|progress/i.test(text) || code;
  const capability = /capacit[ée]|comp[ée]tence|outil|fonctionnalit[ée]|module/i.test(text);
  const autonomy = /autonom|roadmap|feuille\s+de\s+route|self[- ]?development/i.test(text);
  const system = /binding|runtime|syst[eè]me|connexion|acc[eè]s/i.test(text);
  const communication = /r[ée]ponse|coh[ée]ren|contradic|hors\s+sujet|communication|compr[ée]hension/i.test(text);
  const broad = /[ée]tat\s+(?:r[ée]el|interne|actuel)|tout\s+ce\s+que\s+tu\s+vois|self[- ]?state/i.test(text)
    || !(memory || code || work || capability || autonomy || system || communication);
  return { memory, code, work, capability, autonomy, system, communication, broad };
}

function errorLine(label, row) {
  if (!row || row.ok !== false) return null;
  return `${label} indisponible pour cette vérification (${String(row.error || 'OBSERVATION_UNAVAILABLE')}).`;
}

export function formatVerifiedSelfStateResponse(state, question = '', { fallback = '' } = {}) {
  if (!state || typeof state !== 'object') return String(fallback || '').trim();
  const wanted = flags(question);
  const lines = [];
  const unavailable = [];

  const code = section(state, 'code');
  if ((wanted.code || wanted.broad) && code?.ok) {
    const d = code.data || {};
    const deployed = d.self_code || {};
    const parts = [];
    if (d.branch) parts.push(`branche observée ${d.branch}`);
    if (d.head) parts.push(`HEAD ${shortSha(d.head)}`);
    if (deployed.exact_identity_known && deployed.commit) {
      parts.push(`déploiement identifié ${deployed.branch || 'branche inconnue'}@${shortSha(deployed.commit)}`);
    }
    if (d.status) parts.push(`intégrité ${d.status}`);
    lines.push(`Code : ${parts.length ? parts.join(' ; ') : 'source observée sans identité complète'}.`);
  } else if (wanted.code || wanted.broad) {
    const line = errorLine('Code', code);
    if (line) unavailable.push(line);
  }

  const work = section(state, 'work');
  const recentWork = section(state, 'recent_work');
  if ((wanted.work || wanted.broad) && work?.ok) {
    const rows = Array.isArray(work.data?.work) ? work.data.work : [];
    const counts = statusCounts(rows);
    const statusText = Object.entries(counts).map(([k,v]) => `${v} ${k}`).join(', ');
    lines.push(`Travaux persistants : ${n(work.data?.count)} ouvert(s)${statusText ? ` (${statusText})` : ''}.`);
    if (recentWork?.ok && Array.isArray(recentWork.data?.work) && recentWork.data.work.length) {
      const newest = recentWork.data.work[0];
      lines.push(`Dernier travail enregistré : ${String(newest.job_id || newest.id || 'inconnu')} — ${String(newest.status || 'UNKNOWN')}.`);
    }
  } else if (wanted.work || wanted.broad) {
    const line = errorLine('Travaux persistants', work);
    if (line) unavailable.push(line);
  }

  const memory = section(state, 'memory');
  if ((wanted.memory || wanted.broad) && memory?.ok) {
    const d = memory.data || {};
    lines.push(`Mémoire persistante : ${String(d.status || 'UNKNOWN')} — ${n(d.memory_count)} mémoire(s), ${n(d.archive_count)} message(s) archivé(s), ${n(d.conversation_count)} conversation(s).`);
  } else if (wanted.memory || wanted.broad) {
    const line = errorLine('Mémoire', memory);
    if (line) unavailable.push(line);
  }

  const chatgpt = section(state, 'chatgpt_import');
  if ((wanted.memory || wanted.broad) && chatgpt?.ok) {
    const d = chatgpt.data || {};
    const sync = d.memory_sync_complete === true ? 'synchronisation mémoire à jour' : 'synchronisation mémoire en cours/incomplète';
    const complete = d.full_archive_confirmed === true ? 'archive complète confirmée' : 'archive complète non confirmée';
    let last = '';
    if (d.last_received?.timestamp) {
      try { last = ` ; dernière réception horodatée ${new Date(Number(d.last_received.timestamp)).toISOString()}`; } catch {}
    }
    lines.push(`ChatGPT importé : ${n(d.conversations)} conversation(s), ${n(d.messages)} message(s) — ${sync}, ${complete}${last}.`);
  } else if (wanted.memory || wanted.broad) {
    const line = errorLine('Import ChatGPT', chatgpt);
    if (line) unavailable.push(line);
  }

  const communicationQuality = section(state, 'communication_quality');
  if ((wanted.communication || wanted.broad) && communicationQuality?.ok) {
    const events = Array.isArray(communicationQuality.data?.events) ? communicationQuality.data.events : [];
    const codes = {};
    for (const event of events) {
      for (const issue of Array.isArray(event?.issues) ? event.issues : []) {
        const code = String(issue?.code || 'UNKNOWN');
        codes[code] = (codes[code] || 0) + 1;
      }
    }
    const summary = Object.entries(codes).map(([code,count]) => `${code}=${count}`).join(', ');
    lines.push(`Qualité conversationnelle récente : ${n(communicationQuality.data?.count)} incident(s) enregistré(s)${summary ? ` — ${summary}` : ''}.`);
  } else if (wanted.communication || wanted.broad) {
    const line = errorLine('Qualité conversationnelle', communicationQuality);
    if (line) unavailable.push(line);
  }

  const autonomy = section(state, 'autonomy');
  if ((wanted.autonomy || wanted.broad) && autonomy?.ok) {
    const d = autonomy.data || {};
    const current = d.jobs?.current?.job_id ? ` ; job courant ${d.jobs.current.job_id} (${d.jobs.current.status || 'UNKNOWN'})` : '';
    const paused = d.control ? ` ; contrôle ${d.control.paused ? 'EN PAUSE' : 'ACTIF'}` : '';
    lines.push(`Autonomie : ${String(d.status || 'UNKNOWN')}${current}${paused}.`);
  } else if (wanted.autonomy || wanted.broad) {
    const line = errorLine('Autonomie', autonomy);
    if (line) unavailable.push(line);
  }

  if (wanted.capability || wanted.broad) {
    const c = state.capabilities || {};
    const health = c.health && typeof c.health === 'object'
      ? Object.entries(c.health).map(([k,v]) => `${k}=${v}`).join(', ')
      : '';
    const truth = c.truth && typeof c.truth === 'object'
      ? Object.entries(c.truth).map(([k,v]) => `${k}=${v}`).join(', ')
      : '';
    lines.push(`Capacités : ${n(c.registered)} enregistrée(s), ${n(c.enabled)} activée(s)${health ? ` ; santé ${health}` : ''}${truth ? ` ; vérité ${truth}` : ''}.`);
    const details = c.category_details && typeof c.category_details === 'object' ? c.category_details : {};
    const domains = Object.entries(details).slice(0, 10).map(([category, rows]) => {
      const items = (Array.isArray(rows) ? rows : []).slice(0, 8).map(row => `${row.id}[${row.status || 'UNKNOWN'}]`);
      return items.length ? `${category}: ${items.join(', ')}` : null;
    }).filter(Boolean);
    if (domains.length) lines.push(`Domaines : ${domains.join(' ; ')}.`);
  }

  const system = section(state, 'system');
  if ((wanted.system || wanted.broad) && system?.ok) {
    const d = system.data || {};
    lines.push(`Runtime : IA=${d.ai ? 'oui' : 'non'}, DB=${d.db ? 'oui' : 'non'}, dépôt=${String(d.github_repository || 'inconnu')}, branche=${String(d.github_branch || 'inconnue')}.`);
  } else if (wanted.system || wanted.broad) {
    const line = errorLine('Runtime', system);
    if (line) unavailable.push(line);
  }

  if (!lines.length && !unavailable.length) return String(fallback || '').trim();

  const observedAt = state.observed_at ? ` au ${String(state.observed_at)}` : '';
  const intro = wanted.code && wanted.memory
    ? `Je viens de vérifier mon état réel${observedAt}. Je peux observer les changements persistés dans mes sources internes et l’état de mes mémoires ; je ne vois pas ce qui reste uniquement dans un autre onglet tant que ce n’est ni enregistré ni commité.`
    : `Je viens de vérifier mon état réel${observedAt} à partir de mes sources runtime.`;

  const limits = [];
  if (wanted.code || wanted.work || wanted.broad) {
    limits.push('Limite : une modification encore seulement présente dans une autre page, un éditeur ou une session non persistée n’est pas observable comme un fait courant.');
  }
  if (wanted.memory || wanted.broad) {
    limits.push('Mémoire : je ne charge pas toute l’archive dans chaque réponse ; elle reste persistée et la partie pertinente est récupérée selon la demande.');
  }

  return [
    intro,
    '',
    ...lines.map(line => `- ${line}`),
    ...(unavailable.length ? ['', ...unavailable.map(line => `- ${line}`)] : []),
    ...(limits.length ? ['', ...limits] : []),
  ].join('\n').trim();
}


function clip(value, limit = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…';
}

export function formatVerifiedCapabilityAuditResponse(audit, { fallback = '' } = {}) {
  if (!audit || typeof audit !== 'object') return String(fallback || '').trim();
  const rows = Array.isArray(audit.capabilities) ? audit.capabilities : [];
  const counts = audit.counts && typeof audit.counts === 'object' ? audit.counts : {};
  const tested = rows.filter(r => r?.truth_status === 'EXISTANT_ET_TESTE');
  const partial = rows.filter(r => r?.truth_status === 'PARTIEL' || r?.truth_status === 'EXISTANT_MAIS_ECHEC_RUNTIME');
  const blocked = rows.filter(r => ['BLOCKED', 'BLOCKED_EXTERNAL', 'STUB', 'NOT_IMPLEMENTED'].includes(String(r?.truth_status || '')));
  const untested = rows.filter(r => r?.truth_status === 'EXISTANT_NON_TESTE');
  const byCategory = new Map();
  for (const row of rows) {
    const id = String(row?.id || 'unknown');
    const category = String(row?.category || id.split('.')[0] || 'other');
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(row);
  }
  const categoryLines = [...byCategory.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([category, members]) => {
      const ids = members.slice(0, 10).map(row => {
        const status = String(row?.truth_status || 'UNKNOWN');
        return String(row?.id || 'unknown') + '[' + status + ']';
      });
      const extra = members.length > ids.length ? ' +' + (members.length - ids.length) : '';
      return '- ' + category + ' : ' + ids.join(', ') + extra + '.';
    });
  const lines = [
    'Je viens d’inventorier ' + Number(audit.total || rows.length) + ' capacités runtime. Je distingue ce qui existe de ce qui a réellement été testé.',
    '- Testées maintenant : ' + tested.length + (tested.length ? ' — ' + tested.slice(0, 12).map(r => r.id).join(', ') : '') + '.',
    '- Existantes mais non testées maintenant : ' + untested.length + (untested.length ? ' — ' + untested.slice(0, 12).map(r => r.id).join(', ') : '') + '.',
    '- Partielles ou en échec runtime : ' + partial.length + (partial.length ? ' — ' + partial.slice(0, 12).map(r => r.id + ' (' + r.truth_status + ')').join(', ') : '') + '.',
    '- Bloquées / stubs / non implémentées : ' + blocked.length + (blocked.length ? ' — ' + blocked.slice(0, 12).map(r => r.id + ' (' + r.truth_status + ')').join(', ') : '') + '.',
  ];
  if (categoryLines.length) {
    lines.push('Carte de mes capacités par domaine :');
    lines.push(...categoryLines);
  }
  if (audit.deep !== true) lines.push('Cet inventaire n’est pas un test de bout en bout : les capacités non exécutées restent explicitement non testées.');
  if (Object.keys(counts).length) lines.push('Comptage vérité : ' + Object.entries(counts).map(([k,v]) => k + '=' + v).join(', ') + '.');
  return lines.join('\n');
}

export function formatCommunicationAuditResponse(audit, { fallback = '' } = {}) {
  if (!audit || typeof audit !== 'object') return String(fallback || '').trim();
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  const counts = audit.issue_counts && typeof audit.issue_counts === 'object' ? audit.issue_counts : {};
  const lines = [
    'J’ai audité ' + Number(audit.scanned_messages || 0) + ' message(s) de ' + Number(audit.scanned_conversations || 0) + ' conversation(s) sur ' + Number(audit.total_messages || 0) + ' message(s) disponibles dans le périmètre.',
    'J’ai relevé ' + issues.length + ' signalement(s) à examiner : ' + (Object.keys(counts).length ? Object.entries(counts).map(([k,v]) => k + '=' + v).join(', ') : 'aucun signal heuristique') + '.',
  ];
  for (const issue of issues.slice(0, 8)) {
    const where = issue.conversation_id ? ' [' + issue.conversation_id + ']' : '';
    lines.push('- ' + String(issue.type || 'ISSUE') + where + ' : ' + clip(issue.summary || issue.assistant_excerpt || issue.user_excerpt || '', 260));
  }
  if (audit.truncated === true) lines.push('L’audit est borné : les messages plus anciens n’ont pas tous été relus dans ce passage.');
  lines.push('Ces signalements sont des indices déterministes à corriger, pas des verdicts : une contradiction apparente peut parfois correspondre à un état qui a réellement changé.');
  return lines.join('\n');
}
