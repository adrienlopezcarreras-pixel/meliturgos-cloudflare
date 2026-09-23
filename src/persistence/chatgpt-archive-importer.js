import { createConversationService } from '../conversations/conversation-service.js';
import { createSyncService } from '../conversations/sync-service.js';

const MAX_CONVERSATIONS = 1000;
const MAX_MESSAGES = 100000;
const MAX_MESSAGE_CHARS = 200000;
const MAX_ATTACHMENTS_PER_MESSAGE = 32;
const MAX_ATTACHMENT_FIELD_CHARS = 1000;
const MAX_ATTACHMENT_INDEX_BYTES = 2_000_000;
const MAX_ATTACHMENT_INDEX_CHARS = 120_000;
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

function normalizeAttachmentDescriptor(value, { allowIndexedFields = false } = {}) {
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
  const indexedText = allowIndexedFields
    ? boundedAttachmentString(value.indexed_text, MAX_ATTACHMENT_INDEX_CHARS)
    : null;
  const indexedBytesRaw = allowIndexedFields ? Number(value.binary_content_bytes) : NaN;
  return {
    id,
    name,
    mime_type: mimeType,
    kind,
    size_bytes: Number.isFinite(sizeRaw) && sizeRaw >= 0 ? Math.trunc(sizeRaw) : null,
    width: Number.isFinite(widthRaw) && widthRaw > 0 ? Math.trunc(widthRaw) : null,
    height: Number.isFinite(heightRaw) && heightRaw > 0 ? Math.trunc(heightRaw) : null,
    binary_content_available: allowIndexedFields && value.binary_content_available === true,
    binary_content_indexed: Boolean(allowIndexedFields && value.binary_content_indexed === true && indexedText),
    binary_content_bytes: Number.isFinite(indexedBytesRaw) && indexedBytesRaw >= 0 ? Math.trunc(indexedBytesRaw) : null,
    binary_index_reason: allowIndexedFields ? boundedAttachmentString(value.binary_index_reason, 120) : null,
    indexed_text: indexedText,
  };
}

function attachmentLookupKeys(value) {
  if (!value || typeof value !== 'object') return [];
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  const ids = [
    value.id, value.file_id, value.fileId, value.asset_pointer, value.assetPointer,
    metadata.id, metadata.file_id, metadata.asset_pointer,
  ].map(v => boundedAttachmentString(v, 500)).filter(Boolean);
  const names = [
    value.name, value.filename, value.file_name, value.fileName, value.title,
    metadata.name, metadata.filename, metadata.file_name,
  ].map(v => boundedAttachmentString(v, 500)).filter(Boolean);
  return [...new Set([
    ...ids.map(v => 'id:' + v),
    ...names.map(v => 'name:' + v.toLowerCase()),
  ])];
}

function attachmentBinaryPayload(value) {
  if (!value || typeof value !== 'object') return null;
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  let base64 = value.bytes_base64 ?? value.data_base64 ?? value.content_base64 ?? value.base64
    ?? metadata.bytes_base64 ?? metadata.data_base64 ?? metadata.content_base64 ?? metadata.base64;
  if (typeof base64 !== 'string' || !base64.trim()) return null;
  base64 = base64.trim();
  let dataMime = null;
  const dataUrl = base64.match(/^data:([^;,]+)?;base64,(.*)$/is);
  if (dataUrl) {
    dataMime = boundedAttachmentString(dataUrl[1], 240);
    base64 = dataUrl[2];
  }
  base64 = base64.replace(/\s+/g, '');
  return {
    base64,
    mime_type: dataMime || boundedAttachmentString(
      value.mime_type ?? value.mimeType ?? value.content_type ?? value.contentType
        ?? metadata.mime_type ?? metadata.content_type,
      240
    ),
  };
}

function buildAttachmentByteLookup(payload) {
  const lookup = new Map();
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') return lookup;
  const containers = [
    payload.files,
    payload.assets,
    payload.attachments,
    payload.binary_attachments,
    payload.attachment_files,
  ];
  const rows = [];
  for (const container of containers) {
    if (Array.isArray(container)) {
      rows.push(...container);
      continue;
    }
    if (container && typeof container === 'object') {
      for (const [key, raw] of Object.entries(container)) {
        if (typeof raw === 'string') rows.push({ name:key, data_base64:raw });
        else if (raw && typeof raw === 'object') rows.push({ ...raw, name:raw.name ?? raw.filename ?? key });
      }
    }
  }
  for (const row of rows) {
    if (!attachmentBinaryPayload(row)) continue;
    for (const key of attachmentLookupKeys(row)) if (!lookup.has(key)) lookup.set(key, row);
  }
  return lookup;
}

