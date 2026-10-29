import { ROADMAP_CODE_CONTRACTS, ROADMAP_CODE_CONTRACT_REVISION } from './roadmap-code-contracts.js';

// Software completion never certifies physical acceptance or model activation.
const EXTERNAL_ACCEPTANCE = Object.freeze({
  'MEL-FOUNDER-06': { status: 'BLOCKED_HUMAN', required_proof: 'REAL_DEVICE_ACCEPTANCE', blocking_code: false },
  'MEL-UI-AUDIT-05': { status: 'BLOCKED_HUMAN', required_proof: 'REAL_DEVICE_UI_ACCEPTANCE', blocking_code: false },
  'MEL-FOUNDER-08': { status: 'BLOCKED_EXTERNAL', required_proof: 'EXACT_ADAPTER_BENCHMARK_AND_OWNER_APPROVAL', blocking_code: false },
  'MEL-LORA-CHAT-01': { status: 'BLOCKED_EXTERNAL', required_proof: 'REAL_MODEL_BEFORE_AFTER_BENCHMARK', blocking_code: false },
  'MEL-LORA-MODE-01': { status: 'BLOCKED_EXTERNAL', required_proof: 'ACTIVATED_COMPATIBLE_ADAPTER_RECEIPT', blocking_code: false },
});
export const ROADMAP_TECHNICAL_WORK = Object.freeze(Object.fromEntries(
  Object.entries(ROADMAP_CODE_CONTRACTS).map(([id, contract]) => [id, Object.freeze({
    ...contract, contract_revision: ROADMAP_CODE_CONTRACT_REVISION,
    ...(EXTERNAL_ACCEPTANCE[id] ? { external_acceptance: EXTERNAL_ACCEPTANCE[id] } : {}),
  })])
));

export function validateRoadmapTechnicalWork(roadmap = []) {
  const issues = [];
  const ids = new Set(roadmap.map(row => row.id));
  for (const id of Object.keys(ROADMAP_TECHNICAL_WORK)) {
    if (!ids.has(id)) issues.push({ type: 'ROADMAP_UNKNOWN_EXECUTION_CONTRACT', id });
  }
  for (const row of roadmap) {
    if (['DONE','DONE_VERIFIED','VERIFIED','ACCEPTED'].includes(String(row.status || '').toUpperCase())) continue;
    const contract = ROADMAP_TECHNICAL_WORK[row.id];
    if (!contract) { issues.push({ type: 'ROADMAP_EXECUTION_CONTRACT_REQUIRED', id: row.id });continue; }
    if (!['IMPLEMENT','FIX'].includes(row.mode) || row.required_proof !== 'DIFF_TESTS_EXACT_SHA_CI')
      issues.push({ type: 'ROADMAP_CODE_DELIVERABLE_REQUIRED', id: row.id });
    for (const field of ['code_paths','test_paths','acceptance']) {
      if (!Array.isArray(row[field]) || !row[field].length || row[field].some(value => typeof value !== 'string' || !value.trim()))
        issues.push({ type: 'ROADMAP_CODE_CONTRACT_INCOMPLETE', id: row.id, field });
    }
    if (['BLOCKED_HUMAN','BLOCKED_EXTERNAL'].includes(String(row.status).toUpperCase()))
      issues.push({ type: 'ROADMAP_EXTERNAL_ACCEPTANCE_IS_NOT_CODE_JOB', id: row.id });
  }
  return issues;
}

