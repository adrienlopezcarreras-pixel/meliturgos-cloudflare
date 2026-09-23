import { migrate } from "../persistence/migrations.js";
import { createD1MemoryCandidateSink, createExchangeMemorySync } from "../memory/exchange-sync.js";

export class ConversationService {
  constructor(db) {
    this.db = db;
    this.memorySync = createExchangeMemorySync({ candidateSink: createD1MemoryCandidateSink(db) });
  }

  async create({id=crypto.randomUUID(),owner='',title=''}={}) { await this.migrate(); await this.ensureConversation(id,owner,title); return this.get({id}); }
  async list({owner=''}={}) { await this.migrate(); return (await this.db.prepare("SELECT * FROM conversations WHERE owner=? OR owner='' ORDER BY updated_at DESC LIMIT 100").bind(owner).all()).results; }
  async get({id}) { await this.migrate(); return this.db.prepare('SELECT * FROM conversations WHERE id=?').bind(id).first(); }
  async update({id,title}) { await this.migrate(); await this.db.prepare('UPDATE conversations SET title=?,updated_at=? WHERE id=?').bind(title,Date.now(),id).run(); return this.get({id}); }
  async archive({id}) { await this.migrate(); await this.db.prepare("UPDATE conversations SET status='archived',updated_at=? WHERE id=?").bind(Date.now(),id).run(); return this.get({id}); }
  addMessage(input) { return this.archiveMessage(input); }
  listMessages({conversationId,...options}) { return this.getMessages(conversationId,options); }
  sync({deviceId,conversationId}) { return this.getSyncMessages(deviceId,conversationId); }

  async migrate() {
    if (!this._migrated) {
      await migrate(this.db);
      this._migrated = true;
    }
    return this;
  }

  async archiveMessage({
    id = crypto.randomUUID(),
    conversationId,
    deviceId = null,
    role,
    content,
    attachments = null,
    model = null,
    capabilitiesUsed = null,
    systemPromptVersion = null,
    timestamp = Date.now(),
    provenance = "",
    metadata = {},
  }) {
    await this.migrate();
    if (!conversationId) throw new Error("conversationId required");
    if (!role) throw new Error("role required");

    await this.ensureConversation(conversationId);

    await this.db
      .prepare(
        `INSERT OR IGNORE INTO archive_messages(
          id, conversation_id, device_id, role, content, attachments_json,
          model, capabilities_used_json, system_prompt_version, timestamp,
          provenance, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        conversationId,
        deviceId || null,
        role,
        content,
        attachments ? JSON.stringify(attachments) : null,
        model || null,
        capabilitiesUsed ? JSON.stringify(capabilitiesUsed) : null,
        systemPromptVersion || null,
        timestamp,
        provenance,
        JSON.stringify(metadata)
      )
      .run();

    // The archive row is the durable source event. Memory synchronization is
    // deliberately replay-safe: retries keep the immutable message id and the
    // candidate sink uses INSERT OR IGNORE on the deterministic candidate id.
    // If candidate persistence fails after archival, retrying archiveMessage()
    // completes the missing memory write without duplicating either record.
    await this.memorySync.sync([{
      conversationId,
      messageId: id,
      role,
      content,
      timestamp,
      provenance: provenance || 'conversation-service',
    }]);

    if (deviceId) {
      await this.updateSyncCheckpoint(deviceId, conversationId, id, timestamp);
    }

    return { id, conversationId };
  }

  async ensureConversation(id, owner = "", title = "") {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO conversations(id, owner, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`
      )
      .bind(id, owner || "", title || "", now, now)
      .run();
    return id;
  }

  async updateSyncCheckpoint(deviceId, conversationId, lastMessageId, lastMessageTimestamp) {
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO sync_checkpoints(device_id, conversation_id, last_message_id, last_message_timestamp, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(device_id, conversation_id) DO UPDATE SET
           last_message_id = excluded.last_message_id,
           last_message_timestamp = excluded.last_message_timestamp,
           updated_at = excluded.updated_at`
      )
      .bind(deviceId, conversationId, lastMessageId, lastMessageTimestamp, now)
      .run();
  }

  async getMessages(conversationId, { since = 0, limit = 1000, latest = false } = {}) {
    await this.migrate();
    const boundedLimit = Math.max(1, Math.min(10000, Number(limit) || 1000));
    const order = latest ? 'DESC' : 'ASC';
    const rows = await this.db
      .prepare(
        `SELECT * FROM archive_messages
         WHERE conversation_id = ? AND timestamp >= ?
         ORDER BY timestamp ${order}, id ${order}
         LIMIT ?`
      )
      .bind(conversationId, since, boundedLimit)
      .all();
    const messages = (rows.results || []).map(this._rowToMessage);
    return latest ? messages.reverse() : messages;
  }

  async registerDevice({ id, owner = "", name = "", kind = "unknown", metadata = {} }) {
    await this.migrate();
    const now = Date.now();
    await this.db
      .prepare(
        `INSERT INTO devices(id, owner, name, kind, created_at, updated_at, last_seen_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           kind = excluded.kind,
           updated_at = excluded.updated_at,
           last_seen_at = excluded.last_seen_at,
           metadata = excluded.metadata`
      )
      .bind(id, owner, name, kind, now, now, now, JSON.stringify(metadata))
      .run();
    return { deviceId: id };
  }

  async getSyncMessages(deviceId, conversationId) {
    await this.migrate();
    const checkpoint = await this.db
      .prepare(
        `SELECT last_message_timestamp FROM sync_checkpoints
         WHERE device_id = ? AND conversation_id = ?`
      )
      .bind(deviceId, conversationId)
      .first();
    const since = Number(checkpoint?.last_message_timestamp || 0);
    const rows = await this.db
      .prepare(
        `SELECT * FROM archive_messages
         WHERE conversation_id = ? AND timestamp > ?
         ORDER BY timestamp ASC, id ASC
         LIMIT 10000`
      )
      .bind(conversationId, since)
      .all();
    return {
      deviceId,
      conversationId,
      since,
      messages: (rows.results || []).map(row => this._rowToMessage(row)),
    };
  }

  _rowToMessage(row) {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      deviceId: row.device_id,
      role: row.role,
      content: row.content,
      attachments: row.attachments_json ? JSON.parse(row.attachments_json) : null,
      model: row.model,
      capabilitiesUsed: row.capabilities_used_json ? JSON.parse(row.capabilities_used_json) : null,
      systemPromptVersion: row.system_prompt_version,
      timestamp: row.timestamp,
      provenance: row.provenance,
      metadata: row.metadata ? JSON.parse(row.metadata) : {},
    };
  }
}

export function createConversationService(env) {
  return new ConversationService(env.DB);
}
