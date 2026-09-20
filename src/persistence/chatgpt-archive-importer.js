import { createConversationService } from '../conversations/conversation-service.js';
import { createSyncService } from '../conversations/sync-service.js';

const MAX_CONVERSATIONS = 1000;
const MAX_MESSAGES = 100000;
const MAX_MESSAGE_CHARS = 200000;

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.items)) return payload.items;
  throw Object.assign(new Error('CHATGPT_EXPORT_FORMAT_UNSUPPORTED'), { code: 'CHATGPT_EXPORT_FORMAT_UNSUPPORTED', status: 400 });
}

function messageText(message) {
  const content = message?.content;
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content.parts)) {
    return content.parts.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') return part.text || part.content || '';
      return '';
    }).filter(Boolean).join('\n').trim();
  }
  if (typeof content.text === 'string') return content.text.trim();
  return '';
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase();
  if (['user', 'assistant', 'system', 'tool'].includes(value)) return value;
  return value || 'unknown';
}

function timestampMs(value, fallback = Date.now()) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n < 10_000_000_000 ? Math.round(n * 1000) : Math.round(n);
}

function flattenMapping(conversation, conversationIndex) {
  const mapping = conversation?.mapping;
  if (!mapping || typeof mapping !== 'object') return [];
  const rows = [];
  for (const [nodeId, node] of Object.entries(mapping)) {
    const message = node?.message;
    if (!message) continue;
    const text = messageText(message);
    if (!text) continue;
    const role = normalizeRole(message?.author?.role);
    const ts = timestampMs(message?.create_time ?? conversation?.create_time, Date.now() + conversationIndex);
    rows.push({
      nodeId,
      messageId: String(message.id || nodeId),
      role,
      content: text.slice(0, MAX_MESSAGE_CHARS),
      timestamp: ts,
      parent: node?.parent || null,
      metadata: {
        chatgpt_message_id: message.id || null,
        chatgpt_node_id: nodeId,
        chatgpt_parent_node_id: node?.parent || null,
        chatgpt_recipient: message?.recipient || null,
        chatgpt_status: message?.status || null,
        truncated: text.length > MAX_MESSAGE_CHARS,
      }
    });
  }
  return rows.sort((a, b) => a.timestamp - b.timestamp || a.nodeId.localeCompare(b.nodeId));
}

function flattenLinearConversation(conversation, conversationIndex) {
  const source = conversation?.messages;
  if (!Array.isArray(source)) return [];
  return source.map((message, index) => {
    const text = messageText(message);
    return {
      nodeId: String(message?.id || index),
      messageId: String(message?.id || index),
      role: normalizeRole(message?.role || message?.author?.role),
      content: text.slice(0, MAX_MESSAGE_CHARS),
      timestamp: timestampMs(message?.create_time ?? message?.timestamp ?? conversation?.create_time, Date.now() + conversationIndex + index),
      parent: null,
      metadata: { chatgpt_message_id: message?.id || null, truncated: text.length > MAX_MESSAGE_CHARS }
    };
  }).filter(x => x.content);
}

function collectorReceipt(raw, messages) {
  const meta = raw?.collector && typeof raw.collector === 'object' ? raw.collector : null;
  const expectedRaw = Number(meta?.totalMessages);
  const expectedMessages = Number.isFinite(expectedRaw) && expectedRaw >= 0
    ? Math.max(messages.length, Math.round(expectedRaw))
    : messages.length;
  return {
    source: String(meta?.source || (raw?.mapping ? 'chatgpt_official_export' : 'chatgpt_linear_import')).slice(0, 80),
    version: meta?.version ? String(meta.version).slice(0, 40) : null,
    partial: meta?.partial === true,
    expected_messages: expectedMessages,
    batch_messages: messages.length,
  };
}

async function persistConversationImportReceipt(db, conversation) {
  let existing = {};
  try {
    const row = await db.prepare('SELECT metadata FROM conversations WHERE id=?').bind(conversation.id).first();
    existing = row?.metadata ? JSON.parse(row.metadata) : {};
  } catch { existing = {}; }

  const previous = existing?.chatgpt_import && typeof existing.chatgpt_import === 'object'
    ? existing.chatgpt_import
    : null;
  const expected = Number(conversation.collector?.expected_messages || conversation.messages.length || 0);
  const previousExpected = Number(previous?.expected_messages || 0);
  const incomingPartial = conversation.collector?.partial === true;
  const targetExpected = Math.max(expected, previousExpected);
  const complete = incomingPartial
    ? Boolean(previous?.complete === true && previousExpected >= expected)
    : expected >= previousExpected;

  const receipt = {
    complete,
    partial: !complete,
    expected_messages: targetExpected,
    batch_messages: Number(conversation.collector?.batch_messages || conversation.messages.length || 0),
    source: conversation.collector?.source || null,
    collector_version: conversation.collector?.version || null,
    received_at: Date.now(),
  };

  const metadata = { ...existing, chatgpt_import: receipt };
  await db.prepare('UPDATE conversations SET title=?, metadata=?, updated_at=? WHERE id=?')
    .bind(conversation.title, JSON.stringify(metadata), Date.now(), conversation.id)
    .run();
  return receipt;
}

