import { buildLearningProgress } from './progress.js';

const asInt = (value) => Math.max(0, Math.trunc(Number(value) || 0));

function parseEvidence(row) {
  const value = row?.evidence;
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function normalizeArtifacts(artifacts = []) {
  return [...new Set((Array.isArray(artifacts) ? artifacts : [])
    .map(value => String(value || '').trim())
    .filter(Boolean))].slice(0, 50);
}

function benchmarkProofSummary(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    schema: value.schema || null,
    suite_id: value.suite_id || null,
    suite_digest: value.suite_digest || null,
    source_sha: value.source_sha || null,
    xp_eligible: value.xp_eligible === true,
    comparison: value.comparison || null,
    domain_regressions: Array.isArray(value.domain_regressions) ? value.domain_regressions : [],
    repeated_errors: Array.isArray(value.repeated_errors) ? value.repeated_errors : [],
    artifacts: Array.isArray(value.artifacts) ? value.artifacts : [],
  };
}

/**
 * Canonical XP journal writer for MEL learning evidence.
 * XP is always recomputed from buildLearningProgress; this function never
 * accepts an arbitrary XP amount. A gain is awarded only when it is strictly
 * monotone and durable proof artifacts are attached. If the gain contains a
 * benchmark component, a canonical non-regressive benchmark comparison must
 * explicitly mark that comparison XP-eligible. The persisted canonical XP
 * never decreases, including no-proof or regression snapshots.
 */
export async function recordLearningXpCheckpoint({ memory, report = {}, date = '', reason = '', artifacts = [], source_sha = null, benchmark_evidence = null, now = () => new Date() } = {}) {
  if (!memory || typeof memory.recent !== 'function' || typeof memory.remember !== 'function') {
    throw Object.assign(new Error('LEARNING_MEMORY_REQUIRED'), { code: 'LEARNING_MEMORY_REQUIRED' });
  }

  const progress = buildLearningProgress(report);
  const previousRows = await memory.recent({ limit: 1, kind: 'LEARNING_XP_CHECKPOINT' });
  const previous = parseEvidence(previousRows[0]);
  const previousXp = asInt(previous?.xp_after ?? previous?.xp ?? 0);
  const proofs = normalizeArtifacts(artifacts);
  const measuredDelta = progress.xp - previousXp;
  const benchmarkGainXp = asInt(progress?.xp_components?.benchmark_gain_xp);
  const benchmarkProofRequired = benchmarkGainXp > 0;
  const benchmarkProof = benchmarkProofSummary(benchmark_evidence);
  const benchmarkProofValid = !benchmarkProofRequired || benchmarkProof?.xp_eligible === true;
  const awarded = measuredDelta > 0 && proofs.length > 0 && benchmarkProofValid;
  const canonicalXp = awarded ? progress.xp : previousXp;
  const instant = now();

  const evidence = {
    schema: 'mel.learning-xp-checkpoint',
    version: 3,
    date: String(date || instant.toISOString().slice(0, 10)),
    recorded_at: instant.toISOString(),
    source_sha: source_sha ? String(source_sha) : null,
    reason: String(reason || '').slice(0, 1000),
    xp_before: previousXp,
    xp_after: canonicalXp,
    observed_xp: progress.xp,
    xp_delta: awarded ? measuredDelta : 0,
    measured_delta: measuredDelta,
    awarded,
    artifacts: proofs,
    benchmark_proof_required: benchmarkProofRequired,
    benchmark_proof_valid: benchmarkProofValid,
    benchmark_evidence: benchmarkProof,
    progress,
  };

  await memory.remember({
    goal: 'MEL canonical daily XP evidence checkpoint',
    kind: 'LEARNING_XP_CHECKPOINT',
    lesson: awarded
      ? `XP verified ${previousXp} -> ${canonicalXp} (+${measuredDelta}) with durable evidence.`
      : benchmarkProofRequired && !benchmarkProofValid
        ? `XP held at ${previousXp}: benchmark-derived gain lacks an XP-eligible canonical comparison proof.`
        : `XP held at ${previousXp}: no strictly proven gain with durable evidence.`,
    evidence,
    outcome: awarded ? 'SUCCEEDED' : 'NO_GAIN',
    score: awarded ? measuredDelta : 0,
    tags: ['learning', 'xp', awarded ? 'verified-gain' : 'no-gain'],
  });
  return evidence;
}
