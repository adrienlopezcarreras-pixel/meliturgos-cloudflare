import { detectCapabilityGap } from '../evolution/capability-gap-detector.js';
import { proposeModuleDraft, proposePluginDraft } from '../capabilities/module-proposal-capability.js';
import { flattenRoadmap } from '../roadmap/master-roadmap.js';

export const ECOSYSTEM_DISCOVERY_SCHEMA = 'mel.ecosystem-discovery-plan/v1';
export const ECOSYSTEM_DISCOVERY_LEDGER_SCHEMA = 'mel.ecosystem-discovery-ledger/v1';

function text(value, max = 800) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function keyOf(value) {
  return text(value, 160).toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '');
}

function wordSet(value) {
  return new Set(
    text(value, 12000)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 4)
  );
}

function roadmapMatches(hint, target = {}, evidence = {}) {
  const query = wordSet([
    hint,
    target?.metadata?.label || '',
    target?.metadata?.category || '',
    evidence?.summary || '',
    evidence?.cross_ai?.best?.text || '',
  ].join(' '));
  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };

  return flattenRoadmap()
    .map(row => {
      const haystack = wordSet([row.id, row.title, row.next, row.phase].join(' '));
      let score = 0;
      for (const token of query) if (haystack.has(token)) score += 1;
      return { row, score };
    })
    .filter(match => match.score > 0)
    .sort((a, b) =>
      b.score - a.score
      || (priorityRank[a.row.priority] ?? 9) - (priorityRank[b.row.priority] ?? 9)
      || String(a.row.id).localeCompare(String(b.row.id))
    )
    .slice(0, 5)
    .map(({ row, score }) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      next: row.next,
      phase: row.phase,
      relevance_score: score,
    }));
}

function proposalKind(hint, target) {
  const source = `${hint} ${target?.metadata?.category || ''} ${target?.metadata?.label || ''}`.toLowerCase();
  return /plugin|connector|integration|mcp|tooling/.test(source) ? 'plugin' : 'module';
}

