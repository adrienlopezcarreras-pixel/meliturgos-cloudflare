import { DB_SCHEMA_VERSION } from "../core/config.js";

export const MIGRATIONS = [
  // v1: legacy schema already exists from worker.js initDB.
  // v2: Gen2 conversation/archive model
  {
    version: 2,
    name: "gen2_conversation_archive",
    run: async (db) => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          metadata TEXT NOT NULL DEFAULT '{}'
        )
      `).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          owner TEXT NOT NULL DEFAULT '',
          name TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL DEFAULT 'unknown',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_seen_at INTEGER,
          metadata TEXT NOT NULL DEFAULT '{}'
        )
      `).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS archive_messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          device_id TEXT,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          attachments_json TEXT,
          model TEXT,
          capabilities_used_json TEXT,
          system_prompt_version TEXT,
          timestamp INTEGER NOT NULL,
          provenance TEXT NOT NULL DEFAULT '',
          metadata TEXT NOT NULL DEFAULT '{}'
        )
      `).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS sync_checkpoints (
          device_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL,
          last_message_id TEXT NOT NULL,
          last_message_timestamp INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (device_id, conversation_id)
        )
      `).run();

      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_archive_conv_ts
        ON archive_messages(conversation_id, timestamp)
      `).run();

      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_archive_device_ts
        ON archive_messages(device_id, timestamp)
      `).run();
    },
  },
  // v3: Audit logs table
  {
    version: 3,
    name: "audit_logs_table",
    run: async (db) => {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          action TEXT NOT NULL,
          path TEXT,
          details_json TEXT NOT NULL,
          client_ip TEXT,
          user_agent TEXT,
          request_method TEXT,
          response_status INTEGER,
          error_message TEXT,
          duration_ms INTEGER,
          created_at INTEGER NOT NULL  -- Auto-set using default value in inserts
        )
      `).run();

      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
        ON audit_logs(timestamp DESC)
      `).run();

      await db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_action
        ON audit_logs(action)
      `).run();
    },
  },
];

export async function migrate(db, targetVersion = DB_SCHEMA_VERSION) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `).run();

  const currentRow = await db.prepare("SELECT MAX(version) v FROM schema_migrations").first();
  let currentVersion = currentRow?.v || 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;
    if (migration.version > targetVersion) break;
    await migration.run(db);
    await db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)")
      .bind(migration.version, migration.name, Date.now())
      .run();
    currentVersion = migration.version;
  }

  return { currentVersion, targetVersion };
}
