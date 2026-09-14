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

/**
 * Canonical XP journal writer for MEL learning evidence.
 * XP is always recomputed from buildLearningProgress; this function never
 * accepts an arbitrary XP amount. A gain is awarded only when it is strictly
 * monotone and durable proof artifacts are attached. The persisted canonical
 * XP never decreases, including no-proof or regression snapshots.
 */
export async function recordLearningXpCheckpoint({ memory, report = {}, date = '', reason = '', artifacts = [], source_sha = null, now = () => new Date() } = {}) {
  if (!memory || typeof memory.recent !== 'function' || typeof memory.remember !== 'function') {
    throw Object.assign(new Error('LEARNING_MEMORY_REQUIRED'), { code: 'LEARNING_MEMORY_REQUIRED' });
  }

  const progress = buildLearningProgress(report);
  const previousRows = await memory.recent({ limit: 1, kind: 'LEARNING_XP_CHECKPOINT' });
  const previous = parseEvidence(previousRows[0]);
  const previousXp = asInt(previous?.xp_after ?? previous?.xp ?? 0);
  const proofs = normalizeArtifacts(artifacts);
  const measuredDelta = progress.xp - previousXp;
  const awarded = measuredDelta > 0 && proofs.length > 0;
  const canonicalXp = awarded ? progress.xp : previousXp;
  const instant = now();

  const evidence = {
    schema: 'mel.learning-xp-checkpoint',
    version: 2,
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
    progress,
  };

  await memory.remember({
    goal: 'MEL canonical daily XP evidence checkpoint',
    kind: 'LEARNING_XP_CHECKPOINT',
    lesson: awarded
      ? `XP verified ${previousXp} -> ${canonicalXp} (+${measuredDelta}) with durable evidence.`
      : `XP held at ${previousXp}: no strictly proven gain with durable evidence.`,
    evidence,
    outcome: awarded ? 'SUCCEEDED' : 'NO_GAIN',
    score: awarded ? measuredDelta : 0,
    tags: ['learning', 'xp', awarded ? 'verified-gain' : 'no-gain'],
  });
  return evidence;
}
