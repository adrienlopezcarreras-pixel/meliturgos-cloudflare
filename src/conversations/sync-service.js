import { ConversationService } from './conversation-service.js';
import {
  createD1MemoryCandidateSink,
  createExchangeMemorySync,
} from '../memory/exchange-sync.js';

/**
 * ConversationService-compatible sync layer.
 *
 * Existing device sync APIs remain inherited. MEL-MEM-02 adds syncToMemory(),
 * which incrementally copies archive messages that do not yet have a memory
 * candidate. It never confirms cognitive memory directly.
 */
export class SyncService extends ConversationService {
  constructor(db, options = {}) {
    super(db);
    this.memorySync = options.memorySync || createExchangeMemorySync({
      candidateSink: options.candidateSink || createD1MemoryCandidateSink(db),
      maxContentLength: options.maxContentLength,
      maxBatchSize: options.maxBatchSize,
    });
  }

  async syncToMemory({ conversationId, limit = 250 } = {}) {
    await this.migrate();
    if (typeof conversationId !== 'string' || !conversationId.trim()) {
      const error = new Error('MEMORY_CONVERSATION_ID_REQUIRED');
      error.code = 'MEMORY_CONVERSATION_ID_REQUIRED';
      throw error;
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      const error = new Error('MEMORY_SYNC_LIMIT_INVALID');
      error.code = 'MEMORY_SYNC_LIMIT_INVALID';
      throw error;
    }

    const rows = await this.db.prepare(`
      SELECT a.*
      FROM archive_messages a
      WHERE a.conversation_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM memory_candidates c
          WHERE c.conversation_id = a.conversation_id
            AND c.message_id = a.id
        )
      ORDER BY a.timestamp ASC, a.id ASC
      LIMIT ?
    `).bind(conversationId.trim(), limit).all();

    const messages = (rows?.results || []).map((row) => this._rowToMessage(row));
    const result = await this.memorySync.sync(messages);
    return Object.freeze({ conversationId: conversationId.trim(), ...result });
  }
}

export function createSyncService(env, options = {}) {
  return new SyncService(env.DB, options);
}
