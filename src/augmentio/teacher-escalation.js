export function buildTeacherEscalation({ requestId = crypto.randomUUID(), input, capability = 'GENERAL', result } = {}) {
  if (!result?.best) throw new TypeError('AUGMENTIO_RESULT_REQUIRED');
  return {
    type: 'MEL_REQUEST',
    subtype: 'MULTI_AI_REVIEW',
    request_id: requestId,
    created_at: new Date().toISOString(),
    capability,
    input,
    mel_best: result.best,
    candidates: result.candidates || [],
    failures: result.failures || 0,
    question_for_teacher: 'Review the candidate answers and MEL synthesis. Identify errors, stronger reasoning, missing evidence, and the best improved answer. Return concrete durable lessons when applicable.',
    requires_teacher_decision: true,
  };
}
