export const XP_CANONICAL_FILE = 'src/learning/development-experience-pack.js';

export const XP_REQUIRED_FIELDS = Object.freeze([
  'id',
  'source',
  'domain',
  'task',
  'input',
  'before',
  'after',
  'rationale',
  'tests',
  'tags',
  'validated',
  'quality',
  'created_at',
]);

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateAgentExperience(row = {}) {
  const issues = [];
  for (const field of XP_REQUIRED_FIELDS) {
    if (!(field in row)) issues.push(`missing:${field}`);
  }
  for (const field of ['id', 'source', 'domain', 'task', 'input', 'before', 'after', 'rationale']) {
    if (field in row && !hasText(row[field])) issues.push(`empty:${field}`);
  }
  if ('tests' in row && (!Array.isArray(row.tests) || row.tests.length === 0)) issues.push('tests:empty');
  if ('tags' in row && (!Array.isArray(row.tags) || row.tags.length === 0)) issues.push('tags:empty');
  if ('quality' in row && (!Number.isFinite(Number(row.quality)) || Number(row.quality) < 0 || Number(row.quality) > 1)) issues.push('quality:range');
  if ('created_at' in row && (!Number.isFinite(Number(row.created_at)) || Number(row.created_at) <= 0)) issues.push('created_at:invalid');
  if (row.validated === true && (!Array.isArray(row.tests) || row.tests.length === 0)) issues.push('validated:requires-proof');
  return { ok: issues.length === 0, issues };
}

export function createAgentExperience(input = {}) {
  const row = {
    source: 'chatgpt-teacher',
    validated: false,
    quality: 1,
    created_at: Date.now(),
    tests: [],
    tags: [],
    ...input,
  };
  const checked = validateAgentExperience(row);
  if (!checked.ok) {
    throw new Error(`Invalid MEL XP: ${checked.issues.join(', ')}`);
  }
  return Object.freeze(row);
}

export function formatExperienceHandoff(row = {}) {
  const checked = validateAgentExperience(row);
  if (!checked.ok) {
    throw new Error(`Cannot hand off invalid MEL XP: ${checked.issues.join(', ')}`);
  }
  return Object.freeze({
    xp: true,
    id: row.id,
    file: XP_CANONICAL_FILE,
    rule: row.after,
    validated: row.validated === true,
    proofs: [...row.tests],
    tags: [...row.tags],
  });
}