function isTextualAttachment(mimeType, name) {
  const type = String(mimeType || '').toLowerCase();
  const filename = String(name || '').toLowerCase();
  return /^text\//i.test(type)
    || /(?:json|xml|javascript|typescript|yaml|yml|csv|markdown|sql)$/i.test(type)
    || /\.(?:txt|md|json|csv|tsv|js|mjs|cjs|ts|tsx|jsx|css|html|htm|xml|yml|yaml|toml|ini|log|sql|py|sh|ps1|java|c|h|cpp|hpp|rs|go|php|rb)$/i.test(filename);
}

function decodeAttachmentBase64(base64) {
  if (typeof base64 !== 'string' || !base64) return { bytes:null, reason:'BYTES_MISSING' };
  const maxEncoded = Math.ceil(MAX_ATTACHMENT_INDEX_BYTES * 4 / 3) + 16;
  if (base64.length > maxEncoded) return { bytes:null, reason:'TOO_LARGE' };
  try {
    const binary = atob(base64);
    if (binary.length > MAX_ATTACHMENT_INDEX_BYTES) return { bytes:null, reason:'TOO_LARGE' };
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, reason:null };
  } catch {
    return { bytes:null, reason:'BASE64_INVALID' };
  }
}

function enrichAttachmentFromBytes(descriptor, raw, lookup) {
  if (!descriptor) return null;
  let source = attachmentBinaryPayload(raw);
  if (!source && lookup instanceof Map) {
    for (const key of attachmentLookupKeys(raw)) {
      const match = lookup.get(key);
      if (!match) continue;
      source = attachmentBinaryPayload(match);
      if (source) break;
    }
  }
  if (!source) return descriptor;

  const decoded = decodeAttachmentBase64(source.base64);
  if (!decoded.bytes) {
    return {
      ...descriptor,
      binary_content_available: decoded.reason === 'TOO_LARGE',
      binary_content_indexed: false,
      binary_index_reason: decoded.reason,
    };
  }

  const mimeType = descriptor.mime_type || source.mime_type || null;
  const base = {
    ...descriptor,
    binary_content_available: true,
    binary_content_bytes: decoded.bytes.length,
  };
  if (!isTextualAttachment(mimeType, descriptor.name)) {
    return { ...base, binary_content_indexed:false, binary_index_reason:'UNSUPPORTED_BINARY_TYPE' };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal:false }).decode(decoded.bytes).slice(0, MAX_ATTACHMENT_INDEX_CHARS);
    if (!text.trim()) return { ...base, binary_content_indexed:false, binary_index_reason:'EMPTY_TEXT' };
    return {
      ...base,
      binary_content_indexed: true,
      binary_index_reason: 'TEXT_DECODED',
      indexed_text: text,
    };
  } catch {
    return { ...base, binary_content_indexed:false, binary_index_reason:'TEXT_DECODE_FAILED' };
  }
}

