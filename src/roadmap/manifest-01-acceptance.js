import { flattenRoadmap, ROADMAP_STATUSES } from './master-roadmap.js';

// Canonical manifesto priorities 0..4 are the existing founder work, not
// five invented subtasks. This is a prerequisite check, NOT a replacement
// for real per-capability execution receipts or the exact-SHA CI/Teacher gate.
export const MANIFEST_01_FOUNDATION = Object.freeze([
  Object.freeze({ priority: 0, roadmap_id: 'MEL-FOUNDER-01', proof: 'REAL_TOOL_RESULT' }),
  Object.freeze({ priority: 1, roadmap_id: 'MEL-FOUNDER-02', proof: 'PERSISTENT_RUNTIME_PROGRESS' }),
  Object.freeze({ priority: 2, roadmap_id: 'MEL-FOUNDER-03', proof: 'MISSING_CAPABILITY_TO_VERIFIED_DELIVERY' }),
  Object.freeze({ priority: 3, roadmap_id: 'MEL-FOUNDER-04', proof: 'DISTINCT_LIVE_COUNCIL_MODELS' }),
  Object.freeze({ priority: 4, roadmap_id: 'MEL-FOUNDER-06', proof: 'REAL_DEVICE_ACCEPTANCE' }),
]);

export function manifest01FoundationPrerequisites(roadmap = flattenRoadmap()) {
  const items = new Map((Array.isArray(roadmap) ? roadmap : []).map(item => [item?.id, item]));
  const priorities = MANIFEST_01_FOUNDATION.map(requirement => {
    const found = items.get(requirement.roadmap_id);
    const status = String(found?.status || 'NOT_FOUND').trim().toUpperCase();
    // DONE, COMPLETED, an AI claim, a green candidate CI and a blocked device
    // are not the canonical DONE_VERIFIED certification of the founder task.
    return {
      ...requirement,
      status,
      verified: status === ROADMAP_STATUSES.VERIFIED,
      reason: !found ? 'FOUNDER_ROADMAP_ITEM_MISSING'
        : status === ROADMAP_STATUSES.BLOCKED_HUMAN ? 'PHYSICAL_DEVICE_PROOF_REQUIRED'
          : status === ROADMAP_STATUSES.BLOCKED_EXTERNAL ? 'EXTERNAL_PROOF_REQUIRED'
            : status === ROADMAP_STATUSES.VERIFIED ? null : 'FOUNDER_REAL_EXECUTION_NOT_VERIFIED',
    };
  });
  const pending = priorities.filter(row => !row.verified);
  return {
    schema: 'mel.manifest-01-foundation-prerequisites.v1',
    roadmap_id: 'MEL-MANIFEST-01',
    ready: pending.length === 0,
    verified_count: priorities.length - pending.length,
    required_count: MANIFEST_01_FOUNDATION.length,
    priorities,
    pending: pending.map(({ priority, roadmap_id, reason }) => ({ priority, roadmap_id, reason })),
  };
}
