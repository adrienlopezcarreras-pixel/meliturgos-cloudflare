// Only vetted, objective-bound recipes. A model cannot invent required tests.
export const OBJECTIVE_VERIFICATION_PROFILES = Object.freeze({
  'MEL-MANIFEST-01': Object.freeze({
    capability: 'autonomy.status', revision: '2026-11-07-manifest-report-v1',
    required_tests: {
      'tests/autonomy-readiness.test.mjs': [
        'manifest priorities are computed from proofs, business indicators stay report data and absent hardware stays external',
      ],
      'tests/manifest-objective-live-proof.test.mjs': [
        'real readiness report consumes accepted software receipts rather than stale declared progress',
        'manifest verification proves an honest pending report without certifying its priorities',
      ],
    },
  }),
});
export function objectiveVerificationProfile(goal) {
  const id = /^\s*\[([A-Z0-9-]+)\]/i.exec(String(goal || ''))?.[1]?.toUpperCase();
  const profile = OBJECTIVE_VERIFICATION_PROFILES[id];
  return profile ? { id, ...profile } : null;
}
export const isFounderVerificationGoal = goal => /^\s*\[MEL-FOUNDER-01\]/i.test(String(goal || ''));
