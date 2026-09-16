import { BOOTSTRAP_CORRECTIONS as LEGACY_BOOTSTRAP_CORRECTIONS } from './bootstrap-corrections-legacy.js';
import { DEVELOPMENT_EXPERIENCE_PACK } from './development-experience-pack.js';

/**
 * Canonical bootstrap corpus consumed by LearningEngine.
 *
 * Historical lessons are preserved byte-for-byte in bootstrap-corrections-legacy.js.
 * New reusable development experience belongs in development-experience-pack.js so
 * agents and MEL have one obvious place to extend without rediscovering the wiring.
 */
export const BOOTSTRAP_CORRECTIONS = Object.freeze([
  ...LEGACY_BOOTSTRAP_CORRECTIONS,
  ...DEVELOPMENT_EXPERIENCE_PACK,
]);