function messageAttachments(message, attachmentLookup = null) {
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
    const normalized = enrichAttachmentFromBytes(normalizeAttachmentDescriptor(candidate), candidate, attachmentLookup);
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

function flattenMapping(conversation, conversationIndex, attachmentLookup = null) {
  const mapping = conversation?.mapping;
  if (!mapping || typeof mapping !== 'object') return [];
  const rows = [];
  for (const [nodeId, node] of Object.entries(mapping)) {
    const message = node?.message;
    if (!message) continue;
    const text = messageText(message);
    const attachments = messageAttachments(message, attachmentLookup);
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

function flattenLinearConversation(conversation, conversationIndex, attachmentLookup = null) {
  const source = conversation?.messages;
  if (!Array.isArray(source)) return [];
  return source.map((message, index) => {
    const text = messageText(message);
    const attachments = messageAttachments(message, attachmentLookup);
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
  const attachmentLookup = buildAttachmentByteLookup(payload);
  const normalized = [];
  let messageCount = 0;
  for (let i = 0; i < conversations.length; i++) {
    if (messageCount >= MAX_MESSAGES) break;
    const raw = conversations[i] || {};
    const sourceId = String(raw.id || raw.conversation_id || `conversation-${i + 1}`);
    const id = `chatgpt:${sourceId}`;
    const title = String(raw.title || `Conversation ChatGPT ${i + 1}`).slice(0, 500);
    let messages = flattenMapping(raw, i, attachmentLookup);
    if (!messages.length) messages = flattenLinearConversation(raw, i, attachmentLookup);
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

function parseStoredJson(value, fallback) {
  if (!value || typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function attachmentIdentity(item) {
  const id = String(item?.id || '').trim();
  if (id) return `id:${id}`;
  return [
    String(item?.name || '').trim().toLowerCase(),
    String(item?.mime_type || '').trim().toLowerCase(),
    String(item?.kind || '').trim().toLowerCase(),
    Number(item?.size_bytes || 0),
  ].join('|');
}

function mergeAttachmentDescriptors(existing, incoming) {
  const merged = [];
  const index = new Map();
  const add = (raw, preferIncoming = false) => {
    const item = normalizeAttachmentDescriptor(raw, { allowIndexedFields:true });
    if (!item) return;
    const key = attachmentIdentity(item);
    if (!key) return;
    if (!index.has(key)) {
      index.set(key, merged.length);
      merged.push(item);
      return;
    }
    if (!preferIncoming) return;
    const at = index.get(key);
    const current = merged[at];
    merged[at] = {
      id: current.id || item.id,
      name: current.name || item.name,
      mime_type: current.mime_type || item.mime_type,
      kind: current.kind || item.kind,
      size_bytes: current.size_bytes ?? item.size_bytes,
      width: current.width ?? item.width,
      height: current.height ?? item.height,
      binary_content_available: current.binary_content_available === true || item.binary_content_available === true,
      binary_content_indexed: current.binary_content_indexed === true || item.binary_content_indexed === true,
      binary_content_bytes: current.binary_content_bytes ?? item.binary_content_bytes,
      binary_index_reason: current.binary_content_indexed === true
        ? current.binary_index_reason
        : (item.binary_index_reason || current.binary_index_reason),
      indexed_text: current.indexed_text || item.indexed_text || null,
    };
  };
  for (const item of Array.isArray(existing) ? existing : []) add(item, false);
  for (const item of Array.isArray(incoming) ? incoming : []) add(item, true);
  return merged.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
}

async function readExistingArchiveMessage(db, id) {
  try {
    return await db.prepare('SELECT id,content,attachments_json,metadata FROM archive_messages WHERE id=?').bind(id).first();
  } catch {
    return null;
  }
}

async function enrichExistingArchiveMessage(db, id, existingRow, message) {
  const existingAttachments = parseStoredJson(existingRow?.attachments_json, []);
  const incomingAttachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const mergedAttachments = mergeAttachmentDescriptors(existingAttachments, incomingAttachments);
  const beforeAttachments = JSON.stringify(Array.isArray(existingAttachments) ? existingAttachments : []);
  const afterAttachments = JSON.stringify(mergedAttachments);
  const attachmentBackfill = afterAttachments !== beforeAttachments;
  const existingContent = String(existingRow?.content || '');
  const incomingContent = String(message?.content || '');
  const contentBackfill = !existingContent.trim() && !!incomingContent.trim();
  if (!attachmentBackfill && !contentBackfill) return { changed:false, attachment_backfill:false, content_backfill:false };

  const metadata = parseStoredJson(existingRow?.metadata, {});
  if (attachmentBackfill) {
    metadata.attachment_count = mergedAttachments.length;
    metadata.attachment_binary_content_indexed = mergedAttachments.some(item => item?.binary_content_indexed === true);
    metadata.attachment_metadata_backfilled_at = Date.now();
  }
  if (contentBackfill) metadata.content_backfilled_at = Date.now();

  await db.prepare('UPDATE archive_messages SET content=?, attachments_json=?, metadata=? WHERE id=?')
    .bind(contentBackfill ? incomingContent : existingContent,
      mergedAttachments.length ? afterAttachments : (existingRow?.attachments_json || null),
      JSON.stringify(metadata), id).run();
  return { changed:true, attachment_backfill:attachmentBackfill, content_backfill:contentBackfill };
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
  let enrichedDuplicates = 0, attachmentBackfills = 0, contentBackfills = 0;
  const memorySync = { scanned: 0, eligible: 0, inserted: 0, alreadyPresent: 0, skippedEmpty: 0, failed_conversations: 0 };
  for (const conversation of normalized.conversations) {
    await service.ensureConversation(conversation.id, env.MELITURGOS_USER || '', conversation.title);
    for (const message of conversation.messages) {
      const id = archiveMessageId(conversation.sourceId, message.messageId);
      const existing = await readExistingArchiveMessage(env.DB, id);
      if (existing) {
        duplicates++;
        try {
          const enrichment = await enrichExistingArchiveMessage(env.DB, id, existing, message);
          if (enrichment.changed) enrichedDuplicates++;
          if (enrichment.attachment_backfill) attachmentBackfills++;
          if (enrichment.content_backfill) contentBackfills++;
        } catch {
          failed++;
        }
        continue;
      }
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
            attachment_binary_content_indexed: Boolean(message.attachments?.some(item => item?.binary_content_indexed === true)),
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
    enriched_duplicates: enrichedDuplicates,
    attachment_backfills: attachmentBackfills,
    content_backfills: contentBackfills,
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
      attachment_index: { messages_with_attachments: 0, descriptors: 0, metadata_searchable: false, binary_content_available: 0, indexed_descriptors: 0, binary_content_indexed: false },
      full_archive_confirmed: false,
      last_received: null
    };
  }

  const service = createConversationService(env);
  await service.migrate();

  const [conversations, messages, userMessages, assistantMessages, memoryCandidates, pendingCandidates, unsyncedMessages, attachmentMessages, attachmentDescriptors, attachmentBinaryAvailable, attachmentBinaryIndexed] = await Promise.all([
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
        AND json_valid(attachments_json)`),
    scalar(env.DB, `SELECT COUNT(*) AS count
      FROM archive_messages a, json_each(a.attachments_json) j
      WHERE a.provenance='chatgpt_export'
        AND a.attachments_json IS NOT NULL
        AND json_valid(a.attachments_json)
        AND COALESCE(json_extract(j.value,'$.binary_content_available'),0)=1`),
    scalar(env.DB, `SELECT COUNT(*) AS count
      FROM archive_messages a, json_each(a.attachments_json) j
      WHERE a.provenance='chatgpt_export'
        AND a.attachments_json IS NOT NULL
        AND json_valid(a.attachments_json)
        AND COALESCE(json_extract(j.value,'$.binary_content_indexed'),0)=1`)
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
  const coverageById = new Map();
  let missingDoneFromArchive = 0, underfilledDone = 0;
  for (const item of coverageItems) {
    const itemStatus = String(item?.status || '').toUpperCase();
    const itemId = String(item?.id || '');
    if (itemId) coverageById.set(itemId, item);
    if (Object.prototype.hasOwnProperty.call(coverageCounts, itemStatus)) coverageCounts[itemStatus]++;
    if (itemStatus === 'DONE') {
      const stored = storedById.get(itemId);
      if (stored == null) missingDoneFromArchive++;
      else if (stored < Math.max(0, Number(item.messages || 0))) underfilledDone++;
    }
  }

  let archivedMissingFromInventory = 0;
  for (const archivedId of storedById.keys()) {
    const inventoryItem = coverageById.get(archivedId);
    if (!inventoryItem || String(inventoryItem.status || '').toUpperCase() !== 'DONE') {
      archivedMissingFromInventory++;
    }
  }

  const unresolvedRecoverable = coverageCounts.PARTIAL + coverageCounts.FAILED + coverageCounts.DEFERRED + coverageCounts.QUEUED;
  const inventoryReported = coverageManifest != null;
  const archivedCountMatchesDone = receiptAggregate.archived_conversations === coverageCounts.DONE;
  const inventoryConfirmed = Boolean(coverageManifest?.deep_discovery_done === true
    && coverageManifest.discovered_count === coverageItems.length
    && unresolvedRecoverable === 0
    && missingDoneFromArchive === 0
    && underfilledDone === 0
    && archivedMissingFromInventory === 0
    && archivedCountMatchesDone);
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
      binary_content_available: attachmentBinaryAvailable,
      indexed_descriptors: attachmentBinaryIndexed,
      binary_content_indexed: attachmentBinaryIndexed > 0,
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
      archived_missing_from_inventory: archivedMissingFromInventory,
      done_archived_count_match: archivedCountMatchesDone,
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
