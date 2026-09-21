import { createConversationService } from '../conversations/conversation-service.js';
import { createSyncService } from '../conversations/sync-service.js';

const MAX_CONVERSATIONS = 1000;
const MAX_MESSAGES = 100000;
const MAX_MESSAGE_CHARS = 200000;
const MAX_ATTACHMENTS_PER_MESSAGE = 32;
const MAX_ATTACHMENT_FIELD_CHARS = 1000;
const MAX_COVERAGE_ITEMS = 25000;
const COVERAGE_STATUSES = new Set(['DONE','PARTIAL','FAILED','UNAVAILABLE','DEFERRED','QUEUED']);

function normalizeCoverageId(value) {
  return String(value || '').trim().replace(/^chatgpt:/, '').slice(0, 240);
}

function normalizeCoverageStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  if (!COVERAGE_STATUSES.has(status)) {
    throw Object.assign(new Error('CHATGPT_COVERAGE_STATUS_INVALID'), { code: 'CHATGPT_COVERAGE_STATUS_INVALID', status: 400 });
  }
  return status;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeChatGPTCollectorCoverage(payload = {}) {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length > MAX_COVERAGE_ITEMS) {
    throw Object.assign(new Error('CHATGPT_COVERAGE_TOO_LARGE'), { code: 'CHATGPT_COVERAGE_TOO_LARGE', status: 413 });
  }
  const byId = new Map();
  for (const raw of rawItems) {
    const id = normalizeCoverageId(raw?.id);
    if (!id) continue;
    const status = normalizeCoverageStatus(raw?.status);
    const messages = Math.max(0, Math.trunc(Number(raw?.messages) || 0));
    byId.set(id, { id, status, messages });
  }
  const items = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const discoveredRaw = Number(payload.discovered_count ?? payload.discovered ?? items.length);
  const discoveredCount = Number.isFinite(discoveredRaw) && discoveredRaw >= 0
    ? Math.max(items.length, Math.trunc(discoveredRaw))
    : items.length;
  const capturedRaw = Number(payload.captured_at);
  return {
    collector_version: payload.collector_version ? String(payload.collector_version).slice(0, 40) : null,
    deep_discovery_done: payload.deep_discovery_done === true,
    discovered_count: discoveredCount,
    captured_at: Number.isFinite(capturedRaw) && capturedRaw > 0 ? Math.trunc(capturedRaw) : null,
    items,
  };
}

export async function recordChatGPTCollectorCoverage(env, payload = {}) {
  if (!env?.DB) throw Object.assign(new Error('DB_BINDING_REQUIRED'), { code: 'DB_BINDING_REQUIRED', status: 503 });
  const service = createConversationService(env);
  await service.migrate();
  const normalized = normalizeChatGPTCollectorCoverage(payload);
  const manifestJson = JSON.stringify(normalized);
  const manifestSha256 = await sha256Hex(manifestJson);
  const receivedAt = Date.now();
  await env.DB.prepare(`INSERT INTO chatgpt_collector_coverage
    (id,collector_version,deep_discovery_done,discovered_count,manifest_json,manifest_sha256,captured_at,received_at)
    VALUES ('latest',?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      collector_version=excluded.collector_version,
      deep_discovery_done=excluded.deep_discovery_done,
      discovered_count=excluded.discovered_count,
      manifest_json=excluded.manifest_json,
      manifest_sha256=excluded.manifest_sha256,
      captured_at=excluded.captured_at,
      received_at=excluded.received_at`)
    .bind(normalized.collector_version, normalized.deep_discovery_done ? 1 : 0, normalized.discovered_count, manifestJson, manifestSha256, normalized.captured_at, receivedAt)
    .run();
  return { ok: true, received_at: receivedAt, manifest_sha256: manifestSha256, ...normalized };
}

