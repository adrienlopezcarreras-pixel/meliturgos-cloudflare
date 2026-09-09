export const DEVELOPMENT_STATES = Object.freeze({
  COUNCIL_REQUIRED: 'COUNCIL_REQUIRED',
  INSPECTION_REQUIRED: 'INSPECTION_REQUIRED',
  SPEC_READY: 'SPEC_READY',
  TEACHER_REVIEW: 'TEACHER_REVIEW',
  IMPLEMENTATION: 'IMPLEMENTATION',
  TESTING: 'TESTING',
  CRITIQUE: 'CRITIQUE',
  READY_FOR_RELEASE: 'READY_FOR_RELEASE',
  BLOCKED: 'BLOCKED',
});

const TRANSITIONS = Object.freeze({
  [DEVELOPMENT_STATES.COUNCIL_REQUIRED]: { COUNCIL_COMPLETE: DEVELOPMENT_STATES.INSPECTION_REQUIRED },
  [DEVELOPMENT_STATES.INSPECTION_REQUIRED]: { INSPECTION_COMPLETE: DEVELOPMENT_STATES.SPEC_READY },
  [DEVELOPMENT_STATES.SPEC_READY]: { TEACHER_REQUESTED: DEVELOPMENT_STATES.TEACHER_REVIEW },
  [DEVELOPMENT_STATES.TEACHER_REVIEW]: { TEACHER_APPROVED: DEVELOPMENT_STATES.IMPLEMENTATION, TEACHER_REJECTED: DEVELOPMENT_STATES.BLOCKED },
  [DEVELOPMENT_STATES.IMPLEMENTATION]: { IMPLEMENTATION_COMPLETE: DEVELOPMENT_STATES.TESTING },
  [DEVELOPMENT_STATES.TESTING]: { TESTS_PASSED: DEVELOPMENT_STATES.CRITIQUE, TESTS_FAILED: DEVELOPMENT_STATES.BLOCKED },
  [DEVELOPMENT_STATES.CRITIQUE]: { CRITIQUE_PASSED: DEVELOPMENT_STATES.READY_FOR_RELEASE, CRITIQUE_FAILED: DEVELOPMENT_STATES.BLOCKED },
  [DEVELOPMENT_STATES.BLOCKED]: { RESET_TO_COUNCIL: DEVELOPMENT_STATES.COUNCIL_REQUIRED },
});

function boundedGoal(value) {
  const goal = String(value || '').trim();
  if (!goal) throw Object.assign(new Error('DEVELOPMENT_GOAL_REQUIRED'), { code: 'DEVELOPMENT_GOAL_REQUIRED' });
  if (goal.length > 4000) throw Object.assign(new Error('DEVELOPMENT_GOAL_TOO_LONG'), { code: 'DEVELOPMENT_GOAL_TOO_LONG' });
  return goal;
}

function safeEvidence(value) {
  if (value == null) return null;
  const raw = JSON.stringify(value);
  if (/(?:password|api[_ -]?key|authorization|bearer\s|\btoken\b|\botp\b|secret\s*[=:])/i.test(raw)) {
    throw Object.assign(new Error('DEVELOPMENT_EVIDENCE_SECRET_LIKE'), { code: 'DEVELOPMENT_EVIDENCE_SECRET_LIKE' });
  }
  return JSON.parse(raw.length > 20000 ? raw.slice(0, 20000) : raw);
}

function validateCouncil(evidence) {
  const responses = Array.isArray(evidence?.responses) ? evidence.responses : [];
  const valid = responses.filter(r => r && r.zero_added_cost === true && r.provider && r.model && (r.summary || r.result));
  const distinct = new Set(valid.map(r => `${r.provider}/${r.model}`));
  if (distinct.size < 2) {
    throw Object.assign(new Error('COUNCIL_ZERO_COST_EVIDENCE_REQUIRED'), { code: 'COUNCIL_ZERO_COST_EVIDENCE_REQUIRED' });
  }
}

