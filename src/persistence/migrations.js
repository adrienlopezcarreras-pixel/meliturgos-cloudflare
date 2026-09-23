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
  { version: 13, name: 'gen1_interactions_archive_backfill', run: async db => {
    const auditId = 'gen1-interactions-v1';
    const provenance = 'legacy_gen1_interactions';
    await db.prepare(`CREATE TABLE IF NOT EXISTS legacy_migration_audit (
      id TEXT PRIMARY KEY,
      source_table TEXT NOT NULL,
      source_exists INTEGER NOT NULL,
      source_rows INTEGER NOT NULL,
      expected_messages INTEGER NOT NULL,
      migrated_messages INTEGER NOT NULL,
      verified INTEGER NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      verified_at INTEGER NOT NULL
    )`).run();

    const source = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='interactions' LIMIT 1"
    ).first();

    if (!source) {
      await db.prepare(`INSERT INTO legacy_migration_audit(
        id,source_table,source_exists,source_rows,expected_messages,migrated_messages,verified,details_json,verified_at
      ) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        source_exists=excluded.source_exists,
        source_rows=excluded.source_rows,
        expected_messages=excluded.expected_messages,
        migrated_messages=excluded.migrated_messages,
        verified=excluded.verified,
        details_json=excluded.details_json,
        verified_at=excluded.verified_at`)
        .bind(auditId,'interactions',0,0,0,0,1,JSON.stringify({reason:'SOURCE_TABLE_ABSENT',non_destructive:true}),Date.now())
        .run();
      return;
    }

    const columns = await db.prepare("PRAGMA table_info(interactions)").all();
    const names = new Set((columns.results || []).map(row => String(row.name || '')));
    const required = ['id','created_at','user_text','assistant_text','model','feedback','correction'];
    const missing = required.filter(name => !names.has(name));
    if (missing.length) {
      const error = new Error('LEGACY_INTERACTIONS_SCHEMA_MISMATCH:' + missing.join(','));
      error.code = 'LEGACY_INTERACTIONS_SCHEMA_MISMATCH';
      throw error;
    }

    const countRow = await db.prepare("SELECT COUNT(*) AS count FROM interactions").first();
    const sourceRows = Number(countRow?.count || 0);
    const expectedMessages = sourceRows * 2;

    const collision = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM archive_messages a
      JOIN interactions i
        ON a.id = ('legacy-gen1-' || i.id || '-user')
        OR a.id = ('legacy-gen1-' || i.id || '-assistant')
      WHERE a.provenance <> ?
    `).bind(provenance).first();
    if (Number(collision?.count || 0) > 0) {
      const error = new Error('LEGACY_ARCHIVE_ID_COLLISION');
      error.code = 'LEGACY_ARCHIVE_ID_COLLISION';
      throw error;
    }

    await db.prepare(`
      INSERT OR IGNORE INTO conversations(id,owner,title,status,created_at,updated_at,metadata)
      SELECT
        'legacy-gen1-' || id,
        '',
        'Gen1 interaction #' || id,
        'archived',
        created_at,
        created_at + 1,
        json_object(
          'migration','GEN2-57',
          'legacy_interaction_id',id,
          'source_table','interactions'
        )
      FROM interactions
    `).run();

    await db.prepare(`
      INSERT OR IGNORE INTO archive_messages(
        id,conversation_id,device_id,role,content,attachments_json,model,
        capabilities_used_json,system_prompt_version,timestamp,provenance,metadata
      )
      SELECT
        'legacy-gen1-' || id || '-user',
        'legacy-gen1-' || id,
        NULL,
        'user',
        user_text,
        NULL,
        NULL,
        NULL,
        NULL,
        created_at,
        ?,
        json_object(
          'migration','GEN2-57',
          'legacy_interaction_id',id,
          'legacy_created_at',created_at,
          'source_table','interactions'
        )
      FROM interactions
    `).bind(provenance).run();

    await db.prepare(`
      INSERT OR IGNORE INTO archive_messages(
        id,conversation_id,device_id,role,content,attachments_json,model,
        capabilities_used_json,system_prompt_version,timestamp,provenance,metadata
      )
      SELECT
        'legacy-gen1-' || id || '-assistant',
        'legacy-gen1-' || id,
        NULL,
        'assistant',
        assistant_text,
        NULL,
        model,
        NULL,
        NULL,
        created_at + 1,
        ?,
        json_object(
          'migration','GEN2-57',
          'legacy_interaction_id',id,
          'legacy_created_at',created_at,
          'feedback',feedback,
          'correction',correction,
          'source_table','interactions'
        )
      FROM interactions
    `).bind(provenance).run();

    const migratedRow = await db.prepare(
      "SELECT COUNT(*) AS count FROM archive_messages WHERE provenance=?"
    ).bind(provenance).first();
    const migratedMessages = Number(migratedRow?.count || 0);

    const mismatch = await db.prepare(`
      SELECT COUNT(*) AS count
      FROM interactions i
      LEFT JOIN archive_messages u ON u.id=('legacy-gen1-' || i.id || '-user')
      LEFT JOIN archive_messages a ON a.id=('legacy-gen1-' || i.id || '-assistant')
      WHERE u.id IS NULL
         OR a.id IS NULL
         OR u.content <> i.user_text
         OR a.content <> i.assistant_text
         OR COALESCE(a.model,'') <> COALESCE(i.model,'')
         OR u.timestamp <> i.created_at
         OR a.timestamp <> i.created_at + 1
         OR u.provenance <> ?
         OR a.provenance <> ?
    `).bind(provenance,provenance).first();

    if (Number(mismatch?.count || 0) > 0 || migratedMessages !== expectedMessages) {
      const error = new Error('LEGACY_INTERACTIONS_BACKFILL_VERIFY_FAILED');
      error.code = 'LEGACY_INTERACTIONS_BACKFILL_VERIFY_FAILED';
      throw error;
    }

    await db.prepare(`INSERT INTO legacy_migration_audit(
      id,source_table,source_exists,source_rows,expected_messages,migrated_messages,verified,details_json,verified_at
    ) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      source_exists=excluded.source_exists,
      source_rows=excluded.source_rows,
      expected_messages=excluded.expected_messages,
      migrated_messages=excluded.migrated_messages,
      verified=excluded.verified,
      details_json=excluded.details_json,
      verified_at=excluded.verified_at`)
      .bind(
        auditId,
        'interactions',
        1,
        sourceRows,
        expectedMessages,
        migratedMessages,
        1,
        JSON.stringify({non_destructive:true,source_preserved:true,provenance}),
        Date.now()
      )
      .run();
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