async function loadChatGPTCollectorCoverage(db) {
  try {
    const row = await db.prepare("SELECT collector_version,deep_discovery_done,discovered_count,manifest_json,manifest_sha256,captured_at,received_at FROM chatgpt_collector_coverage WHERE id='latest'").first();
    if (!row) return null;
    const parsed = row.manifest_json ? JSON.parse(row.manifest_json) : {};
    return {
      collector_version: row.collector_version || parsed.collector_version || null,
      deep_discovery_done: Number(row.deep_discovery_done || 0) === 1,
      discovered_count: Number(row.discovered_count || parsed.discovered_count || 0),
      items: Array.isArray(parsed.items) ? parsed.items : [],
      manifest_sha256: row.manifest_sha256 || null,
      captured_at: row.captured_at == null ? null : Number(row.captured_at),
      received_at: Number(row.received_at || 0) || null,
    };
  } catch { return null; }
}

async function archiveConversationRows(db) {
  try {
    const result = await db.prepare(`SELECT conversation_id, COUNT(*) AS stored_messages
      FROM archive_messages WHERE provenance='chatgpt_export' GROUP BY conversation_id`).all();
    return result?.results || [];
  } catch { return []; }
}

async function archiveReceiptAggregate(db) {
  try {
    const row = await db.prepare(`WITH archived AS (
        SELECT conversation_id, COUNT(*) AS stored_messages
        FROM archive_messages WHERE provenance='chatgpt_export' GROUP BY conversation_id
      ), normalized AS (
        SELECT a.conversation_id, a.stored_messages,
          CASE WHEN json_valid(c.metadata) AND json_type(c.metadata,'$.chatgpt_import')='object' THEN 1 ELSE 0 END AS has_receipt,
          CASE WHEN json_valid(c.metadata) THEN COALESCE(json_extract(c.metadata,'$.chatgpt_import.complete'),0) ELSE 0 END AS receipt_complete,
          CASE WHEN json_valid(c.metadata) THEN COALESCE(json_extract(c.metadata,'$.chatgpt_import.expected_messages'),0) ELSE 0 END AS expected_messages
        FROM archived a LEFT JOIN conversations c ON c.id=a.conversation_id
      )
      SELECT COUNT(*) AS archived_conversations,
        COALESCE(SUM(has_receipt),0) AS tracked_conversations,
        COALESCE(SUM(CASE WHEN has_receipt=0 THEN 1 ELSE 0 END),0) AS unknown_completeness,
        COALESCE(SUM(CASE WHEN has_receipt=1 AND receipt_complete=1 AND stored_messages>=expected_messages THEN 1 ELSE 0 END),0) AS complete_conversations,
        COALESCE(SUM(CASE WHEN has_receipt=1 AND NOT(receipt_complete=1 AND stored_messages>=expected_messages) THEN 1 ELSE 0 END),0) AS partial_conversations,
        COALESCE(SUM(CASE WHEN has_receipt=1 THEN expected_messages ELSE 0 END),0) AS expected_messages,
        COALESCE(SUM(CASE WHEN has_receipt=1 AND stored_messages<expected_messages THEN 1 ELSE 0 END),0) AS underfilled_conversations,
        COALESCE(SUM(CASE WHEN has_receipt=1 AND stored_messages<expected_messages THEN expected_messages-stored_messages ELSE 0 END),0) AS missing_expected_messages
      FROM normalized`).first();
    return {
      archived_conversations: Number(row?.archived_conversations || 0), tracked_conversations: Number(row?.tracked_conversations || 0),
      unknown_completeness: Number(row?.unknown_completeness || 0), complete_conversations: Number(row?.complete_conversations || 0),
      partial_conversations: Number(row?.partial_conversations || 0), expected_messages: Number(row?.expected_messages || 0),
      underfilled_conversations: Number(row?.underfilled_conversations || 0), missing_expected_messages: Number(row?.missing_expected_messages || 0),
    };
  } catch {
    return { archived_conversations:0,tracked_conversations:0,unknown_completeness:0,complete_conversations:0,partial_conversations:0,expected_messages:0,underfilled_conversations:0,missing_expected_messages:0 };
  }
}

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

function boundedAttachmentString(value, max = MAX_ATTACHMENT_FIELD_CHARS) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

