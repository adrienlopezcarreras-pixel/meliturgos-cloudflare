import { MASTER_ROADMAP } from './master-roadmap.js';

/**
 * Runtime-only corrections backed by evidence produced after the static roadmap
 * entry was last edited. Keeping them explicit prevents silent status inflation
 * while allowing the UI and XP model to reflect verified production reality.
 */
export const RUNTIME_ROADMAP_OVERRIDES = Object.freeze({
  'GEN2-47': Object.freeze({
    status: 'DONE_VERIFIED',
    next: 'Maintenir le backup quotidien R2 idempotent et tester la restauration',
    verification: 'CI verte + release Cloudflare + smoke production du 2026-09-16'
  })
});

export function getRuntimeRoadmap() {
  return MASTER_ROADMAP.map((phase) => ({
    ...phase,
    items: phase.items.map((item) => {
      const override = RUNTIME_ROADMAP_OVERRIDES[item.id];
      return override ? { ...item, ...override } : { ...item };
    })
  }));
}

export function flattenRuntimeRoadmap() {
  return getRuntimeRoadmap().flatMap((phase) =>
    phase.items.map((item) => ({ ...item, phase_id: phase.id, phase: phase.title }))
  );
}

export function runtimeRoadmapSummary() {
  const rows = flattenRuntimeRoadmap();
  const byStatus = {};
  const byPriority = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;
    byPriority[row.priority] = (byPriority[row.priority] || 0) + 1;
  }
  const complete = (byStatus.DONE || 0) + (byStatus.DONE_VERIFIED || 0);
  return {
    total: rows.length,
    complete,
    percent_complete: rows.length ? Math.round((complete / rows.length) * 100) : 0,
    by_status: byStatus,
    by_priority: byPriority,
    generated_at: new Date().toISOString()
  };
}

export function getRuntimeRoadmapPayload() {
  return { ok: true, summary: runtimeRoadmapSummary(), phases: getRuntimeRoadmap() };
}