// Hard verification prerequisites: never ask MAX to certify a downstream
// objective before the independent, testable work that proves it exists.
// A prerequisite is an exact roadmap ID, never an inferred keyword or phase.
// In particular, paused real-device acceptance is not a dependency of cloud jobs.
// The manifesto ledger consumes FOUNDER-02 durable state; its other rows may
// remain pending. The final acceptance aggregator has explicit prerequisites.
export const ROADMAP_HARD_DEPENDENCIES = Object.freeze({
  "MEL-AUDIT-02": [
    "MEL-FOUNDER-02",
    "MEL-FOUNDER-04"
  ],
  "MEL-AUDIT-03": [
    "MEL-FOUNDER-01",
    "MEL-FOUNDER-05"
  ],
  "MEL-AUDIT-04": [
    "MEL-FOUNDER-02"
  ],
  "MEL-AUDIT-05": [
    "MEL-FOUNDER-02"
  ],
  "MEL-AUDIT-06": [
    "MEL-FOUNDER-04"
  ],
  "MEL-AUDIT-07": [
    "MEL-AUDIT-02",
    "MEL-AUDIT-03",
    "MEL-FOUNDER-03"
  ],
  "MEL-FOUNDER-01": [],
  "MEL-FOUNDER-02": [],
  "MEL-FOUNDER-03": [
    "MEL-FOUNDER-02",
    "MEL-FOUNDER-04"
  ],
  "MEL-FOUNDER-04": [],
  "MEL-FOUNDER-05": [
    "MEL-FOUNDER-01",
    "MEL-FOUNDER-02"
  ],
  "MEL-FOUNDER-06": [
    "MEL-FOUNDER-02"
  ],
  "MEL-FOUNDER-07": [],
  "MEL-FOUNDER-08": [
    "MEL-CHAT-06"
  ],
  "MEL-UI-AUDIT-01": [],
  "MEL-UI-AUDIT-02": [
    "MEL-UI-AUDIT-01",
    "MEL-CHAT-01",
    "MEL-CHAT-02",
    "MEL-CHAT-03"
  ],
  "MEL-UI-AUDIT-03": [
    "MEL-UI-AUDIT-01",
    "MEL-FOUNDER-02"
  ],
  "MEL-UI-AUDIT-04": [
    "MEL-UI-AUDIT-01",
    "MEL-FOUNDER-02"
  ],
  "MEL-UI-AUDIT-05": [
    "MEL-UI-AUDIT-01",
    "MEL-FOUNDER-06"
  ],
  "MEL-UI-AUDIT-06": [
    "MEL-UI-AUDIT-01",
    "MEL-FOUNDER-05",
    "MEL-COUNCIL-OPS-02",
    "MEL-FOUNDER-08"
  ],
  "MEL-UI-AUDIT-07": [
    "MEL-UI-AUDIT-01",
    "MEL-UI-AUDIT-02",
    "MEL-UI-AUDIT-03",
    "MEL-UI-AUDIT-04",
    "MEL-UI-AUDIT-05",
    "MEL-UI-AUDIT-06"
  ],
  "MEL-MANIFEST-01": [
    "MEL-FOUNDER-02"
  ],
  "MEL-MANIFEST-02": [
    "MEL-FOUNDER-02"
  ],
  "MEL-MANIFEST-03": [
    "MEL-FOUNDER-03"
  ],
  "MEL-MANIFEST-04": [
    "MEL-FOUNDER-07"
  ],
  "MEL-MANIFEST-05": [
    "MEL-FOUNDER-01"
  ],
  "MEL-MANIFEST-06": [
    "MEL-FOUNDER-02"
  ],
  "MEL-MANIFEST-07": [
    "MEL-FOUNDER-02",
    "MEL-FOUNDER-03"
  ],
  "MEL-MANIFEST-08": [
    "MEL-FOUNDER-01"
  ],
  "MEL-MANIFEST-09": [
    "MEL-FOUNDER-03",
    "MEL-FOUNDER-04",
    "MEL-COUNCIL-OPS-01"
  ],
  "MEL-MANIFEST-10": [
    "MEL-MANIFEST-01",
    "MEL-MANIFEST-02",
    "MEL-MANIFEST-03",
    "MEL-MANIFEST-04",
    "MEL-MANIFEST-05",
    "MEL-MANIFEST-06",
    "MEL-MANIFEST-07",
    "MEL-MANIFEST-08",
    "MEL-MANIFEST-09"
  ],
  "MEL-CHAT-01": [
    "MEL-FOUNDER-01"
  ],
  "MEL-CHAT-02": [
    "MEL-CHAT-01"
  ],
  "MEL-CHAT-03": [
    "MEL-CHAT-02"
  ],
  "MEL-CHAT-04": [
    "MEL-FOUNDER-01"
  ],
  "MEL-CHAT-05": [
    "MEL-CHAT-04"
  ],
  "MEL-CHAT-06": [
    "MEL-CHAT-01",
    "MEL-CHAT-02",
    "MEL-CHAT-03",
    "MEL-CHAT-04",
    "MEL-CHAT-05",
    "MEL-CHAT-08"
  ],
  "MEL-CHAT-07": [
    "MEL-CHAT-06"
  ],
  "MEL-CHAT-08": [
    "MEL-FOUNDER-01"
  ],
  "MEL-COUNCIL-OPS-01": [
    "MEL-FOUNDER-04"
  ],
  "MEL-COUNCIL-OPS-02": [
    "MEL-COUNCIL-OPS-01",
    "MEL-FOUNDER-03"
  ],
  "MEL-LORA-CHAT-01": [
    "MEL-CHAT-06",
    "MEL-CHAT-07",
    "MEL-FOUNDER-08",
    "MEL-COUNCIL-OPS-02"
  ],
  "MEL-LORA-MODE-01": [
    "MEL-FOUNDER-08",
    "MEL-CHAT-08"
  ]
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