function normalizeAttachmentDescriptor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  const id = boundedAttachmentString(
    value.id ?? value.file_id ?? value.fileId ?? value.asset_pointer ?? value.assetPointer
      ?? metadata.id ?? metadata.file_id ?? metadata.asset_pointer
  );
  const name = boundedAttachmentString(
    value.name ?? value.filename ?? value.file_name ?? value.fileName ?? value.title
      ?? metadata.name ?? metadata.filename ?? metadata.file_name
  );
  const mimeType = boundedAttachmentString(
    value.mime_type ?? value.mimeType ?? value.content_type ?? value.contentType
      ?? metadata.mime_type ?? metadata.content_type
  , 240);
  const kind = boundedAttachmentString(value.type ?? value.kind ?? metadata.type ?? metadata.kind, 120);
  const sizeRaw = Number(value.size_bytes ?? value.size ?? metadata.size_bytes ?? metadata.size);
  const widthRaw = Number(value.width ?? metadata.width);
  const heightRaw = Number(value.height ?? metadata.height);
  if (!id && !name && !mimeType && !kind) return null;
  return {
    id,
    name,
    mime_type: mimeType,
    kind,
    size_bytes: Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.trunc(sizeRaw) : null,
    width: Number.isFinite(widthRaw) && widthRaw > 0 ? Math.trunc(widthRaw) : null,
    height: Number.isFinite(heightRaw) && heightRaw > 0 ? Math.trunc(heightRaw) : null,
    binary_content_indexed: false,
  };
}

