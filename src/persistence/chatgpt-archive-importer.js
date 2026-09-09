import { createConversationService } from '../conversations/conversation-service.js';

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
      messages
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
  await service.migrate();
  let inserted = 0, duplicates = 0, failed = 0;
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
            imported_at: Date.now()
          }
        });
        inserted++;
      } catch {
        failed++;
      }
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
    provenance: 'chatgpt_export'
  };
}
