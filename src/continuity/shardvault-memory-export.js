import { flattenRoadmap } from '../roadmap/master-roadmap.js';

const DEFAULT_EXPORT_LIMIT = 10000;
const MAX_EXPORT_LIMIT = 25000;

async function safeRows(db, table, limit = DEFAULT_EXPORT_LIMIT) {
  if (!db?.prepare) return [];
  const bounded = Math.max(1, Math.min(MAX_EXPORT_LIMIT, Number(limit) || DEFAULT_EXPORT_LIMIT));
  try {
    const result = await db.prepare(`SELECT * FROM ${table} LIMIT ?`).bind(bounded).all();
    return Array.isArray(result?.results) ? result.results : [];
  } catch {
    return [];
  }
}

export async function buildShardVaultMemoryPayload(env, { now = new Date(), limit = DEFAULT_EXPORT_LIMIT } = {}) {
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new TypeError('INVALID_SHARDVAULT_EXPORT_DATE');

  const [
    memories,
    conversations,
    archiveMessages,
    automations,
    automationRuns,
    devJobs,
    devBridgeState,
    mentorLessons,
    capabilityWatchState,
    timelineEvents,
    skillRegistrySnapshots,
    pluginVersions,
    pluginActiveVersions,
    pluginActivationHistory,
  ] = await Promise.all([
    safeRows(env?.DB, 'memories', limit),
    safeRows(env?.DB, 'conversations', limit),
    safeRows(env?.DB, 'archive_messages', limit),
    safeRows(env?.DB, 'automations', limit),
    safeRows(env?.DB, 'automation_runs', limit),
    safeRows(env?.DB, 'dev_jobs', limit),
    safeRows(env?.DB, 'dev_bridge_state', limit),
    safeRows(env?.DB, 'mentor_lessons', limit),
    safeRows(env?.DB, 'capability_watch_state', limit),
    safeRows(env?.DB, 'timeline_events', limit),
    safeRows(env?.DB, 'mel_skill_registry_snapshots', limit),
    safeRows(env?.DB, 'plugin_versions', limit),
    safeRows(env?.DB, 'plugin_active_versions', limit),
    safeRows(env?.DB, 'plugin_activation_history', limit),
  ]);

  const roadmap = flattenRoadmap().map(row => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    phase: row.phase,
    next: row.next,
  }));

  const recoveryState = {
    automations,
    automation_runs: automationRuns,
    dev_jobs: devJobs,
    dev_bridge_state: devBridgeState,
    mentor_lessons: mentorLessons,
    capability_watch_state: capabilityWatchState,
    timeline_events: timelineEvents,
    skill_registry_snapshots: skillRegistrySnapshots,
    plugin_versions: pluginVersions,
    plugin_active_versions: pluginActiveVersions,
    plugin_activation_history: pluginActivationHistory,
    roadmap,
  };

  return {
    format: 'meliturgos-shardvault-memory-export',
    version: 2,
    exported_at: date.toISOString(),
    owner: String(env?.MELITURGOS_USER || ''),
    memories,
    conversations,
    archive_messages: archiveMessages,
    recovery_state: recoveryState,
    policy: {
      secrets_included: false,
      oauth_tokens_included: false,
      api_credentials_included: false,
      regeneration_role: 'STATE_AND_CONTROL_PLANE_RECOVERY',
    },
    counts: {
      memories: memories.length,
      conversations: conversations.length,
      archive_messages: archiveMessages.length,
      automations: automations.length,
      automation_runs: automationRuns.length,
      dev_jobs: devJobs.length,
      dev_bridge_state: devBridgeState.length,
      mentor_lessons: mentorLessons.length,
      capability_watch_state: capabilityWatchState.length,
      timeline_events: timelineEvents.length,
      skill_registry_snapshots: skillRegistrySnapshots.length,
      plugin_versions: pluginVersions.length,
      plugin_active_versions: pluginActiveVersions.length,
      plugin_activation_history: pluginActivationHistory.length,
      roadmap: roadmap.length,
    },
  };
}
