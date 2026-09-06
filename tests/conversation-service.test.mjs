import assert from "node:assert";
import { ConversationService } from "../src/conversations/conversation-service.js";

class MockDB {
  constructor() {
    this.tables = {};
    this.indexes = {};
  }

  prepare(sql) {
    return new MockStmt(sql, this);
  }
}

class MockStmt {
  constructor(sql, db) {
    this.sql = sql;
    this.db = db;
    this.params = [];
  }
  bind(...args) {
    this.params = args;
    return this;
  }
  async run() {
    const sql = this.sql.trim().toLowerCase();
    if (sql.startsWith("create table")) {
      const name = sql.match(/create table if not exists (\w+)/)?.[1];
      if (name) this.db.tables[name] = true;
    } else if (sql.startsWith("create index")) {
      const name = sql.match(/create index if not exists (\w+)/)?.[1];
      if (name) this.db.indexes[name] = true;
    } else if (sql.startsWith("insert into archive_messages")) {
      this.db.lastArchive = this.params;
      return { meta: { changes: 1 } };
    } else if (sql.startsWith("insert into sync_checkpoints")) {
      this.db.lastCheckpoint = this.params;
      return { meta: { changes: 1 } };
    } else if (sql.startsWith("insert into conversations")) {
      return { meta: { changes: 1 } };
    } else if (sql.startsWith("insert into devices")) {
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
  async first() {
    const sql = this.sql.trim().toLowerCase();
    if (sql.includes("select max(version)")) return { v: 2 };
    if (sql.includes("schema_migrations")) return { v: 2 };
    return null;
  }
  async all() {
    const sql = this.sql.trim().toLowerCase();
    if (sql.includes("archive_messages")) return { results: this.db.messages || [] };
    if (sql.includes("conversations")) return { results: [] };
    return { results: [] };
  }
}

async function testArchiveMessage() {
  const db = new MockDB();
  const service = new ConversationService(db);
  const result = await service.archiveMessage({
    conversationId: "conv-1",
    deviceId: "dev-1",
    role: "user",
    content: "Bonjour",
    model: "@cf/moonshotai/kimi-k2.7-code",
    provenance: "chat",
  });
  assert.equal(result.conversationId, "conv-1");
  assert.ok(db.lastArchive);
  assert.equal(db.lastArchive[3], "user");
  assert.equal(db.lastArchive[4], "Bonjour");
  assert.equal(db.lastArchive[6], "@cf/moonshotai/kimi-k2.7-code");
  console.log("conversation-service: archive message OK");
}

async function testRegisterDevice() {
  const db = new MockDB();
  const service = new ConversationService(db);
  const result = await service.registerDevice({ id: "dev-1", name: "Phone", kind: "mobile", owner: "adrien" });
  assert.equal(result.deviceId, "dev-1");
  console.log("conversation-service: register device OK");
}

async function testGetMessages() {
  const db = new MockDB();
  db.messages = [
    { id: "m1", conversation_id: "conv-1", device_id: "dev-1", role: "user", content: "Hello", attachments_json: null, model: null, capabilities_used_json: null, system_prompt_version: null, timestamp: 1, provenance: "chat", metadata: "{}" },
  ];
  const service = new ConversationService(db);
  const messages = await service.getMessages("conv-1");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].role, "user");
  console.log("conversation-service: get messages OK");
}

await testArchiveMessage();
await testRegisterDevice();
await testGetMessages();
