const DEFAULT_MAX_CONTENT_LENGTH = 12000;
const DEFAULT_MAX_BATCH_SIZE = 1000;
const ALLOWED_ROLES = new Set(['user', 'assistant', 'system', 'tool']);

function requireString(value, code) {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return value.trim();
}

function requirePositiveInteger(value, code) {
  if (!Number.isInteger(value) || value < 0) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  return value;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeExchange(input, { maxContentLength = DEFAULT_MAX_CONTENT_LENGTH } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('MEMORY_EXCHANGE_INVALID');
    error.code = 'MEMORY_EXCHANGE_INVALID';
    throw error;
  }
  if (!Number.isInteger(maxContentLength) || maxContentLength < 256 || maxContentLength > 100000) {
    const error = new Error('MEMORY_MAX_CONTENT_LENGTH_INVALID');
    error.code = 'MEMORY_MAX_CONTENT_LENGTH_INVALID';
    throw error;
  }

  const conversationId = requireString(input.conversationId ?? input.conversation_id, 'MEMORY_CONVERSATION_ID_REQUIRED');
  const messageId = requireString(input.messageId ?? input.id, 'MEMORY_MESSAGE_ID_REQUIRED');
  const role = requireString(input.role, 'MEMORY_ROLE_REQUIRED').toLowerCase();
  if (!ALLOWED_ROLES.has(role)) {
    const error = new Error('MEMORY_ROLE_UNSUPPORTED');
    error.code = 'MEMORY_ROLE_UNSUPPORTED';
    throw error;
  }

  const rawContent = typeof input.content === 'string' ? input.content.trim() : '';
  if (!rawContent) return null;

  const rawTimestamp = input.timestamp ?? input.created_at ?? Date.now();
  const timestamp = requirePositiveInteger(Number(rawTimestamp), 'MEMORY_TIMESTAMP_INVALID');
  const content = rawContent.slice(0, maxContentLength);
  const provenance = typeof input.provenance === 'string' && input.provenance.trim()
    ? input.provenance.trim().slice(0, 80)
    : 'conversation';

  return Object.freeze({
    conversationId: conversationId.slice(0, 240),
    messageId: messageId.slice(0, 240),
    role,
    content,
    timestamp,
    provenance,
    truncated: rawContent.length > content.length,
  });
}

export async function exchangeToMemoryCandidate(exchange) {
  const normalized = normalizeExchange(exchange);
  if (!normalized) return null;
  const digest = await sha256Hex(`${normalized.conversationId}\u0000${normalized.messageId}`);
  const confidence = normalized.role === 'user' ? 0.72 : normalized.role === 'assistant' ? 0.45 : 0.3;
  return Object.freeze({
    id: `memcand_${digest}`,
    conversationId: normalized.conversationId,
    messageId: normalized.messageId,
    content: normalized.content,
    confidence,
    source: `conversation:${normalized.provenance}:${normalized.role}`,
    status: 'PENDING',
    createdAt: normalized.timestamp,
    truncated: normalized.truncated,
  });
}

export class ExchangeMemorySync {
  constructor({ candidateSink, maxContentLength = DEFAULT_MAX_CONTENT_LENGTH, maxBatchSize = DEFAULT_MAX_BATCH_SIZE } = {}) {
    if (typeof candidateSink !== 'function') {
      const error = new Error('MEMORY_CANDIDATE_SINK_REQUIRED');
      error.code = 'MEMORY_CANDIDATE_SINK_REQUIRED';
      throw error;
    }
    if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1 || maxBatchSize > 10000) {
      const error = new Error('MEMORY_MAX_BATCH_SIZE_INVALID');
      error.code = 'MEMORY_MAX_BATCH_SIZE_INVALID';
      throw error;
    }
    this.candidateSink = candidateSink;
    this.maxContentLength = maxContentLength;
    this.maxBatchSize = maxBatchSize;
  }

  async sync(messages) {
    if (!Array.isArray(messages)) {
      const error = new Error('MEMORY_EXCHANGES_ARRAY_REQUIRED');
      error.code = 'MEMORY_EXCHANGES_ARRAY_REQUIRED';
      throw error;
    }
    if (messages.length > this.maxBatchSize) {
      const error = new Error('MEMORY_EXCHANGE_BATCH_TOO_LARGE');
      error.code = 'MEMORY_EXCHANGE_BATCH_TOO_LARGE';
      throw error;
    }

    // Prepare and validate the entire batch before the first write. This keeps
    // malformed input fail-closed instead of partially synchronizing a batch.
    const prepared = [];
    let skippedEmpty = 0;
    for (const message of messages) {
      const normalized = normalizeExchange(message, { maxContentLength: this.maxContentLength });
      if (!normalized) {
        skippedEmpty += 1;
        continue;
      }
      prepared.push(await exchangeToMemoryCandidate(normalized));
    }

    const unique = new Map();
    let duplicateInBatch = 0;
    for (const candidate of prepared) {
      if (unique.has(candidate.id)) duplicateInBatch += 1;
      else unique.set(candidate.id, candidate);
    }

    let inserted = 0;
    let alreadyPresent = duplicateInBatch;
    for (const candidate of unique.values()) {
      const outcome = await this.candidateSink(candidate);
      if (!outcome || typeof outcome.inserted !== 'boolean') {
        const error = new Error('MEMORY_CANDIDATE_SINK_RESULT_INVALID');
        error.code = 'MEMORY_CANDIDATE_SINK_RESULT_INVALID';
        throw error;
      }
      if (outcome.inserted) inserted += 1;
      else alreadyPresent += 1;
    }

    return Object.freeze({
      scanned: messages.length,
      eligible: prepared.length,
      inserted,
      alreadyPresent,
      skippedEmpty,
    });
  }
}

export function createD1MemoryCandidateSink(db) {
  if (!db || typeof db.prepare !== 'function') {
    const error = new Error('MEMORY_DB_REQUIRED');
    error.code = 'MEMORY_DB_REQUIRED';
    throw error;
  }
  return async (candidate) => {
    const result = await db.prepare(`
      INSERT OR IGNORE INTO memory_candidates(
        id, conversation_id, message_id, content, confidence, source, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      candidate.id,
      candidate.conversationId,
      candidate.messageId,
      candidate.content,
      candidate.confidence,
      candidate.source,
      candidate.status,
      candidate.createdAt,
    ).run();
    const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
    return { inserted: changes > 0 };
  };
}

export function createExchangeMemorySync(options) {
  return new ExchangeMemorySync(options);
}
