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


export function formatVerifiedDevBridgeStatusResponse(state, { fallback = '' } = {}) {
  if (!state || typeof state !== 'object' || state.ok !== true) return String(fallback || '').trim();
  const bridge = state.local_bridge && typeof state.local_bridge === 'object' ? state.local_bridge : {};
  const lease = state.autonomy_lease && typeof state.autonomy_lease === 'object' ? state.autonomy_lease : null;
  const counts = state.counts && typeof state.counts === 'object' ? state.counts : {};
  const ready = Array.isArray(state.ready_packages) ? state.ready_packages : [];
  const claimed = Array.isArray(state.claimed_jobs) ? state.claimed_jobs : [];
  const repair = Array.isArray(state.repair_jobs) ? state.repair_jobs : [];
  const review = Array.isArray(state.review_jobs) ? state.review_jobs : [];
  const ageSeconds = bridge.age_ms == null ? null : Math.round(Number(bridge.age_ms || 0) / 1000);
  const localOnline = state.local_polling_effective === true;
  const lines = [
    `Je viens de vérifier le Dev Bridge réel dans la D1${state.observed_at ? ` au ${String(state.observed_at)}` : ''}.`,
    `- Bridge local primary : ${localOnline ? 'ONLINE' : 'OFFLINE'}${bridge.status ? ` (état enregistré ${String(bridge.status)})` : ''}${ageSeconds != null ? ` ; dernier heartbeat il y a ~${ageSeconds} s` : ' ; aucun heartbeat exploitable'}.`,
    `- Polling local effectif maintenant : ${localOnline ? 'oui' : 'non'}.`,
    `- Packages : READY=${Number(counts.ready || 0)}, CLAIMED=${Number(counts.claimed || 0)}, REPAIR_REQUIRED=${Number(counts.repair_required || 0)}, READY_FOR_REVIEW=${Number(counts.ready_for_review || 0)}.`,
  ];
  if (lease) {
    const leaseAge = lease.age_ms == null ? null : Math.round(Number(lease.age_ms || 0) / 1000);
    lines.push(`- Lease autonomie : ${String(lease.status || 'UNKNOWN')}${leaseAge != null ? ` ; âge ~${leaseAge} s` : ''}.`);
  }
  const describe = (row) => {
    const proof = [];
    if (row.teacher_verdict) proof.push(`Teacher=${row.teacher_verdict}${row.owner_override ? '+MAX' : ''}`);
    if (row.bridge_preparation_status) proof.push(`bridge=${row.bridge_preparation_status}`);
    if (row.dev_bridge_status) proof.push(`result=${row.dev_bridge_status}`);
    if (row.candidate_branch) proof.push(`branch=${row.candidate_branch}`);
    return `${row.job_id} — ${row.status}${proof.length ? ` ; ${proof.join(' ; ')}` : ''}`;
  };
  if (ready.length) {
    lines.push('Packages READY visibles :');
    for (const row of ready.slice(0, 8)) lines.push(`- ${describe(row)}`);
  }
  if (claimed.length) {
    lines.push('Jobs actuellement CLAIMED :');
    for (const row of claimed.slice(0, 5)) lines.push(`- ${describe(row)}`);
  }
  if (repair.length) {
    lines.push('Jobs en réparation :');
    for (const row of repair.slice(0, 5)) lines.push(`- ${describe(row)}`);
  }
  if (review.length) {
    lines.push('Jobs prêts pour review :');
    for (const row of review.slice(0, 5)) lines.push(`- ${describe(row)}`);
  }
  if (!localOnline && ready.length) {
    lines.push('Conclusion : le poller local ne consomme pas actuellement ces packages READY ; il faut donc le fallback cloud ou remettre le Dev Bridge local réellement en ligne.');
  } else if (localOnline && ready.length) {
    lines.push('Conclusion : le poller local est vivant et des packages READY existent ; ils doivent être claimés par le bridge sur un prochain cycle.');
  } else if (!ready.length) {
    lines.push('Conclusion : aucun package READY n’attend actuellement un claim local.');
  }
  lines.push('Cette réponse vient de l’état runtime observé maintenant ; je ne te demande pas de confirmer une vérification que je peux exécuter moi-même.');
  return lines.join('\n');
}


