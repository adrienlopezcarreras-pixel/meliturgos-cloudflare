// MEL WORK: bounded, resumable first execution from an explicit owner kickoff.
// This is NOT a paid-task claim, submission or financial operation.
const TASKMARKET_API = 'https://api.taskmarket.dev/api/tasks';
const PREP_KINDS = Object.freeze(['writing', 'data', 'code']);

export function isMelWorkKickoff(text) {
  const value = String(text || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Require the explicit owner mission heading. Quoted mentions and status
  // questions must never create jobs.
  return /^#?\s*mel\s*work\s*[—–:\-]\s*demarrer\s+immediatement\s+ma\s+preparation\s+au\s+travail\s+remunere\b/.test(value)
    && value.includes('agente de travail numerique');
}

function stablePlanId(conversationId, text) {
  let hash = 2166136261;
  for (const ch of String(text || '')) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const conversation = String(conversationId || 'unknown').replace(/[^a-z0-9_-]/gi, '-').slice(0, 100);
  return `melwork-kickoff-${conversation}-${(hash >>> 0).toString(16)}`;
}

export function performMelWorkPractice(kind) {
  if (kind === 'writing') {
    const source = ' bonjour ,  merci de nous envoyer le document avant vendredi . cordialement  ';
    const corrected = 'Bonjour, merci de nous envoyer le document avant vendredi. Cordialement.';
    return {
      kind: 'training_sample', category: 'professional_writing', source, corrected,
      quality_checks: {
        punctuation_spacing: !/\s+[,.]/.test(corrected),
        normalized_whitespace: !/\s{2,}/.test(corrected),
        capitalized_opening: corrected.startsWith('Bonjour'),
      },
      note: 'Exercice sur un exemple intégré ; ce n’est ni un document client ni une mission rémunérée.',
    };
  }
  if (kind === 'data') {
    const source = [
      { name: ' Alice  Martin ', email: ' ALICE@example.com ' },
      { name: 'Alice Martin', email: 'alice@example.com' },
      { name: ' Bob Durand ', email: 'bob@example.com' },
      { name: 'Inconnu', email: 'courriel-invalide' },
    ];
    const seen = new Set();
    const cleanRows = [];
    let invalid = 0;
    let duplicates = 0;
    for (const row of source) {
      const name = row.name.trim().replace(/\s+/g, ' ');
      const email = row.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { invalid++; continue; }
      if (seen.has(email)) { duplicates++; continue; }
      seen.add(email);
      cleanRows.push({ name, email });
    }
    return {
      kind: 'training_sample', category: 'data_quality',
      source_row_count: source.length, clean_rows: cleanRows,
      rejected_invalid: invalid, rejected_duplicates: duplicates,
      quality_checks: { unique_emails: new Set(cleanRows.map(r => r.email)).size === cleanRows.length, all_valid: cleanRows.every(r => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) },
      note: 'Nettoyage réellement exécuté sur des données d’exercice ; aucune donnée client.',
    };
  }
  if (kind === 'code') {
    const buggy = 'const sum = values => values.reduce((a, b) => a + b);';
    const corrected = 'const sum = values => values.reduce((a, b) => a + b, 0);';
    const sum = values => values.reduce((a, b) => a + b, 0);
    const checks = { empty_array: sum([]) === 0, positive_numbers: sum([1, 2, 3]) === 6, negative_numbers: sum([-2, 1]) === -1 };
    return {
      kind: 'training_sample', category: 'software_testing', buggy, corrected,
      quality_checks: checks,
      note: 'Correctif et tests d’exemple réellement exécutés ; pas une modification du dépôt MEL.',
    };
  }
  throw Object.assign(new Error('MEL_WORK_PRACTICE_KIND_UNKNOWN'), { code: 'MEL_WORK_PRACTICE_KIND_UNKNOWN' });
}

// Exact arithmetic on bounded chunks; Work DAG checkpoints each chunk so a
// later worker can resume without repeating prior successful calculations.
export function computeMelWorkChunk({ start, count } = {}) {
  if (!Number.isSafeInteger(start) || start < 1 || start > 1000000000
      || !Number.isSafeInteger(count) || count < 1 || count > 25000
      || start + count > 1000025000) {
    throw Object.assign(new Error('MEL_WORK_COMPUTE_RANGE_INVALID'), { code: 'MEL_WORK_COMPUTE_RANGE_INVALID' });
  }
  let sum = 0n;
  const first = BigInt(start);
  const last = BigInt(start + count - 1);
  for (let i = start; i < start + count; i += 1) sum += BigInt(i) ** 2n;
  const sumSquaresUpTo = n => n * (n + 1n) * (2n * n + 1n) / 6n;
  const independentlyVerified = sum === sumSquaresUpTo(last) - sumSquaresUpTo(first - 1n);
  if (!independentlyVerified) throw Object.assign(new Error('MEL_WORK_COMPUTE_CHECK_FAILED'), { code: 'MEL_WORK_COMPUTE_CHECK_FAILED' });
  return {
    kind: 'computation_sample', category: 'exact_bigint_arithmetic',
    start, count, end: start + count - 1, sum_of_squares: sum.toString(),
    quality_checks: { closed_form_match: independentlyVerified },
    note: 'Calcul exact, vérifié et checkpointé sur un segment borné; aucun résultat client prétendu.',
  };
}

export function registerMelWorkKickoffCapabilities(bus, { fetchImpl = fetch } = {}) {
  bus.discover({
    id: 'melwork.practice', name: 'Entraînement professionnel MEL WORK',
    category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Réalise et vérifie un exercice réel sur jeu de données intégré; retourne un artefact de formation, pas une mission payée.',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: PREP_KINDS } }, required: ['kind'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async input => {
    const result = performMelWorkPractice(input.kind);
    if (!Object.values(result.quality_checks).every(Boolean)) throw Object.assign(new Error('MEL_WORK_PRACTICE_FAILED'), { code: 'MEL_WORK_PRACTICE_FAILED' });
    return { ok: true, artifacts: [result] };
  });
  bus.discover({
    id: 'melwork.compute.chunk', name: 'Calcul complexe MEL WORK en étapes vérifiées',
    category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Calcul arithmétique exact par chunk borné et vérification indépendante, avec reprise via Work DAG.',
    input_schema: { type: 'object', properties: {
      start: { type: 'integer', minimum: 1, maximum: 1000000000 },
      count: { type: 'integer', minimum: 1, maximum: 25000 },
    }, required: ['start', 'count'], additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async input => ({ok: true, artifacts: [computeMelWorkChunk(input)]}));
  bus.discover({
    id: 'melwork.market.scan', name: 'Lire les offres publiques Taskmarket',
    category: 'work', version: '1.0.0', provider: 'mel',
    description: 'Scans Taskmarket open listings in read-only mode, with a bounded timeout; never claims, submits, or pays.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW', permissions: [], health: 'HEALTHY', enabled: true,
  }, async () => {
    let report = { kind: 'market_observation', source: 'taskmarket-public-api', status: 'UNAVAILABLE', offer_count: null, offers: [] };
    try {
      const url = new URL(TASKMARKET_API);
      url.searchParams.set('status', 'open');
      url.searchParams.set('sort', 'reward_desc');
      url.searchParams.set('limit', '20');
      const response = await fetchImpl(url.toString(), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(6500) });
      if (!response.ok) throw new Error('UPSTREAM_HTTP_' + response.status);
      const payload = await response.json();
      const rows = Array.isArray(payload?.data?.tasks) ? payload.data.tasks : Array.isArray(payload?.tasks) ? payload.tasks : null;
      if (!rows) throw new Error('UPSTREAM_SCHEMA_INVALID');
      const now = Date.now();
      const offers = rows.filter(row =>
        row && typeof row.id === 'string' && String(row.status).toLowerCase() === 'open'
        && typeof row.description === 'string' && Date.parse(row.expiryTime) > now
      ).slice(0, 12).map(row => ({
        id: row.id.slice(0, 100),
        reference: String(row.referenceCode || '').slice(0, 80),
        summary: row.description.slice(0, 220),
        reward_base_units: /^[0-9]+$/.test(String(row.reward || '')) ? String(row.reward) : null,
        requires_review: true,
      }));
      report = { ...report, status: 'OBSERVED', offer_count: offers.length, offers };
    } catch (error) {
      report = { ...report, error_code: String(error?.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : error?.message || 'UNKNOWN').slice(0, 80) };
    }
    return { ok: true, artifacts: [report] };
  });
}

export async function startMelWorkKickoff({ bus, text, conversationId, context }) {
  const id = stablePlanId(conversationId, text);
  const goal = ('MEL WORK : préparation opérationnelle au travail numérique rémunéré. Demande originale : ' + String(text || '')).slice(0, 3900);
  const steps = [
    { id: 'writing-practice', title: 'Corriger un échantillon de rédaction professionnelle', capability: 'melwork.practice', input: { kind: 'writing' }, idempotent: true },
    { id: 'data-practice', title: 'Nettoyer et vérifier un échantillon de données', capability: 'melwork.practice', input: { kind: 'data' }, dependsOn: ['writing-practice'], idempotent: true },
    { id: 'code-practice', title: 'Corriger un petit programme et exécuter ses tests', capability: 'melwork.practice', input: { kind: 'code' }, dependsOn: ['data-practice'], idempotent: true },
    { id: 'calculation-1', title: 'Calcul exact et contrôle indépendant — segment 1', capability: 'melwork.compute.chunk', input: { start: 1, count: 20000 }, dependsOn: ['code-practice'], idempotent: true },
    { id: 'calculation-2', title: 'Calcul exact et contrôle indépendant — segment 2', capability: 'melwork.compute.chunk', input: { start: 20001, count: 20000 }, dependsOn: ['calculation-1'], idempotent: true },
    { id: 'calculation-3', title: 'Calcul exact et contrôle indépendant — segment 3', capability: 'melwork.compute.chunk', input: { start: 40001, count: 20000 }, dependsOn: ['calculation-2'], idempotent: true },
    { id: 'market-scan', title: 'Repérer les missions publiques disponibles, sans candidature', capability: 'melwork.market.scan', input: {}, dependsOn: ['calculation-3'], idempotent: true },
  ];
  const execute = async (name, input) => bus.execute(name, input, context);
  let saved = false;
  try {
    try {
      await execute('work.plan.save', {
        id, conversationId, goal,
        constraints: [
          'Préparation et exercices réels, sur données d’exemple, sans frais ni fournisseurs payants.',
          'Taskmarket en lecture seule : aucune réclamation, soumission, signature, paiement ni accès aux secrets.',
          'Ne pas présenter les exercices comme des missions rémunérées ; conserver preuves et artefacts D1.',
          'Actions sur le PC seulement après consentement Companion explicite et résultat confirmé.',
        ],
        steps,
      });
      saved = true;
    } catch (error) {
      // An HTTP retry of the same kickoff must resume, not duplicate a plan.
      const existing = await execute('work.plan.get', { id }).catch(() => null);
      const plan = existing?.plan || existing;
      if (String(plan?.id || '') !== id) throw error;
      saved = true;
    }
    const materialized = await execute('work.plan.materialize', { id });
    const workDagId = String(materialized?.plan?.work_dag_id || materialized?.work?.id || '').trim();
    if (!workDagId) throw Object.assign(new Error('MEL_WORK_DAG_ID_MISSING'), { code: 'MEL_WORK_DAG_ID_MISSING' });
    const executed = await execute('work.run', { id: workDagId });
    const synced = await execute('work.plan.sync', { id });
    const evidence = await execute('work.artifacts', { id: workDagId });
    const artifacts = Array.isArray(evidence?.artifacts) ? evidence.artifacts : [];
    const trainingCount = artifacts.filter(row => row?.artifact?.kind === 'training_sample').length;
    const computationCount = artifacts.filter(row => row?.artifact?.kind === 'computation_sample' && row.artifact.quality_checks?.closed_form_match === true).length;
    const market = artifacts.find(row => row?.artifact?.kind === 'market_observation')?.artifact || null;
    return {
      ok: true, persisted: true, plan_id: id, work_dag_id: workDagId,
      status: String(synced?.work?.status || executed?.status || 'UNKNOWN'),
      training_exercises_verified: trainingCount,
      calculation_chunks_verified: computationCount,
      taskmarket_status: market?.status || 'NOT_EXECUTED',
      taskmarket_offer_count: market?.offer_count ?? null,
      external_actions: 0,
    };
  } catch (error) {
    return { ok: false, persisted: saved, plan_id: saved ? id : null, status: 'BLOCKED',
      error_code: String(error?.code || error?.message || 'MEL_WORK_KICKOFF_FAILED').slice(0, 150) };
  }
}
