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

  const [memories, conversations, archiveMessages] = await Promise.all([
    safeRows(env?.DB, 'memories', limit),
    safeRows(env?.DB, 'conversations', limit),
    safeRows(env?.DB, 'archive_messages', limit),
  ]);

  return {
    format: 'meliturgos-shardvault-memory-export',
    version: 1,
    exported_at: date.toISOString(),
    owner: String(env?.MELITURGOS_USER || ''),
    memories,
    conversations,
    archive_messages: archiveMessages,
    counts: {
      memories: memories.length,
      conversations: conversations.length,
      archive_messages: archiveMessages.length,
    },
  };
}
