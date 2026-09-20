import { BOOTSTRAP_CORRECTIONS as LEGACY_BOOTSTRAP_CORRECTIONS } from './bootstrap-corrections-legacy.js';
import { DEVELOPMENT_EXPERIENCE_PACK } from './development-experience-pack.js';
import { DEVELOPMENT_EXPERIENCE_RECONCILIATION_20260917 } from './development-experience-reconciliation-20260917.js';
import { LORA_FREE_LESSONS_20260918 } from './lora-free-lessons-20260918.js';
import { EXPERT_PLUS_DISTILLED_LESSONS } from './expert-plus-corpus.js';

/**
 * Canonical bootstrap corpus consumed by LearningEngine.
 *
 * Historical lessons are preserved byte-for-byte in bootstrap-corrections-legacy.js.
 * New reusable development experience belongs in development-experience-pack.js so
 * agents and MEL have one obvious place to extend without rediscovering the wiring.
 * The dated reconciliation supplement restores proven lessons that were awarded or
 * learned before the mandatory XP handoff became systematic; it is ingested through
 * the same LearningEngine bootstrap path and remains immutable audit evidence.
 */
export const BOOTSTRAP_CORRECTIONS = Object.freeze([
  ...LEGACY_BOOTSTRAP_CORRECTIONS,
  ...DEVELOPMENT_EXPERIENCE_PACK,
  ...DEVELOPMENT_EXPERIENCE_RECONCILIATION_20260917,
  ...LORA_FREE_LESSONS_20260918,
  ...EXPERT_PLUS_DISTILLED_LESSONS,
]);
