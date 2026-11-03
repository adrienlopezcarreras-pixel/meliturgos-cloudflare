// Companion proofs are optional. While the PC companion is absent they are
// set aside: not a failure, not a passed local proof, and never a reason to
// stop the cloud path. The companion remains a bonus when it is online.

export const COMPANION_ABSENT_REASONS = Object.freeze([
  'COMPANION_OFFLINE',
  'DEVICE_OFFLINE',
  'COMPANION_OFFLINE_OR_NOT_AUTHORIZED',
]);

export function companionProofAbsent(value) {
  if (value?.skipped !== true) return false;
  return COMPANION_ABSENT_REASONS.includes(String(value?.reason || value?.code || ''));
}

/** Keep the absence visible, but do not count it as a failed or passed proof. */
export function setAsideCompanionProof(value) {
  if (!companionProofAbsent(value)) return value;
  return {
    ...value,
    ok: true,
    skipped: true,
    passed: false,
    required: false,
    proof: 'SET_ASIDE',
    status: 'COMPANION_PROOF_SET_ASIDE',
  };
}
