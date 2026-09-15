import { buildLearningProgress } from './progress.js';

const PROJECT_EXPERIENCE_SOURCE = 'project_experience_consolidation_v1';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNonNegativeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function rankForLevel(level) {
  if (level >= 30) return 'Évolution';
  if (level >= 20) return 'Maîtrise';
  if (level >= 12) return 'Consolidation';
  if (level >= 6) return 'Apprentissage';
  return 'Éveil';
}

function readEvidence(row) {
  if (!row || typeof row !== 'object') return null;
  if (row.evidence && typeof row.evidence === 'object') return row.evidence;
  if (!row.evidence_json) return null;
  try {
    const parsed = typeof row.evidence_json === 'string' ? JSON.parse(row.evidence_json) : row.evidence_json;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function applyCanonicalXp(progress = {}, canonicalXp = 0) {
  const xp = finiteNonNegativeInt(canonicalXp, finiteNonNegativeInt(progress.xp, 0));
  const level = Math.min(99, Math.floor(Math.sqrt(xp / 250)) + 1);
  const levelStartXp = 250 * Math.pow(level - 1, 2);
  const nextLevelXp = level >= 99 ? levelStartXp : 250 * Math.pow(level, 2);
  const levelSpan = Math.max(1, nextLevelXp - levelStartXp);
  const levelProgress = level >= 99 ? 1 : clamp((xp - levelStartXp) / levelSpan, 0, 1);

  return {
    ...progress,
    xp,
    level,
    rank: rankForLevel(level),
    level_start_xp: levelStartXp,
    next_level_xp: nextLevelXp,
    xp_into_level: Math.max(0, xp - levelStartXp),
    xp_to_next_level: level >= 99 ? 0 : Math.max(0, nextLevelXp - xp),
    level_progress: levelProgress,
    level_progress_percent: Math.round(levelProgress * 1000) / 10,
  };
}

async function latestVerifiedCheckpoint(memory) {
  if (!memory || typeof memory.recent !== 'function') return null;
  try {
    const rows = await memory.recent({ limit: 1, kind: 'LEARNING_XP_CHECKPOINT' });
    const row = Array.isArray(rows) ? rows[0] : null;
    const evidence = readEvidence(row);
    const xp = Number(evidence?.xp_after);
    if (!Number.isFinite(xp) || xp < 0) return null;
    return {
      xp: Math.trunc(xp),
      recorded_at: evidence?.recorded_at || row?.created_at || null,
      source_sha: evidence?.source_sha || null,
      awarded: evidence?.awarded === true,
    };
  } catch {
    return null;
  }
}

async function projectExperienceStatus(db) {
  const base = {
    count: 0,
    source: PROJECT_EXPERIENCE_SOURCE,
    kind: 'lesson',
    available: false,
  };
  if (!db || typeof db.prepare !== 'function') return base;
  try {
    const row = await db.prepare(
      'SELECT COUNT(*) AS count FROM memories WHERE source = ?'
    ).bind(PROJECT_EXPERIENCE_SOURCE).first();
    return {
      ...base,
      count: finiteNonNegativeInt(row?.count, 0),
      available: true,
    };
  } catch {
    return base;
  }
}

/**
 * Builds the live learning state shown by /professor.
 *
 * The displayed XP is canonical when a verified XP journal checkpoint exists.
 * Project-experience memories are surfaced separately and NEVER converted into XP.
 */
export async function getLiveLearningProgress({ engine, db, now = () => new Date() } = {}) {
  if (!engine || typeof engine.report !== 'function') throw new Error('LEARNING_ENGINE_REQUIRED');

  const report = await engine.report();
  const observed = buildLearningProgress(report);
  const [checkpoint, projectExperience] = await Promise.all([
    latestVerifiedCheckpoint(engine.memory),
    projectExperienceStatus(db),
  ]);

  const canonical = checkpoint ? applyCanonicalXp(observed, checkpoint.xp) : observed;

  return {
    ...canonical,
    canonical_xp: canonical.xp,
    observed_xp: observed.xp,
    xp_source: checkpoint ? 'verified-journal' : 'current-learning-report',
    xp_checkpoint: checkpoint,
    project_experience: projectExperience,
    measured_at: now().toISOString(),
  };
}

export const LIVE_PROGRESS_PROJECT_EXPERIENCE_SOURCE = PROJECT_EXPERIENCE_SOURCE;