function messageAttachments(message) {
  const content = message?.content && typeof message.content === 'object' ? message.content : {};
  const candidates = [
    ...(Array.isArray(message?.attachments) ? message.attachments : []),
    ...(Array.isArray(message?.metadata?.attachments) ? message.metadata.attachments : []),
    ...(Array.isArray(content?.attachments) ? content.attachments : []),
  ];
  for (const part of Array.isArray(content?.parts) ? content.parts : []) {
    if (part && typeof part === 'object' && !Array.isArray(part)) candidates.push(part);
  }
  const out = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeAttachmentDescriptor(candidate);
    if (!normalized) continue;
    const key = JSON.stringify(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
  }
  return out;
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
    const attachments = messageAttachments(message);
    if (!text && !attachments.length) continue;
    const role = normalizeRole(message?.author?.role);
    const ts = timestampMs(message?.create_time ?? conversation?.create_time, Date.now() + conversationIndex);
    rows.push({
      nodeId,
      messageId: String(message.id || nodeId),
      role,
      content: text.slice(0, MAX_MESSAGE_CHARS),
      attachments,
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
    const attachments = messageAttachments(message);
    return {
      nodeId: String(message?.id || index),
      messageId: String(message?.id || index),
      role: normalizeRole(message?.role || message?.author?.role),
      content: text.slice(0, MAX_MESSAGE_CHARS),
      attachments,
      timestamp: timestampMs(message?.create_time ?? message?.timestamp ?? conversation?.create_time, Date.now() + conversationIndex + index),
      parent: null,
      metadata: { chatgpt_message_id: message?.id || null, truncated: text.length > MAX_MESSAGE_CHARS, attachment_count: attachments.length }
    };
  }).filter(x => x.content || x.attachments.length);
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
          attachments: message.attachments?.length ? message.attachments : null,
          timestamp: message.timestamp,
          provenance: 'chatgpt_export',
          metadata: {
            ...message.metadata,
            chatgpt_conversation_id: conversation.sourceId,
            chatgpt_conversation_title: conversation.title,
            source_type: 'chatgpt_export',
            attachment_count: message.attachments?.length || 0,
            attachment_binary_content_indexed: false,
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
      server_archive_complete: false,
      collector_inventory_confirmed: false,
      collector_inventory: null,
      attachment_index: { messages_with_attachments: 0, descriptors: 0, metadata_searchable: false, binary_content_indexed: false },
      full_archive_confirmed: false,
      last_received: null
    };
  }

  const service = createConversationService(env);
  await service.migrate();

  const [conversations, messages, userMessages, assistantMessages, memoryCandidates, pendingCandidates, unsyncedMessages, attachmentMessages, attachmentDescriptors] = await Promise.all([
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
        )`),
    scalar(env.DB, `SELECT COUNT(*) AS count FROM archive_messages
      WHERE provenance='chatgpt_export'
        AND attachments_json IS NOT NULL
        AND json_valid(attachments_json)
        AND json_array_length(attachments_json)>0`),
    scalar(env.DB, `SELECT COALESCE(SUM(json_array_length(attachments_json)),0) AS count FROM archive_messages
      WHERE provenance='chatgpt_export'
        AND attachments_json IS NOT NULL
        AND json_valid(attachments_json)`)
  ]);

  const [receiptAggregate, coverageManifest, storedConversationRows] = await Promise.all([
    archiveReceiptAggregate(env.DB), loadChatGPTCollectorCoverage(env.DB), archiveConversationRows(env.DB),
  ]);
  const trackedConversations = receiptAggregate.tracked_conversations;
  const completeConversations = receiptAggregate.complete_conversations;
  const partialConversations = receiptAggregate.partial_conversations;
  const unknownCompleteness = Math.max(0, receiptAggregate.archived_conversations - trackedConversations);
  const expectedMessages = receiptAggregate.expected_messages;
  const serverArchiveComplete = receiptAggregate.archived_conversations > 0
    && trackedConversations === receiptAggregate.archived_conversations
    && completeConversations === receiptAggregate.archived_conversations
    && partialConversations === 0 && unknownCompleteness === 0 && receiptAggregate.underfilled_conversations === 0;

  const storedById = new Map(storedConversationRows.map(row => [String(row.conversation_id || '').replace(/^chatgpt:/, ''), Number(row.stored_messages || 0)]));
  const coverageItems = coverageManifest?.items || [];
  const coverageCounts = { DONE:0, PARTIAL:0, FAILED:0, UNAVAILABLE:0, DEFERRED:0, QUEUED:0 };
  let missingDoneFromArchive = 0, underfilledDone = 0;
  for (const item of coverageItems) {
    const itemStatus = String(item?.status || '').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(coverageCounts, itemStatus)) coverageCounts[itemStatus]++;
    if (itemStatus === 'DONE') {
      const stored = storedById.get(String(item.id || ''));
      if (stored == null) missingDoneFromArchive++;
      else if (stored < Math.max(0, Number(item.messages || 0))) underfilledDone++;
    }
  }
  const unresolvedRecoverable = coverageCounts.PARTIAL + coverageCounts.FAILED + coverageCounts.DEFERRED + coverageCounts.QUEUED;
  const inventoryReported = coverageManifest != null;
  const inventoryConfirmed = Boolean(coverageManifest?.deep_discovery_done === true
    && coverageManifest.discovered_count === coverageItems.length
    && unresolvedRecoverable === 0 && missingDoneFromArchive === 0 && underfilledDone === 0);
  const fullArchiveConfirmed = serverArchiveComplete && inventoryConfirmed;

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
    attachment_index: {
      messages_with_attachments: attachmentMessages,
      descriptors: attachmentDescriptors,
      metadata_searchable: true,
      binary_content_indexed: false,
    },
    tracked_conversations: trackedConversations,
    complete_conversations: completeConversations,
    partial_conversations: partialConversations,
    unknown_completeness: unknownCompleteness,
    expected_messages: expectedMessages,
    underfilled_conversations: receiptAggregate.underfilled_conversations,
    missing_expected_messages: receiptAggregate.missing_expected_messages,
    server_archive_complete: serverArchiveComplete,
    collector_inventory_confirmed: inventoryConfirmed,
    collector_inventory: inventoryReported ? {
      collector_version: coverageManifest.collector_version,
      deep_discovery_done: coverageManifest.deep_discovery_done,
      discovered_count: coverageManifest.discovered_count,
      reported_items: coverageItems.length,
      recoverable_count: Math.max(0, coverageItems.length - coverageCounts.UNAVAILABLE),
      unresolved_recoverable: unresolvedRecoverable,
      missing_done_from_archive: missingDoneFromArchive,
      underfilled_done: underfilledDone,
      counts: coverageCounts,
      manifest_sha256: coverageManifest.manifest_sha256,
      captured_at: coverageManifest.captured_at,
      received_at: coverageManifest.received_at,
    } : null,
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
      completeness: fullArchiveConfirmed ? 'CONFIRMED_FULL' : (serverArchiveComplete ? 'SERVER_COMPLETE_AWAITING_COLLECTOR_INVENTORY' : 'NOT_CONFIRMED')
    }
  };
}