function evidenceFor(result = {}) {
  const evidence = result?.evidence && typeof result.evidence === 'object' ? result.evidence : {};
  const sources = Array.isArray(evidence.sources)
    ? evidence.sources
        .filter(source => /^https?:\/\//i.test(String(source?.url || '')))
        .slice(0, 5)
        .map(source => ({ title: text(source?.title, 240), url: text(source?.url, 500) }))
    : [];
  const citations = Math.max(0, Number(evidence.citations_count) || sources.length);
  const sourced = String(evidence.status || '').toUpperCase() === 'OBSERVED' && citations > 0 && sources.length > 0;
  return {
    sourced,
    status: text(evidence.status, 80) || null,
    summary: text(evidence.summary, 1400),
    citations_count: citations,
    sources,
    source_class: text(evidence.source_class, 40) || 'official',
    verification_policy: text(evidence.verification_policy, 160) || 'SOURCE_AND_TEST_BEFORE_INTEGRATION',
    cross_ai: evidence.cross_ai && typeof evidence.cross_ai === 'object' ? evidence.cross_ai : null,
    detected_capabilities: Array.isArray(evidence.detected_capabilities)
      ? [...new Set(evidence.detected_capabilities.map(item => text(item, 160)).filter(Boolean))].slice(0, 30)
      : [],
    performed_at: text(evidence.performed_at, 100) || null,
  };
}

function actionForGap(gap) {
  if (gap.classification === 'MATCHED_AVAILABLE') return 'REUSE_EXISTING';
  if (gap.classification === 'MATCHED_BUT_BLOCKED') return 'UNBLOCK_EXISTING';
  if (gap.classification === 'AMBIGUOUS') return 'REVIEW_EXISTING';
  return 'PROPOSE_EXTENSION';
}

export function planEcosystemDiscoveries({ watchResult = {}, catalog = {}, capabilities = [], generatedAt = new Date().toISOString() } = {}) {
  const targets = new Map((Array.isArray(catalog?.targets) ? catalog.targets : []).map(target => [target.id, target]));
  const deduped = new Map();
  let sourcedObservations = 0;

  for (const result of Array.isArray(watchResult?.results) ? watchResult.results : []) {
    const target = targets.get(result?.id);
    if (!target) continue;
    const evidence = evidenceFor(result);
    if (!evidence.sourced) continue;
    sourcedObservations += 1;

    const declaredCapabilities = new Set(Array.isArray(target?.metadata?.capabilities) ? target.metadata.capabilities.map(String) : []);
    const detectedCapabilities = evidence.detected_capabilities.filter(capability => declaredCapabilities.has(capability));
    for (const rawHint of detectedCapabilities) {
      const hint = text(rawHint, 160);
      const normalized = keyOf(hint);
      if (!normalized) continue;
      const fingerprint = `capability:${normalized}`;
      const existing = deduped.get(fingerprint);
      if (existing) {
        existing.observed_on.push(target.id);
        existing.sources = [...new Map([...existing.sources, ...evidence.sources].map(source => [source.url, source])).values()].slice(0, 8);
        existing.citations_count = Math.max(existing.citations_count, evidence.citations_count);
        if (evidence.cross_ai) existing.cross_ai = evidence.cross_ai;
        existing.roadmap_matches = [...new Map([
          ...(existing.roadmap_matches || []),
          ...roadmapMatches(hint, target, evidence),
        ].map(row => [row.id, row])).values()].slice(0, 5);
        continue;
      }

      const gap = detectCapabilityGap({ goal: hint, capabilities, threshold: 1 });
      const action = actionForGap(gap);
      const kind = proposalKind(hint, target);
      let proposal = null;
      if (action === 'PROPOSE_EXTENSION') {
        proposal = kind === 'plugin'
          ? proposePluginDraft({ goal: hint, capabilities, threshold: 1 })
          : proposeModuleDraft({ goal: hint, capabilities, threshold: 1 });
      }

      deduped.set(fingerprint, {
        fingerprint,
        capability_hint: hint,
        category: text(target?.metadata?.category, 80),
        suggested_kind: kind,
        classification: gap.classification,
        confidence: gap.confidence,
        action,
        optimization_action: action === 'REUSE_EXISTING' ? 'COMPARE_EXISTING_WITH_ALTERNATIVE' : null,
        best_match: gap.best_match,
        roadmap_matches: roadmapMatches(hint, target, evidence),
        source_class: evidence.source_class,
        verification_policy: evidence.verification_policy,
        cross_ai: evidence.cross_ai,
        proposal: proposal?.manifest ? {
          decision: proposal.decision,
          manifest: proposal.manifest,
          acceptance_tests: proposal.acceptance_tests,
          activation_allowed: false,
        } : null,
        observed_on: [target.id],
        citations_count: evidence.citations_count,
        sources: evidence.sources,
        evidence_status: 'SOURCED_OBSERVATION',
      });
    }
  }

  return {
    schema: ECOSYSTEM_DISCOVERY_SCHEMA,
    generated_at: generatedAt,
    source_watch_status: text(watchResult?.status, 80) || null,
    source_watch_sha: text(watchResult?.source_sha, 80) || null,
    sourced_observations: sourcedObservations,
    items: [...deduped.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
    rules: {
      deduplicate_before_proposal: true,
      reuse_existing_first: true,
      no_code_generation: true,
      no_activation: true,
      production_requires_human_approval: true,
    },
  };
}

export function mergeEcosystemDiscoveryLedger(previous = {}, plan = {}, now = Date.now()) {
  const existing = new Map(
    (Array.isArray(previous?.items) ? previous.items : [])
      .filter(item => item?.fingerprint)
      .map(item => [item.fingerprint, item])
  );
  for (const item of Array.isArray(plan?.items) ? plan.items : []) {
    const before = existing.get(item.fingerprint);
    existing.set(item.fingerprint, {
      ...(before || {}),
      ...item,
      handoff: before?.handoff || item?.handoff || null,
      first_seen_at: before?.first_seen_at || now,
      last_seen_at: now,
      seen_count: Math.max(0, Number(before?.seen_count) || 0) + 1,
    });
  }
  return {
    schema: ECOSYSTEM_DISCOVERY_LEDGER_SCHEMA,
    updated_at: now,
    run_count: Math.max(0, Number(previous?.run_count) || 0) + 1,
    last_plan_generated_at: plan?.generated_at || null,
    items: [...existing.values()]
      .sort((a, b) => Number(b.last_seen_at || 0) - Number(a.last_seen_at || 0) || a.fingerprint.localeCompare(b.fingerprint))
      .slice(0, 200),
  };
}


const CLOSED_HANDOFF_STATUSES = new Set(['COMPLETED', 'REJECTED']);
const RETRYABLE_HANDOFF_STATUSES = new Set(['FAILED']);

function handoffAlreadyOwnsItem(item) {
  const handoff = item?.handoff;
  if (!handoff) return false;
  if (handoff.closed === true || CLOSED_HANDOFF_STATUSES.has(String(handoff.status || '').toUpperCase())) return true;
  if (handoff.job_id && !RETRYABLE_HANDOFF_STATUSES.has(String(handoff.status || '').toUpperCase())) return true;
  return false;
}

function developmentGoal(item) {
  const hint = text(item?.capability_hint, 160);
  const target = text(item?.best_match?.id, 160);
  const roadmap = (Array.isArray(item?.roadmap_matches) ? item.roadmap_matches : [])
    .slice(0, 5)
    .map(row => row.id + ' — ' + row.title + ' [' + row.status + '/' + row.priority + ']')
    .join(' | ');
  const advisory = text(item?.cross_ai?.best?.text, 2400);

  if (item?.action === 'REUSE_EXISTING' && target) {
    return [
      'Optimiser la capacité existante ' + target + ' à partir de la découverte sourcée « ' + hint + ' », sans créer de doublon.',
      roadmap ? 'Comparer explicitement avec la feuille de route concernée: ' + roadmap + '.' : '',
      advisory ? 'Avis multi-IA à vérifier: ' + advisory : '',
      'Chercher si une alternative disponible fait mieux que le choix actuel.',
      'Comparer qualité, fiabilité, latence, coût, permissions, portabilité, maintenance, provenance et réversibilité.',
      'Conserver le choix actuel tant qu’un test reproductible ne démontre pas un gain net sans régression.',
    ].filter(Boolean).join(' ');
  }

  if (item?.action === 'UNBLOCK_EXISTING' && target) {
    return [
      'Débloquer la capacité existante ' + target + ' sans créer de capacité en doublon.',
      'Évaluer la découverte sourcée « ' + hint + ' » et, seulement si elle est adaptée, brancher le provider ou connecteur minimal sur le port canonique existant.',
      roadmap ? 'Vérifier l’impact sur la feuille de route: ' + roadmap + '.' : '',
      'Conserver les permissions, le fail-closed, les tests, la provenance et le rollback.',
    ].filter(Boolean).join(' ');
  }

  return [
    'Évaluer la découverte sourcée « ' + hint + ' ».',
    roadmap ? 'La confronter aux éléments de feuille de route suivants: ' + roadmap + '.' : '',
    advisory ? 'Avis multi-IA à vérifier: ' + advisory : '',
    'Comparer d’abord les options déjà disponibles avant de proposer une nouvelle extension.',
    'Ne rien activer ni remplacer avant comparaison, revue et tests.',
  ].filter(Boolean).join(' ');
}
function candidateRank(item) {
  const action = item?.action === 'UNBLOCK_EXISTING' ? 0 : 1;
  const creative = item?.category === 'creative' ? 0 : 1;
  const citations = -Math.max(0, Number(item?.citations_count) || 0);
  const seen = -Math.max(0, Number(item?.seen_count) || 0);
  return [action, creative, citations, seen, String(item?.fingerprint || '')];
}

export function selectEcosystemDiscoveryCandidate(ledger = {}) {
  const items = (Array.isArray(ledger?.items) ? ledger.items : [])
    .filter(item => item?.evidence_status === 'SOURCED_OBSERVATION')
    .filter(item => ['UNBLOCK_EXISTING', 'PROPOSE_EXTENSION'].includes(item?.action))
    .filter(item => Array.isArray(item?.sources) && item.sources.length > 0)
    .filter(item => item?.action !== 'PROPOSE_EXTENSION' || item?.proposal?.activation_allowed === false)
    .filter(item => !handoffAlreadyOwnsItem(item) && !handoffOwnsDiscovery(item));

  items.sort((a, b) => {
    const ra = candidateRank(a);
    const rb = candidateRank(b);
    for (let i = 0; i < ra.length; i += 1) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  });

  const item = items[0];
  if (!item) return null;
  return {
    ...item,
    goal: developmentGoal(item),
    roadmap_id: 'GEN2-42',
    inspection_paths: [
      'src/evaluation/ecosystem-watch-catalog.js',
      'src/evaluation/ecosystem-discovery-planner.js',
      'src/evaluation/capability-watch-runtime.js',
      'src/capabilities/creative-media-capabilities.js',
      'src/capabilities/module-proposal-capability.js',
      'src/evolution/owner-development-queue.js',
    ],
    inspection_queries: [
      item.capability_hint,
      item.best_match?.id || '',
      'GEN2-42',
    ].filter(Boolean),
  };
}

export function markEcosystemDiscoveryHandoff(ledger = {}, fingerprint, handoff = {}, now = Date.now()) {
  const target = String(fingerprint || '');
  return {
    ...ledger,
    updated_at: now,
    items: (Array.isArray(ledger?.items) ? ledger.items : []).map(item => {
      if (item?.fingerprint !== target) return item;
      const before = item.handoff && typeof item.handoff === 'object' ? item.handoff : {};
      const status = String(handoff?.status || before?.status || '').toUpperCase();
      const resolved = ['WAITING_TEACHER', 'TEACHER_APPROVED', 'READY_FOR_REVIEW', 'COMPLETED', 'REUSE_EXISTING', 'REVIEW_EXISTING'].includes(status);
      const hasCode = Object.prototype.hasOwnProperty.call(handoff || {}, 'code');
      return {
        ...item,
        handoff: {
          ...before,
          ...handoff,
          code: hasCode ? handoff.code : (resolved ? null : (before.code || null)),
          retryable: resolved ? false : (handoff?.retryable ?? before?.retryable ?? false),
          terminal_reason: resolved ? null : (handoff?.terminal_reason ?? before?.terminal_reason ?? null),
          attempts: Math.max(0, Number(before.attempts) || 0) + 1,
          updated_at: now,
        },
      };
    }),
  };
}


const TERMINAL_JOB_STATUSES = new Set(['COMPLETED']);
const ACTIVE_JOB_STATUSES = new Set([
  'QUEUED',
  'CLAIMED',
  'COUNCIL_COMPLETE',
  'WAITING_TEACHER',
  'TEACHER_APPROVED',
  'READY_FOR_REVIEW',
]);

function jobHandoffSnapshot(job, before = {}, now = Date.now()) {
  const status = String(job?.status || '').toUpperCase() || 'UNKNOWN';
  const teacher = job?.result_json?.teacher_bridge || {};
  const lastTeacher = job?.result_json?.last_teacher_review || {};
  const completion = job?.result_json?.autonomy_completion || {};
  const teacherReject = status === 'FAILED'
    && (String(job?.error || '').toUpperCase() === 'TEACHER_REJECT'
      || String(job?.result_json?.autonomy_block_reason || '').toUpperCase() === 'TEACHER_REJECT');
  const closed = TERMINAL_JOB_STATUSES.has(status) || teacherReject;
  const retryable = status === 'FAILED' && !teacherReject;
  return {
    ...before,
    status,
    job_id: String(job?.id || before?.job_id || '') || null,
    teacher_request_id: String(
      teacher?.request?.request_id
      || teacher?.review?.request_id
      || completion?.request_id
      || lastTeacher?.request_id
      || before?.teacher_request_id
      || ''
    ) || null,
    teacher_verdict: String(teacher?.review?.verdict || lastTeacher?.verdict || before?.teacher_verdict || '') || null,
    candidate_sha: String(
      completion?.candidate_sha
      || teacher?.request?.provenance?.candidate_sha
      || teacher?.request?.candidate?.sha
      || before?.candidate_sha
      || ''
    ) || null,
    ci_run_id: Number(completion?.ci?.run_id || before?.ci_run_id || 0) || null,
    completion_verified: completion?.status === 'VERIFIED',
    closed,
    retryable,
    code: status === 'FAILED' ? String(job?.error || before?.code || '').slice(0, 180) || null : null,
    terminal_reason: teacherReject ? 'TEACHER_REJECT' : (status === 'COMPLETED' ? 'VERIFIED_COMPLETION' : null),
    job_updated_at: Number(job?.updated_at || 0) || null,
    reconciled_at: now,
  };
}

export function reconcileEcosystemDiscoveryHandoffs(ledger = {}, jobs = [], now = Date.now()) {
  const byId = new Map(
    (Array.isArray(jobs) ? jobs : [])
      .filter(job => job?.id)
      .map(job => [String(job.id), job])
  );
  let changed = false;
  const items = (Array.isArray(ledger?.items) ? ledger.items : []).map(item => {
    const jobId = String(item?.handoff?.job_id || '');
    if (!jobId) return item;
    const job = byId.get(jobId);
    if (!job) return item;
    const next = jobHandoffSnapshot(job, item.handoff, now);
    const beforeComparable = JSON.stringify({
      status: item.handoff?.status || null,
      teacher_request_id: item.handoff?.teacher_request_id || null,
      teacher_verdict: item.handoff?.teacher_verdict || null,
      candidate_sha: item.handoff?.candidate_sha || null,
      ci_run_id: item.handoff?.ci_run_id || null,
      completion_verified: item.handoff?.completion_verified === true,
      closed: item.handoff?.closed === true,
      retryable: item.handoff?.retryable === true,
      code: item.handoff?.code || null,
      terminal_reason: item.handoff?.terminal_reason || null,
      job_updated_at: Number(item.handoff?.job_updated_at || 0) || null,
    });
    const nextComparable = JSON.stringify({
      status: next.status,
      teacher_request_id: next.teacher_request_id,
      teacher_verdict: next.teacher_verdict,
      candidate_sha: next.candidate_sha,
      ci_run_id: next.ci_run_id,
      completion_verified: next.completion_verified,
      closed: next.closed,
      retryable: next.retryable,
      code: next.code || null,
      terminal_reason: next.terminal_reason,
      job_updated_at: next.job_updated_at,
    });
    if (beforeComparable === nextComparable) return item;
    changed = true;
    return { ...item, handoff: next };
  });
  return {
    changed,
    ledger: changed ? { ...ledger, updated_at: now, items } : ledger,
  };
}

export function handoffOwnsDiscovery(item) {
  const status = String(item?.handoff?.status || '').toUpperCase();
  if (!item?.handoff?.job_id) return false;
  if (item.handoff.closed === true) return true;
  if (status === 'FAILED' && item.handoff.retryable === true) return false;
  return ACTIVE_JOB_STATUSES.has(status) || status !== 'FAILED';
}
