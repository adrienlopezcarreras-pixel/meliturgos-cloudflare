// Canonical open work is classified before any model is invoked. VERIFY
// requires an executable check, IMPLEMENT/FIX a code diff plus tests and CI,
// and EXTERNAL must remain outside MAX until real hardware/provider evidence.
const WORK_MODES = Object.freeze({
  VERIFY: 'EXECUTED_TEST_OR_LIVE_CHECK',
  IMPLEMENT: 'DIFF_TESTS_EXACT_SHA_CI',
  FIX: 'DIFF_TESTS_EXACT_SHA_CI',
  EXTERNAL: 'REAL_EXTERNAL_EVIDENCE',
});

const OPEN_ROADMAP_WORK = Object.freeze({
  VERIFY: [
    'MEL-AUDIT-02','MEL-AUDIT-03','MEL-AUDIT-04','MEL-AUDIT-05','MEL-AUDIT-06',
    'MEL-FOUNDER-01','MEL-FOUNDER-04','MEL-FOUNDER-05','MEL-FOUNDER-07',
    'MEL-UI-AUDIT-01','MEL-UI-AUDIT-02','MEL-UI-AUDIT-03','MEL-UI-AUDIT-04',
    'MEL-UI-AUDIT-06','MEL-UI-AUDIT-07',
    'MEL-MANIFEST-01','MEL-MANIFEST-02','MEL-MANIFEST-03','MEL-MANIFEST-04',
    'MEL-MANIFEST-05','MEL-MANIFEST-06','MEL-MANIFEST-07','MEL-MANIFEST-08',
    'MEL-MANIFEST-09','MEL-MANIFEST-10',
    'MEL-CHAT-01','MEL-CHAT-02','MEL-CHAT-03','MEL-CHAT-04','MEL-CHAT-05',
    'MEL-CHAT-08','MEL-COUNCIL-OPS-01',
  ],
  IMPLEMENT: ['MEL-FOUNDER-03','MEL-CHAT-06','MEL-COUNCIL-OPS-02'],
  FIX: ['MEL-AUDIT-07','MEL-FOUNDER-02','MEL-CHAT-07'],
  EXTERNAL: ['MEL-FOUNDER-06','MEL-FOUNDER-08','MEL-UI-AUDIT-05',
    'MEL-LORA-CHAT-01','MEL-LORA-MODE-01'],
});
export const ROADMAP_TECHNICAL_WORK = Object.freeze(Object.fromEntries(
  Object.entries(OPEN_ROADMAP_WORK).flatMap(([mode, ids]) =>
    ids.map(id => [id, Object.freeze({ mode, required_proof: WORK_MODES[mode] })]))
));

export function validateRoadmapTechnicalWork(roadmap = []) {
  const issues = [];
  const seen = new Set();
  for (const [mode, ids] of Object.entries(OPEN_ROADMAP_WORK)) {
    for (const id of ids) {
      if (seen.has(id)) issues.push({ type: 'ROADMAP_DUPLICATE_EXECUTION_CONTRACT', id });
      seen.add(id);
      const row = roadmap.find(item => item.id === id);
      if (!row) issues.push({ type: 'ROADMAP_UNKNOWN_EXECUTION_CONTRACT', id });
      else if (['DONE_VERIFIED', 'VERIFIED', 'ACCEPTED'].includes(String(row.status || '').toUpperCase())) {
        issues.push({ type: 'ROADMAP_CLOSED_EXECUTION_CONTRACT', id });
      } else if ((mode === 'EXTERNAL') !== ['BLOCKED_HUMAN','BLOCKED_EXTERNAL'].includes(String(row.status || '').toUpperCase())) {
        issues.push({ type: 'ROADMAP_EXECUTION_MODE_STATUS_MISMATCH', id, mode, status: row.status });
      }
    }
  }
  for (const row of roadmap) {
    if (!['DONE_VERIFIED','VERIFIED','ACCEPTED'].includes(String(row.status || '').toUpperCase())
        && !seen.has(row.id)) issues.push({ type: 'ROADMAP_EXECUTION_CONTRACT_REQUIRED', id: row.id });
  }
  return issues;
}

