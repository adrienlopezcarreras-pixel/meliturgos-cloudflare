const DEFAULT_EXPORT_LIMIT = 10000;
const MAX_EXPORT_LIMIT = 25000;
const BACKUP_PREFIX = 'backups/memory';

async function safeRows(db, table, limit = DEFAULT_EXPORT_LIMIT) {
  if (!db) return [];
  try {
    const boundedLimit = Math.max(1, Math.min(MAX_EXPORT_LIMIT, Number(limit) || DEFAULT_EXPORT_LIMIT));
    const rows = await db.prepare(`SELECT * FROM ${table} LIMIT ?`).bind(boundedLimit).all();
    return rows?.results || [];
  } catch {
    return [];
  }
}

function asDate(now) {
  const value = now instanceof Date ? now : new Date(now ?? Date.now());
  if (Number.isNaN(value.getTime())) throw new TypeError('INVALID_BACKUP_DATE');
  return value;
}

export async function buildMemoryExportPayload(env, { now = new Date(), limit = DEFAULT_EXPORT_LIMIT } = {}) {
  const exportedAt = asDate(now).toISOString();
  const [memories, archiveMessages, conversations] = await Promise.all([
    safeRows(env?.DB, 'memories', limit),
    safeRows(env?.DB, 'archive_messages', limit),
    safeRows(env?.DB, 'conversations', limit)
  ]);

  return {
    format: 'meliturgos-memory-export',
    version: 1,
    exported_at: exportedAt,
    owner: env?.MELITURGOS_USER || '',
    memories,
    conversations,
    archive_messages: archiveMessages
  };
}

export function memoryBackupKey(now = new Date()) {
  return `${BACKUP_PREFIX}/${asDate(now).toISOString().slice(0, 10)}.json`;
}

export async function createMemoryExportResponse(env, { now = new Date(), limit = DEFAULT_EXPORT_LIMIT } = {}) {
  const date = asDate(now);
  const payload = await buildMemoryExportPayload(env, { now: date, limit });
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="meliturgos-memory-${date.toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store'
    }
  });
}

export async function runScheduledMemoryBackup(env, { now = new Date(), force = false, limit = DEFAULT_EXPORT_LIMIT } = {}) {
  if (!env?.DB) return { ok: false, skipped: true, reason: 'DB_UNAVAILABLE' };
  if (!env?.MEDIA_BUCKET || typeof env.MEDIA_BUCKET.put !== 'function') {
    return { ok: false, skipped: true, reason: 'MEDIA_BUCKET_UNAVAILABLE' };
  }

  const date = asDate(now);
  const key = memoryBackupKey(date);
  if (!force && typeof env.MEDIA_BUCKET.head === 'function') {
    const existing = await env.MEDIA_BUCKET.head(key);
    if (existing) return { ok: true, skipped: true, reason: 'ALREADY_BACKED_UP', key };
  }

  const payload = await buildMemoryExportPayload(env, { now: date, limit });
  const body = JSON.stringify(payload, null, 2);
  await env.MEDIA_BUCKET.put(key, body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: {
      format: payload.format,
      version: String(payload.version),
      owner: String(payload.owner || '')
    }
  });

  return {
    ok: true,
    skipped: false,
    key,
    exported_at: payload.exported_at,
    counts: {
      memories: payload.memories.length,
      conversations: payload.conversations.length,
      archive_messages: payload.archive_messages.length
    }
  };
}