export function createDevelopmentJob(goal, metadata = {}) {
  const objective = boundedGoal(goal);
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    objective,
    state: DEVELOPMENT_STATES.COUNCIL_REQUIRED,
    created_at: now,
    updated_at: now,
    metadata: safeEvidence(metadata) || {},
    evidence: {},
    history: [{ at: now, from: null, event: 'JOB_CREATED', to: DEVELOPMENT_STATES.COUNCIL_REQUIRED }],
    release_ready: false,
  };
}

function requireEvidence(event, evidence) {
  if (event === 'COUNCIL_COMPLETE') validateCouncil(evidence);
  if (event === 'INSPECTION_COMPLETE') {
    if (!evidence || evidence.status !== 'COMPLETE' || !Array.isArray(evidence.evidence) || evidence.evidence.length < 1) {
      throw Object.assign(new Error('CODE_INSPECTION_EVIDENCE_REQUIRED'), { code: 'CODE_INSPECTION_EVIDENCE_REQUIRED' });
    }
  }
  if (event === 'TEACHER_APPROVED') {
    if (!evidence || evidence.verdict !== 'APPROVE_PLAN') {
      throw Object.assign(new Error('TEACHER_APPROVAL_REQUIRED'), { code: 'TEACHER_APPROVAL_REQUIRED' });
    }
  }
  if (event === 'IMPLEMENTATION_COMPLETE') {
    if (!evidence || !String(evidence.candidate_sha || '').match(/^[a-f0-9]{7,40}$/i) || !String(evidence.candidate_branch || '').startsWith('candidate/')) {
      throw Object.assign(new Error('CANDIDATE_EVIDENCE_REQUIRED'), { code: 'CANDIDATE_EVIDENCE_REQUIRED' });
    }
  }
  if (event === 'TESTS_PASSED') {
    if (!evidence || evidence.full_ci !== 'SUCCESS') {
      throw Object.assign(new Error('FULL_CI_SUCCESS_REQUIRED'), { code: 'FULL_CI_SUCCESS_REQUIRED' });
    }
    if (evidence.augmentio !== 'SUCCESS') {
      throw Object.assign(new Error('AUGMENTIO_TESTS_SUCCESS_REQUIRED'), { code: 'AUGMENTIO_TESTS_SUCCESS_REQUIRED' });
    }
    if (evidence.resilience !== 'SUCCESS') {
      throw Object.assign(new Error('RESILIENCE_TESTS_SUCCESS_REQUIRED'), { code: 'RESILIENCE_TESTS_SUCCESS_REQUIRED' });
    }
  }
  if (event === 'CRITIQUE_PASSED') {
    if (!evidence || evidence.status !== 'PASS') {
      throw Object.assign(new Error('CRITIQUE_PASS_REQUIRED'), { code: 'CRITIQUE_PASS_REQUIRED' });
    }
  }
}

export function advanceDevelopmentJob(job, event, evidence = null) {
  if (!job || !job.state || !job.id) throw Object.assign(new Error('DEVELOPMENT_JOB_REQUIRED'), { code: 'DEVELOPMENT_JOB_REQUIRED' });
  const eventName = String(event || '').trim().toUpperCase();
  const next = TRANSITIONS[job.state]?.[eventName];
  if (!next) throw Object.assign(new Error(`DEVELOPMENT_TRANSITION_DENIED:${job.state}:${eventName}`), { code: 'DEVELOPMENT_TRANSITION_DENIED' });
  requireEvidence(eventName, evidence);
  const now = new Date().toISOString();
  const sanitized = safeEvidence(evidence);
  return {
    ...job,
    state: next,
    updated_at: now,
    evidence: { ...(job.evidence || {}), [eventName]: sanitized },
    history: [...(job.history || []), { at: now, from: job.state, event: eventName, to: next }],
    release_ready: next === DEVELOPMENT_STATES.READY_FOR_RELEASE,
  };
}

export function getAllowedDevelopmentEvents(job) {
  if (!job?.state) return [];
  return Object.keys(TRANSITIONS[job.state] || {});
}