// Hard verification prerequisites: never ask MAX to certify a downstream
// objective before the independent, testable work that proves it exists.
// A prerequisite is an exact roadmap ID, never an inferred keyword or phase.
// In particular, paused real-device acceptance is not a dependency of cloud jobs.
export const ROADMAP_HARD_DEPENDENCIES = Object.freeze({
  'MEL-FOUNDER-03': ['MEL-FOUNDER-02'],
  'MEL-AUDIT-07': ['MEL-AUDIT-02', 'MEL-AUDIT-03'],
  'MEL-MANIFEST-01': ['MEL-FOUNDER-01', 'MEL-FOUNDER-02', 'MEL-FOUNDER-03', 'MEL-FOUNDER-04'],
  'MEL-MANIFEST-02': ['MEL-FOUNDER-02'],
  'MEL-MANIFEST-03': ['MEL-FOUNDER-03', 'MEL-FOUNDER-04'],
  'MEL-MANIFEST-04': ['MEL-FOUNDER-07'],
  'MEL-MANIFEST-07': ['MEL-FOUNDER-02'],
  'MEL-MANIFEST-09': ['MEL-FOUNDER-03', 'MEL-FOUNDER-04'],
  'MEL-MANIFEST-10': ['MEL-MANIFEST-01', 'MEL-FOUNDER-01', 'MEL-FOUNDER-02', 'MEL-FOUNDER-03', 'MEL-FOUNDER-04'],
  'MEL-UI-AUDIT-02': ['MEL-UI-AUDIT-01'],
  'MEL-UI-AUDIT-03': ['MEL-UI-AUDIT-01'],
  'MEL-UI-AUDIT-04': ['MEL-UI-AUDIT-01'],
  'MEL-UI-AUDIT-06': ['MEL-UI-AUDIT-01'],
  'MEL-UI-AUDIT-07': ['MEL-UI-AUDIT-01', 'MEL-UI-AUDIT-02', 'MEL-UI-AUDIT-03', 'MEL-UI-AUDIT-04', 'MEL-UI-AUDIT-06'],
  'MEL-COUNCIL-OPS-02': ['MEL-COUNCIL-OPS-01'],
  'MEL-CHAT-07': ['MEL-CHAT-06'],
  'MEL-LORA-CHAT-01': ['MEL-CHAT-06'],
});

export function roadmapPrerequisiteIds(item) {
  // An injected or evolved roadmap must declare its own edges explicitly.
  // Never silently attach production dependencies to a synthetic job with
  // the same ID (tests, external evolution queues, prior roadmap versions).
  return Array.isArray(item?.depends_on) ? item.depends_on : [];
}

export function unmetRoadmapPrerequisites(item, roadmap = [], completedIds = []) {
  const passed = new Set(completedIds);
  for (const row of roadmap) {
    if (['DONE_VERIFIED', 'VERIFIED', 'ACCEPTED'].includes(String(row?.status || '').trim().toUpperCase())) passed.add(row.id);
  }
  return roadmapPrerequisiteIds(item).filter(id => !passed.has(id));
}

export function validateRoadmapDependencies(roadmap = []) {
  const issues = [];
  const ids = new Set(roadmap.map(row => row.id));
  const seen = new Set();
  const visiting = new Set();
  const visit = (id, route = []) => {
    if (seen.has(id)) return;
    if (visiting.has(id)) {
      issues.push({ type: 'ROADMAP_DEPENDENCY_CYCLE', path: [...route, id] });
      return;
    }
    visiting.add(id);
    const row = roadmap.find(item => item.id === id);
    const parents = roadmapPrerequisiteIds(row);
    if (new Set(parents).size !== parents.length) issues.push({ type: 'ROADMAP_DUPLICATE_DEPENDENCY', id });
    for (const parent of parents) {
      if (parent === id) issues.push({ type: 'ROADMAP_SELF_DEPENDENCY', id });
      else if (!ids.has(parent)) issues.push({ type: 'ROADMAP_MISSING_DEPENDENCY', id, dependency: parent });
      else visit(parent, [...route, id]);
    }
    visiting.delete(id);
    seen.add(id);
  };
  for (const row of roadmap) visit(row.id);
  return issues;
}