export function normalizeChatGPTArchive(payload) {
  const conversations = asArray(payload).slice(0, MAX_CONVERSATIONS);
  const normalized = [];
  let messageCount = 0;
  for (let i = 0; i < conversations.length; i++) {
    if (messageCount >= MAX_MESSAGES) break;
    const raw = conversations[i] || {};
    const sourceId = String(raw.id || raw.conversation_id || `conversation-${i + 1}`);
    const id = `chatgpt:${sourceId}`;
    const title = String(raw.title || `Conversation ChatGPT ${i + 1}`).slice(0, 500);
    let messages = flattenMapping(raw, i);
    if (!messages.length) messages = flattenLinearConversation(raw, i);
    messages = messages.slice(0, Math.max(0, MAX_MESSAGES - messageCount));
    messageCount += messages.length;
    normalized.push({
      id,
      sourceId,
      title,
      createdAt: timestampMs(raw.create_time, messages[0]?.timestamp || Date.now()),
      updatedAt: timestampMs(raw.update_time, messages.at(-1)?.timestamp || Date.now()),
      messages,
      collector: collectorReceipt(raw, messages)
    });
  }
  return {
    conversations: normalized,
    summary: {
      conversations: normalized.length,
      messages: messageCount,
      empty_conversations: normalized.filter(x => !x.messages.length).length,
      truncated_conversations: asArray(payload).length > MAX_CONVERSATIONS,
      limits: { conversations: MAX_CONVERSATIONS, messages: MAX_MESSAGES, message_chars: MAX_MESSAGE_CHARS }
    }
  };
}

async function exists(db, id) {
  try { return Boolean(await db.prepare('SELECT id FROM archive_messages WHERE id=?').bind(id).first()); }
  catch { return false; }
}

function archiveMessageId(conversationSourceId, messageId) {
  return `chatgpt:${conversationSourceId}:${messageId}`.slice(0, 500);
}

export async function importChatGPTArchive(env, payload, { preview = false } = {}) {
  const normalized = normalizeChatGPTArchive(payload);
  if (preview) return { ok: true, preview: true, ...normalized.summary };
  if (!env?.DB) throw Object.assign(new Error('DB_BINDING_REQUIRED'), { code: 'DB_BINDING_REQUIRED', status: 503 });

  const service = createConversationService(env);
  const syncService = createSyncService(env);
  await service.migrate();
  let inserted = 0, duplicates = 0, failed = 0;
  const memorySync = { scanned: 0, eligible: 0, inserted: 0, alreadyPresent: 0, skippedEmpty: 0, failed_conversations: 0 };
  for (const conversation of normalized.conversations) {
    await service.ensureConversation(conversation.id, env.MELITURGOS_USER || '', conversation.title);
    for (const message of conversation.messages) {
      const id = archiveMessageId(conversation.sourceId, message.messageId);
      if (await exists(env.DB, id)) { duplicates++; continue; }
      try {
        await service.archiveMessage({
          id,
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          provenance: 'chatgpt_export',
          metadata: {
            ...message.metadata,
            chatgpt_conversation_id: conversation.sourceId,
            chatgpt_conversation_title: conversation.title,
            source_type: 'chatgpt_export',
            collector_source: conversation.collector?.source || null,
            collector_version: conversation.collector?.version || null,
            collector_partial: conversation.collector?.partial === true,
            imported_at: Date.now()
          }
        });
        inserted++;
      } catch {
        failed++;
      }
    }

    await persistConversationImportReceipt(env.DB, conversation);

    try {
      for (let pass = 0; pass < 20; pass++) {
        const result = await syncService.syncToMemory({ conversationId: conversation.id, limit: 1000 });
        memorySync.scanned += Number(result.scanned || 0);
        memorySync.eligible += Number(result.eligible || 0);
        memorySync.inserted += Number(result.inserted || 0);
        memorySync.alreadyPresent += Number(result.alreadyPresent || 0);
        memorySync.skippedEmpty += Number(result.skippedEmpty || 0);
        if (Number(result.scanned || 0) < 1000) break;
      }
    } catch {
      memorySync.failed_conversations++;
    }
  }
  return {
    ok: failed === 0,
    preview: false,
    conversations: normalized.summary.conversations,
    messages: normalized.summary.messages,
    inserted,
    duplicates,
    failed,
    provenance: 'chatgpt_export',
    memory_sync: {
      ...memorySync,
      ok: memorySync.failed_conversations === 0,
      stage: 'ARCHIVE_TO_MEMORY_CANDIDATES'
    }
  };
}

async function scalar(db, sql, ...bindings) {
  try {
    const row = await db.prepare(sql).bind(...bindings).first();
    return Number(row?.count || 0);
  } catch {
    return 0;
  }
}

