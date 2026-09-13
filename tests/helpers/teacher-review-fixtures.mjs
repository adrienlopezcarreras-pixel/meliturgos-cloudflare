export const TEST_CANDIDATE_BRANCH = 'candidate/mel-clean-autonomy';
export const TEST_CANDIDATE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

export function completeTeacherCouncil({ targetSha = TEST_CANDIDATE_SHA } = {}) {
  return {
    status: 'COMPLETE',
    phase: 'STATE_OF_PLAY_BEFORE_DEVELOPMENT',
    all_required_roles_satisfied: true,
    required_roles_succeeded: [
      'ARCHITECTURE_REUSE',
      'SECURITY_GOVERNANCE',
      'TESTS_EVIDENCE',
      'PRODUCT_INTEGRATION',
    ],
    synthesis: {
      status: 'COMPLETE',
      text: 'Réutiliser les composants canoniques, rester candidate-only et exiger tests ciblés plus CI complète.',
    },
    teacher_required: true,
    development_allowed: false,
    context: { target_sha: targetSha },
  };
}

export function teacherReply(requestId, {
  targetSha = TEST_CANDIDATE_SHA,
  verdict = 'APPROVE_PLAN',
  feedback = 'Proceed with the smallest candidate-only change and verify it.',
} = {}) {
  return {
    kind: 'TEACHER_REPLY',
    request_id: requestId,
    target_sha: targetSha,
    verdict,
    feedback,
  };
}
