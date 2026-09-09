const STAGES = Object.freeze([
  'COUNCIL_REQUIRED',
  'COUNCIL_COMPLETE',
  'INSPECTION_REQUIRED',
  'INSPECTION_COMPLETE',
  'SPEC_READY',
  'TEACHER_REVIEW',
  'IMPLEMENTATION',
  'TESTING',
  'CRITIQUE',
  'READY_FOR_RELEASE'
]);

const NEXT = Object.freeze(Object.fromEntries(STAGES.slice(0, -1).map((stage, i) => [stage, STAGES[i + 1]])));

function text(value, name, max = 12000) {
  const out = String(value ?? '').trim();
  if (!out) throw Object.assign(new Error(`${name.toUpperCase()}_REQUIRED`), { code: `${name.toUpperCase()}_REQUIRED` });
  return out.slice(0, max);
}

function sanitizeEvidence(value) {
  const raw = JSON.stringify(value ?? {});
  if (/(api[_-]?key|authorization|bearer\s+|password|passwd|otp|cookie|secret|private[_-]?key)/i.test(raw)) {
    throw Object.assign(new Error('SENSITIVE_EVIDENCE_REJECTED'), { code: 'SENSITIVE_EVIDENCE_REJECTED' });
  }
  return structuredClone(value ?? {});
}

function councilGate(evidence) {
  const opinions = Array.isArray(evidence?.opinions) ? evidence.opinions : [];
  const valid = opinions.filter(x => x && x.zero_added_cost === true && x.provider_id && x.model_id && x.summary);
  const unique = new Set(valid.map(x => `${x.provider_id}/${x.model_id}`));
  if (unique.size < 2) throw Object.assign(new Error('COUNCIL_EVIDENCE_INSUFFICIENT'), { code: 'COUNCIL_EVIDENCE_INSUFFICIENT' });
}

function inspectionGate(evidence) {
  const reads = Array.isArray(evidence?.code_reads) ? evidence.code_reads : [];
  const searches = Array.isArray(evidence?.code_searches) ? evidence.code_searches : [];
  if (!reads.length && !searches.length) throw Object.assign(new Error('CODE_INSPECTION_REQUIRED'), { code: 'CODE_INSPECTION_REQUIRED' });
}

function specGate(evidence) {
  const spec = evidence?.spec;
  for (const key of ['goal', 'interfaces', 'risks', 'tests', 'rollback']) text(spec?.[key], `spec_${key}`);
}

function teacherGate(evidence) {
  const request = evidence?.teacher_request;
  for (const key of ['objective', 'council', 'inspection', 'proposed_spec', 'tests', 'security_privacy', 'unknowns', 'rollback']) {
    if (request?.[key] == null || request[key] === '') throw Object.assign(new Error(`TEACHER_${key.toUpperCase()}_REQUIRED`), { code: `TEACHER_${key.toUpperCase()}_REQUIRED` });
  }
}

function implementationGate(evidence) {
  if (!String(evidence?.candidate_branch || '').startsWith('candidate/')) throw Object.assign(new Error('CANDIDATE_BRANCH_REQUIRED'), { code: 'CANDIDATE_BRANCH_REQUIRED' });
  text(evidence?.candidate_sha, 'candidate_sha', 128);
}

function testingGate(evidence) {
  const tests = Array.isArray(evidence?.tests) ? evidence.tests : [];
  if (!tests.length || tests.some(t => t?.passed !== true)) throw Object.assign(new Error('TEST_GATE_FAILED'), { code: 'TEST_GATE_FAILED' });
}

function critiqueGate(evidence) {
  text(evidence?.critique?.summary, 'critique_summary');
  if (evidence?.critique?.blocking === true) throw Object.assign(new Error('CRITIQUE_BLOCKING'), { code: 'CRITIQUE_BLOCKING' });
}

const EXIT_GATES = Object.freeze({
  COUNCIL_REQUIRED: councilGate,
  COUNCIL_COMPLETE: inspectionGate,
  INSPECTION_REQUIRED: inspectionGate,
  INSPECTION_COMPLETE: specGate,
  SPEC_READY: teacherGate,
  TEACHER_REVIEW: implementationGate,
  IMPLEMENTATION: implementationGate,
  TESTING: testingGate,
  CRITIQUE: critiqueGate
});

export function createDevelopmentObjective({ id = crypto.randomUUID(), objective, requested_by = 'mel', now = () => new Date().toISOString() } = {}) {
  return {
    id,
    objective: text(objective, 'objective', 4000),
    requested_by: String(requested_by || 'mel').slice(0, 100),
    stage: 'COUNCIL_REQUIRED',
    created_at: now(),
    updated_at: now(),
    evidence: {},
    audit: []
  };
}

export function buildTeacherReviewRequest(state) {
  if (!state || !state.evidence) throw Object.assign(new Error('STATE_REQUIRED'), { code: 'STATE_REQUIRED' });
  councilGate(state.evidence);
  inspectionGate(state.evidence);
  specGate(state.evidence);
  return sanitizeEvidence({
    type: 'TEACHER_REVIEW_REQUEST',
    objective: state.objective,
    council: state.evidence.council,
    inspection: { code_reads: state.evidence.code_reads || [], code_searches: state.evidence.code_searches || [] },
    proposed_spec: state.evidence.spec,
    tests: state.evidence.proposed_tests || state.evidence.spec?.tests,
    security_privacy: state.evidence.security_privacy || 'No production access; candidate-only; no secrets.',
    unknowns: state.evidence.unknowns || [],
    rollback: state.evidence.spec?.rollback
  });
}

export function advanceDevelopment(state, { evidence = {}, now = () => new Date().toISOString() } = {}) {
  if (!state || !STAGES.includes(state.stage)) throw Object.assign(new Error('INVALID_DEVELOPMENT_STATE'), { code: 'INVALID_DEVELOPMENT_STATE' });
  if (state.stage === 'READY_FOR_RELEASE') return structuredClone(state);
  const merged = { ...sanitizeEvidence(state.evidence), ...sanitizeEvidence(evidence) };
  const gate = EXIT_GATES[state.stage];
  if (gate) gate(merged);
  const next = NEXT[state.stage];
  const timestamp = now();
  return {
    ...structuredClone(state),
    stage: next,
    updated_at: timestamp,
    evidence: merged,
    audit: [...(state.audit || []), { from: state.stage, to: next, at: timestamp }]
  };
}

export { STAGES as DEVELOPMENT_STAGES };
