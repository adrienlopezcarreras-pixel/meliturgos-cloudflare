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
  {
    version: 4,
    name: "gen2_runtime_repositories",
    run: async (db) => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_entities (id TEXT PRIMARY KEY,type TEXT NOT NULL,name TEXT NOT NULL,source TEXT NOT NULL,confidence REAL NOT NULL,metadata TEXT NOT NULL DEFAULT '{}',created_at INTEGER NOT NULL)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_relations (id TEXT PRIMARY KEY,subject TEXT NOT NULL,relation TEXT NOT NULL,object TEXT NOT NULL,source TEXT NOT NULL,confidence REAL NOT NULL,created_at INTEGER NOT NULL)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS timeline_events (event_id TEXT PRIMARY KEY,type TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,occurred_at INTEGER NOT NULL,source TEXT NOT NULL,confidence REAL NOT NULL,metadata TEXT NOT NULL DEFAULT '{}')`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY,owner TEXT NOT NULL,type TEXT NOT NULL,trigger_json TEXT NOT NULL,actions_json TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,next_run_at INTEGER,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY,automation_id TEXT NOT NULL,status TEXT NOT NULL,result_json TEXT,created_at INTEGER NOT NULL)`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS backup_objects (id TEXT PRIMARY KEY,object_key TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at INTEGER NOT NULL)`).run();
    },
  },
  { version: 5, name: 'self_dev_d1_state', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS dev_jobs (id TEXT PRIMARY KEY,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,status TEXT NOT NULL,requested_by TEXT,goal TEXT NOT NULL,optional_context TEXT,plan_json TEXT,files_json TEXT,patch_json TEXT,tests_json TEXT,result_json TEXT,candidate_branch TEXT,approval_status TEXT,error TEXT)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS dev_bridge_state (bridge_id TEXT PRIMARY KEY,last_seen INTEGER NOT NULL,status TEXT,metadata_json TEXT NOT NULL DEFAULT '{}')`).run();
  }},
  { version: 6, name: 'mentor_learning_memory', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS mentor_lessons (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      goal TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'LESSON',
      lesson TEXT NOT NULL,
      evidence_json TEXT,
      outcome TEXT NOT NULL DEFAULT 'UNKNOWN',
      score REAL NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mentor_lessons_created ON mentor_lessons(created_at DESC)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mentor_lessons_outcome ON mentor_lessons(outcome)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mentor_lessons_job ON mentor_lessons(job_id)`).run();
  }},
  { version: 7, name: 'capability_ecosystem_watch', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS capability_watch_state (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    )`).run();
  }},
  { version: 8, name: 'conversation_focus_and_response_quality', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS conversation_focus_state (
      conversation_id TEXT PRIMARY KEY,
      anchor TEXT NOT NULL DEFAULT '',
      constraints_json TEXT NOT NULL DEFAULT '[]',
      excluded_topics_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_conversation_focus_updated
      ON conversation_focus_state(updated_at DESC)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS mel_response_quality_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      user_excerpt TEXT NOT NULL,
      response_excerpt TEXT NOT NULL,
      focus_json TEXT NOT NULL DEFAULT '{}',
      issues_json TEXT NOT NULL DEFAULT '[]',
      relevance_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_mel_response_quality_events_conversation
      ON mel_response_quality_events(conversation_id, created_at)`).run();
  }},
  { version: 9, name: 'device_runtime_state', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS computer_devices (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      capabilities TEXT NOT NULL,
      allowed_apps TEXT NOT NULL,
      halted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    )`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS computer_commands (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      finished_at INTEGER,
      result_json TEXT,
      error_code TEXT
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_computer_commands_device_status
      ON computer_commands(device_id, status, created_at)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS device_tokens (
      device_id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      revoked_at INTEGER
    )`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS device_pair_codes (
      code_hash TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_device_pair_codes_expiry
      ON device_pair_codes(expires_at)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS device_status (
      device_id TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    )`).run();
  }},
  { version: 10, name: 'knowledge_workspace', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS knowledge_artifacts (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL DEFAULT '',
      filename TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'research',
      category TEXT NOT NULL DEFAULT 'general',
      tags_json TEXT NOT NULL DEFAULT '[]',
      query TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
      sources_json TEXT NOT NULL DEFAULT '[]',
      r2_key TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_artifacts_owner_updated
      ON knowledge_artifacts(owner, updated_at DESC)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_knowledge_artifacts_filename
      ON knowledge_artifacts(filename)`).run();
  }},
  { version: 11, name: 'chatgpt_collector_coverage', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS chatgpt_collector_coverage (
      id TEXT PRIMARY KEY,
      collector_version TEXT,
      deep_discovery_done INTEGER NOT NULL DEFAULT 0,
      discovered_count INTEGER NOT NULL DEFAULT 0,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      manifest_sha256 TEXT NOT NULL DEFAULT '',
      captured_at INTEGER,
      received_at INTEGER NOT NULL
    )`).run();
  }},
  { version: 12, name: 'memory_candidates_runtime_sync', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS memory_candidates (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      content TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at INTEGER NOT NULL,
      UNIQUE(message_id,content)
    )`).run();
  }},
  { version: 13, name: 'oauth_encrypted_runtime_vault', run: async db => {
    await db.prepare(`CREATE TABLE IF NOT EXISTS oauth_transactions (
      owner TEXT NOT NULL,
      connector_id TEXT NOT NULL,
      state_hash TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(owner,connector_id,state_hash)
    )`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_oauth_transactions_expiry
      ON oauth_transactions(expires_at)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS oauth_tokens (
      owner TEXT NOT NULL,
      connector_id TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(owner,connector_id)
    )`).run();
  }},
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