export async function getChatGPTImportStatus(env) {
  if (!env?.DB) {
    return {
      ok: false,
      status: 'UNAVAILABLE',
      db_bound: false,
      conversations: 0,
      messages: 0,
      memory_candidates: 0,
      unsynced_messages: 0,
      complete_conversations: 0,
      partial_conversations: 0,
      unknown_completeness: 0,
      full_archive_confirmed: false,
      last_received: null
    };
  }

  const service = createConversationService(env);
  await service.migrate();

  const [conversations, messages, userMessages, assistantMessages, memoryCandidates, pendingCandidates, unsyncedMessages] = await Promise.all([
    scalar(env.DB, "SELECT COUNT(DISTINCT conversation_id) AS count FROM archive_messages WHERE provenance='chatgpt_export'"),
    scalar(env.DB, "SELECT COUNT(*) AS count FROM archive_messages WHERE provenance='chatgpt_export'"),
    scalar(env.DB, "SELECT COUNT(*) AS count FROM archive_messages WHERE provenance='chatgpt_export' AND role='user'"),
    scalar(env.DB, "SELECT COUNT(*) AS count FROM archive_messages WHERE provenance='chatgpt_export' AND role='assistant'"),
    scalar(env.DB, "SELECT COUNT(*) AS count FROM memory_candidates WHERE conversation_id LIKE 'chatgpt:%'"),
    scalar(env.DB, "SELECT COUNT(*) AS count FROM memory_candidates WHERE conversation_id LIKE 'chatgpt:%' AND status='PENDING'"),
    scalar(env.DB, `SELECT COUNT(*) AS count
      FROM archive_messages a
      WHERE a.provenance='chatgpt_export'
        AND NOT EXISTS (
          SELECT 1 FROM memory_candidates c
          WHERE c.conversation_id=a.conversation_id AND c.message_id=a.id
        )`)
  ]);

  let completionRows = [];
  try {
    const rows = await env.DB.prepare("SELECT id,metadata FROM conversations WHERE id LIKE 'chatgpt:%' ORDER BY updated_at DESC LIMIT 2000").all();
    completionRows = rows?.results || [];
  } catch {}

  let completeConversations = 0;
  let partialConversations = 0;
  let unknownCompleteness = 0;
  let expectedMessages = 0;
  for (const row of completionRows) {
    let metadata = {};
    try { metadata = row?.metadata ? JSON.parse(row.metadata) : {}; } catch {}
    const receipt = metadata?.chatgpt_import;
    if (!receipt || typeof receipt !== 'object') {
      unknownCompleteness++;
      continue;
    }
    expectedMessages += Math.max(0, Number(receipt.expected_messages || 0));
    if (receipt.complete === true) completeConversations++;
    else partialConversations++;
  }
  const trackedConversations = completionRows.length;
  const fullArchiveConfirmed = trackedConversations > 0
    && completeConversations === trackedConversations
    && partialConversations === 0
    && unknownCompleteness === 0;

  let lastReceived = null;
  try {
    lastReceived = await env.DB.prepare(`
      SELECT a.conversation_id, c.title, a.role, a.timestamp, a.id
      FROM archive_messages a
      LEFT JOIN conversations c ON c.id=a.conversation_id
      WHERE a.provenance='chatgpt_export'
      ORDER BY a.timestamp DESC, a.id DESC
      LIMIT 1
    `).first();
  } catch {}

  return {
    ok: true,
    status: 'ONLINE',
    db_bound: true,
    conversations,
    messages,
    roles: { user: userMessages, assistant: assistantMessages, other: Math.max(0, messages - userMessages - assistantMessages) },
    memory_candidates: memoryCandidates,
    pending_memory_candidates: pendingCandidates,
    unsynced_messages: unsyncedMessages,
    memory_sync_complete: messages > 0 && unsyncedMessages === 0,
    tracked_conversations: trackedConversations,
    complete_conversations: completeConversations,
    partial_conversations: partialConversations,
    unknown_completeness: unknownCompleteness,
    expected_messages: expectedMessages,
    full_archive_confirmed: fullArchiveConfirmed,
    last_received: lastReceived ? {
      conversation_id: lastReceived.conversation_id,
      title: lastReceived.title || null,
      role: lastReceived.role,
      timestamp: Number(lastReceived.timestamp || 0),
      message_id: lastReceived.id
    } : null,
    stages: {
      archive: messages > 0 ? 'RECEIVING' : 'EMPTY',
      memory_candidate_extraction: unsyncedMessages === 0 && messages > 0 ? 'UP_TO_DATE' : 'IN_PROGRESS',
      archive_retrieval: messages > 0 ? 'AVAILABLE' : 'EMPTY',
      semantic_memory: 'CANDIDATES_AVAILABLE_FOR_CONSOLIDATION',
      completeness: fullArchiveConfirmed ? 'CONFIRMED_FULL' : 'NOT_CONFIRMED'
    }
  };
}
