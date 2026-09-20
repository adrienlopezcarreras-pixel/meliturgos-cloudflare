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
  const broad = /[ée]tat\s+(?:r[ée]el|interne|actuel)|tout\s+ce\s+que\s+tu\s+vois|self[- ]?state/i.test(text)
    || !(memory || code || work || capability || autonomy || system);
  return { memory, code, work, capability, autonomy, system, broad };
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
    lines.push(`Capacités : ${n(c.registered)} enregistrée(s), ${n(c.enabled)} activée(s)${health ? ` ; santé ${health}` : ''}.`);
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
