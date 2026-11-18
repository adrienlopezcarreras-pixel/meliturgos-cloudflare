'use strict';

const LEGACY_PRS = new Set(['3094', '3103', '3112', '3113']);
const SHA = /^[a-f0-9]{40}$/;
const INTERNAL_MANDATORY = [
  'professor-audit',
  'gen2-17-targeted',
  'gen2-17-full-suite',
  'full-validation',
  'max-cloud-scheduler',
];

function classifyCouncilRoute(input) {
  if (!input || typeof input !== 'object') return { route: 'refused', code: 'COUNCIL_PR_NOT_ALLOWLISTED' };
  if (input.base !== 'main') return { route: 'refused', code: 'COUNCIL_BASE_NOT_MAIN' };
  if (!input.trustedRepo || input.repo !== input.trustedRepo) return { route: 'refused', code: 'COUNCIL_FORK_DENIED' };
  if (typeof input.head !== 'string' || !SHA.test(input.head) || input.head !== input.expectedSha) {
    return { route: 'refused', code: 'COUNCIL_SHA_MISMATCH' };
  }
  const prNumber = String(input.prNumber ?? '');
  if (LEGACY_PRS.has(prNumber)) return { route: 'legacy', code: 'COUNCIL_LEGACY_PROFILE', vote: true };
  if (input.ownerManual === true) return { route: 'owner_manual', code: 'COUNCIL_OWNER_MANUAL', vote: true };
  if (input.event === 'workflow_run' && input.state === 'open') {
    return {
      route: 'internal_discovery',
      code: 'COUNCIL_INTERNAL_DISCOVERY_NO_VOTE',
      vote: false,
      release_authorized: false,
    };
  }
  return { route: 'refused', code: 'COUNCIL_PR_NOT_ALLOWLISTED', vote: false };
}

function internalDiscoveryCi(latest) {
  const checks = latest instanceof Map ? latest : new Map();
  const pending = INTERNAL_MANDATORY.filter((name) => checks.get(name)?.conclusion !== 'success');
  const unfinished = [...checks.values()].filter((row) => !['success', 'skipped'].includes(row?.conclusion));
  const ciGreen = pending.length === 0 && unfinished.length === 0;
  return {
    status: ciGreen ? 'ci_green_no_vote' : 'ci_not_green_no_vote',
    log: ciGreen
      ? 'COUNCIL_INTERNAL_DISCOVERY_CI_GREEN_NO_VOTE'
      : 'COUNCIL_INTERNAL_DISCOVERY_CI_NOT_GREEN_NO_VOTE',
    ready: false,
    council_vote: false,
    release_authorized: false,
    teacher_approval: false,
    max_unblocked: false,
    pending,
  };
}

module.exports = {
  INTERNAL_MANDATORY,
  classifyCouncilRoute,
  internalDiscoveryCi,
};