export function formatVerifiedAutonomyActivityResponse(activity, { fallback = '' } = {}) {
  if (!activity || typeof activity !== 'object' || activity.ok !== true) return String(fallback || '').trim();
  const control = activity.control && typeof activity.control === 'object' ? activity.control : {};
  const counts = activity.counts && typeof activity.counts === 'object' ? activity.counts : {};
  const jobs = Array.isArray(activity.recent_jobs) ? activity.recent_jobs : [];
  const events = Array.isArray(activity.recent_events) ? activity.recent_events : [];
  const statusCounts = counts.by_status && typeof counts.by_status === 'object'
    ? Object.entries(counts.by_status).map(([status, count]) => `${status}=${Number(count || 0)}`).join(', ')
    : '';

  const mode = control.max_autonomy === true
    ? 'MAX est actif'
    : control.paused === true
      ? 'l’autonomie est en pause'
      : 'l’autonomie est active sans MAX';
  const lines = [
    `Je viens de lire mon état autonome réel${activity.observed_at ? ` au ${String(activity.observed_at)}` : ''} dans la D1 et le ledger. ${mode}.`,
    `Jobs supervisés visibles : ${Number(counts.supervised_total || 0)}${statusCounts ? ` — ${statusCounts}` : ''}.`,
  ];

  if (jobs.length) {
    lines.push('Travaux récents :');
    for (const job of jobs.slice(0, 8)) {
      const proof = job.completion_status
        ? ` ; completion=${job.completion_status}${job.completion_sha ? `@${shortSha(job.completion_sha)}` : ''}${job.completion_ci_run_id ? ` ; CI=${job.completion_ci_run_id}` : ''}`
        : '';
      const teacher = job.teacher_verdict ? ` ; Teacher=${job.teacher_verdict}${job.owner_override ? ' + override MAX' : ''}` : '';
      const bridge = job.bridge_preparation_status ? ` ; bridge=${job.bridge_preparation_status}` : '';
      const error = job.error ? ` ; erreur=${String(job.error).slice(0, 120)}` : '';
      lines.push(`- ${String(job.job_id || 'job-inconnu')} — ${String(job.status || 'UNKNOWN')}${job.roadmap_id ? ` [${job.roadmap_id}]` : ''}${teacher}${bridge}${proof}${error} — ${clip(job.goal || '', 180)}`);
    }
  } else {
    lines.push('Aucun job autonome récent n’est visible dans le périmètre lu.');
  }

  if (events.length) {
    lines.push('Derniers événements du ledger :');
    for (const event of events.slice(0, 8)) {
      const sha = event.source_sha ? ` ; SHA=${shortSha(event.source_sha)}` : '';
      lines.push(`- #${Number(event.seq || 0)} ${String(event.evolution_id || 'inconnu')} — ${String(event.stage || 'UNKNOWN')} / ${String(event.status || 'UNKNOWN')}${sha}`);
    }
  }

  lines.push('Cette réponse vient des états persistés observés maintenant ; je n’utilise pas une ancienne conversation comme preuve de mon activité actuelle.');
  return lines.join('\n');
}


function clip(value, limit = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : text.slice(0, Math.max(0, limit - 1)) + '…';
}

export function formatVerifiedCapabilityAuditResponse(audit, { fallback = '' } = {}) {
  if (!audit || typeof audit !== 'object') return String(fallback || '').trim();

  if (audit.persistent === true) {
    const status = String(audit.status || 'UNKNOWN').toUpperCase();
    const progress = audit.progress && typeof audit.progress === 'object' ? audit.progress : {};
    const done = Number(progress.done || 0);
    const total = Number(progress.total || 0);
    const pass = Number(progress.pass || 1);
    const current = String(progress.current_capability || '').trim();
    const jobId = String(audit.job_id || audit.id || '').trim();
    const prefix = [
      'Stress test global persistant : ' + status + '.',
      jobId ? 'job_id=' + jobId + '.' : '',
      total > 0 ? 'Progression : ' + done + '/' + total + ' (passe ' + pass + ')' + (current ? ', capacité en cours : ' + current : '') + '.' : '',
    ].filter(Boolean);

    if (status === 'FAILED') {
      prefix.push('Erreur : ' + String(audit.error || 'CAPABILITY_STRESS_FAILED') + '.');
      return prefix.join('\n');
    }

    const terminal = ['COMPLETE','COMPLETE_WITH_FAILURES'].includes(status);
    if (!terminal || !audit.report || typeof audit.report !== 'object') {
      const retryCount = Number(audit?.summary?.retryable_failures || 0);
      if (status === 'RETRYING' && retryCount > 0) {
        prefix.push('Une seconde passe reteste automatiquement ' + retryCount + ' échec(s) LOW-risk réellement retestable(s).');
      }
      return prefix.join('\n');
    }

    const detailed = formatVerifiedCapabilityAuditResponse(
      { ...audit.report, persistent: false },
      { fallback }
    );
    const remaining = Array.isArray(audit?.summary?.remaining_runtime_failures)
      ? audit.summary.remaining_runtime_failures
      : [];
    if (status === 'COMPLETE_WITH_FAILURES' && remaining.length) {
      prefix.push('Échecs runtime restant après retry : ' + remaining.slice(0, 20).join(', ') + '.');
    }
    if (Number(audit?.summary?.blocked_count || 0) > 0) {
      prefix.push('Capacités non auto-exécutées par garde-fou : ' + Number(audit.summary.blocked_count) + '.');
    }
    return [prefix.join('\n'), detailed].filter(Boolean).join('\n');
  }

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
