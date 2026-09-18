import { detectCapabilityGap } from '../evolution/capability-gap-detector.js';
import { proposeModuleDraft, proposePluginDraft } from '../capabilities/module-proposal-capability.js';

export const ECOSYSTEM_DISCOVERY_SCHEMA = 'mel.ecosystem-discovery-plan/v1';
export const ECOSYSTEM_DISCOVERY_LEDGER_SCHEMA = 'mel.ecosystem-discovery-ledger/v1';

function text(value, max = 800) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function keyOf(value) {
  return text(value, 160).toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '');
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

    for (const rawHint of Array.isArray(target?.metadata?.capabilities) ? target.metadata.capabilities : []) {
      const hint = text(rawHint, 160);
      const normalized = keyOf(hint);
      if (!normalized) continue;
      const fingerprint = `capability:${normalized}`;
      const existing = deduped.get(fingerprint);
      if (existing) {
        existing.observed_on.push(target.id);
        existing.sources = [...new Map([...existing.sources, ...evidence.sources].map(source => [source.url, source])).values()].slice(0, 8);
        existing.citations_count = Math.max(existing.citations_count, evidence.citations_count);
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
        best_match: gap.best_match,
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
      ...item,
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
