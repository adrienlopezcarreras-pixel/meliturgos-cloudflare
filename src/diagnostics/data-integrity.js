import { DB_SCHEMA_VERSION } from '../core/config.js';
import { MIGRATIONS } from '../persistence/migrations.js';

const MAX_SAMPLES = 10;
const REQUIRED_TABLE_CONTRACT_VERSION = 12;
const REQUIRED_MIGRATION_TABLES = Object.freeze([
  'schema_migrations',
  'conversations',
  'devices',
  'archive_messages',
  'sync_checkpoints',
  'audit_logs',
  'knowledge_entities',
  'knowledge_relations',
  'timeline_events',
  'automations',
  'automation_runs',
  'backup_objects',
  'dev_jobs',
  'dev_bridge_state',
  'mentor_lessons',
  'capability_watch_state',
  'conversation_focus_state',
  'mel_response_quality_events',
  'computer_devices',
  'computer_commands',
  'device_tokens',
  'device_pair_codes',
  'device_status',
  'knowledge_artifacts',
  'chatgpt_collector_coverage',
  'memory_candidates',
]);

function integrityError(code) {
  return Object.assign(new Error(code), { code });
}

async function tableNames(db) {
  const result = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return new Set((result?.results || []).map(row => String(row.name)));
}

async function countRows(db, sql, binds = []) {
  const row = await db.prepare(sql).bind(...binds).first();
  return Number(row?.n || 0);
}

async function sampleIds(db, sql, binds = []) {
  const result = await db.prepare(sql).bind(...binds).all();
  return (result?.results || []).slice(0, MAX_SAMPLES).map(row => {
    const out = {};
    for (const [key, value] of Object.entries(row || {})) {
      if (value == null) out[key] = null;
      else if (typeof value === 'number') out[key] = value;
      else out[key] = String(value).slice(0, 200);
    }
    return out;
  });
}

function pushCheck(checks, check) {
  checks.push(Object.freeze(check));
}

async function orphanCheck({ db, tables, checks, id, childTable, parentTable, childColumn, parentColumn = 'id' }) {
  if (!tables.has(childTable) || !tables.has(parentTable)) {
    pushCheck(checks, {
      id,
      status: 'SKIPPED',
      reason: 'TABLE_MISSING',
      tables: [childTable, parentTable],
      count: null,
      samples: [],
    });
    return;
  }

  const base = `FROM ${childTable} c LEFT JOIN ${parentTable} p ON c.${childColumn}=p.${parentColumn}
    WHERE c.${childColumn} IS NOT NULL AND c.${childColumn}<>'' AND p.${parentColumn} IS NULL`;
  const count = await countRows(db, `SELECT COUNT(*) n ${base}`);
  const samples = count
    ? await sampleIds(db, `SELECT c.${childColumn} child_ref ${base} LIMIT ${MAX_SAMPLES}`)
    : [];
  pushCheck(checks, {
    id,
    status: count === 0 ? 'PASS' : 'FAIL',
    count,
    samples,
    relation: `${childTable}.${childColumn}->${parentTable}.${parentColumn}`,
  });
}

async function compositeReferenceCheck({ db, tables, checks, id, requiredTables, countSql, sampleSql }) {
  const missing = requiredTables.filter(table => !tables.has(table));
  if (missing.length) {
    pushCheck(checks, { id, status:'SKIPPED', reason:'TABLE_MISSING', tables:missing, count:null, samples:[] });
    return;
  }
  const count = await countRows(db, countSql);
  const samples = count ? await sampleIds(db, sampleSql) : [];
  pushCheck(checks, { id, status:count===0?'PASS':'FAIL', count, samples });
}

async function temporalCheck({ db, tables, checks, id, table, created = 'created_at', updated = 'updated_at' }) {
  if (!tables.has(table)) {
    pushCheck(checks, { id, status:'SKIPPED', reason:'TABLE_MISSING', tables:[table], count:null, samples:[] });
    return;
  }
  const count = await countRows(db, `SELECT COUNT(*) n FROM ${table} WHERE ${created} IS NOT NULL AND ${updated} IS NOT NULL AND ${updated}<${created}`);
  const samples = count
    ? await sampleIds(db, `SELECT id,${created},${updated} FROM ${table} WHERE ${created} IS NOT NULL AND ${updated} IS NOT NULL AND ${updated}<${created} LIMIT ${MAX_SAMPLES}`)
    : [];
  pushCheck(checks, { id, status:count===0?'PASS':'FAIL', count, samples, table });
}

async function jsonCheck({ db, tables, checks, id, table, column, nullable = false }) {
  if (!tables.has(table)) {
    pushCheck(checks, { id, status:'SKIPPED', reason:'TABLE_MISSING', tables:[table], count:null, samples:[] });
    return;
  }
  const predicate = nullable
    ? `${column} IS NOT NULL AND TRIM(${column})<>'' AND json_valid(${column})=0`
    : `json_valid(${column})=0`;
  const count = await countRows(db, `SELECT COUNT(*) n FROM ${table} WHERE ${predicate}`);
  const samples = count
    ? await sampleIds(db, `SELECT id FROM ${table} WHERE ${predicate} LIMIT ${MAX_SAMPLES}`)
    : [];
  pushCheck(checks, { id, status:count===0?'PASS':'FAIL', count, samples, field:`${table}.${column}` });
}

async function valueDomainCheck({ db, tables, checks, id, table, column, allowed }) {
  if (!tables.has(table)) {
    pushCheck(checks, { id, status:'SKIPPED', reason:'TABLE_MISSING', tables:[table], count:null, samples:[] });
    return;
  }
  const placeholders = allowed.map(() => '?').join(',');
  const predicate = `${column} IS NOT NULL AND LOWER(${column}) NOT IN (${placeholders})`;
  const count = await countRows(db, `SELECT COUNT(*) n FROM ${table} WHERE ${predicate}`, allowed.map(value=>String(value).toLowerCase()));
  const samples = count
    ? await sampleIds(db, `SELECT id,${column} value FROM ${table} WHERE ${predicate} LIMIT ${MAX_SAMPLES}`, allowed.map(value=>String(value).toLowerCase()))
    : [];
  pushCheck(checks, { id, status:count===0?'PASS':'FAIL', count, samples, field:`${table}.${column}` });
}

async function numericRangeCheck({ db, tables, checks, id, table, column, min = 0, max = 1 }) {
  if (!tables.has(table)) {
    pushCheck(checks, { id, status:'SKIPPED', reason:'TABLE_MISSING', tables:[table], count:null, samples:[] });
    return;
  }
  const count = await countRows(db, `SELECT COUNT(*) n FROM ${table} WHERE ${column} IS NOT NULL AND (${column}<? OR ${column}>?)`, [min,max]);
  const samples = count
    ? await sampleIds(db, `SELECT id,${column} value FROM ${table} WHERE ${column} IS NOT NULL AND (${column}<? OR ${column}>?) LIMIT ${MAX_SAMPLES}`, [min,max])
    : [];
  pushCheck(checks, { id, status:count===0?'PASS':'FAIL', count, samples, field:`${table}.${column}`, range:[min,max] });
}

export async function auditDataIntegrity(db) {
  if (!db) throw integrityError('DATA_INTEGRITY_DB_REQUIRED');

  const startedAt = Date.now();
  const tables = await tableNames(db);
  const checks = [];

  pushCheck(checks, {
    id:'schema.required_table_contract_version',
    status:DB_SCHEMA_VERSION===REQUIRED_TABLE_CONTRACT_VERSION?'PASS':'FAIL',
    count:DB_SCHEMA_VERSION===REQUIRED_TABLE_CONTRACT_VERSION?0:1,
    expected_schema_version:REQUIRED_TABLE_CONTRACT_VERSION,
    runtime_schema_version:DB_SCHEMA_VERSION,
    reason:DB_SCHEMA_VERSION===REQUIRED_TABLE_CONTRACT_VERSION?null:'INTEGRITY_TABLE_CONTRACT_REVIEW_REQUIRED',
    samples:[],
  });

  const missingRequiredTables = REQUIRED_MIGRATION_TABLES.filter(name => !tables.has(name));
  pushCheck(checks, {
    id:'schema.required_tables',
    status:missingRequiredTables.length===0?'PASS':'FAIL',
    count:missingRequiredTables.length,
    samples:missingRequiredTables.slice(0,MAX_SAMPLES).map(table=>({table})),
    expected_count:REQUIRED_MIGRATION_TABLES.length,
  });

  if (!tables.has('schema_migrations')) {
    pushCheck(checks, {
      id:'schema.version',
      status:'FAIL',
      count:1,
      expected:DB_SCHEMA_VERSION,
      actual:null,
      reason:'SCHEMA_MIGRATIONS_MISSING',
      samples:[],
    });
  } else {
    const row = await db.prepare('SELECT MAX(version) version FROM schema_migrations').first();
    const actual = Number(row?.version || 0);
    pushCheck(checks, {
      id:'schema.version',
      status:actual===DB_SCHEMA_VERSION?'PASS':'FAIL',
      count:actual===DB_SCHEMA_VERSION?0:1,
      expected:DB_SCHEMA_VERSION,
      actual,
      samples:[],
    });
  }

  if (tables.has('schema_migrations')) {
    const result = await db.prepare('SELECT version,name FROM schema_migrations ORDER BY version ASC').all();
    const applied = (result?.results || []).map(row => ({
      version:Number(row.version),
      name:String(row.name || ''),
    }));
    const expected = MIGRATIONS
      .filter(migration => migration.version <= DB_SCHEMA_VERSION)
      .map(migration => ({ version:Number(migration.version), name:String(migration.name || '') }));
    const expectedMap = new Map(expected.map(row => [row.version,row.name]));
    const appliedMap = new Map(applied.map(row => [row.version,row.name]));
    const mismatches = [];
    for (const row of expected) {
      if (!appliedMap.has(row.version)) mismatches.push({version:row.version,issue:'MISSING',expected_name:row.name});
      else if (appliedMap.get(row.version) !== row.name) mismatches.push({
        version:row.version,
        issue:'NAME_MISMATCH',
        expected_name:row.name,
        actual_name:appliedMap.get(row.version),
      });
    }
    for (const row of applied) {
      if (row.version <= DB_SCHEMA_VERSION && !expectedMap.has(row.version)) {
        mismatches.push({version:row.version,issue:'UNEXPECTED_VERSION',actual_name:row.name});
      }
    }
    pushCheck(checks, {
      id:'schema.migration_history',
      status:mismatches.length===0?'PASS':'FAIL',
      count:mismatches.length,
      expected_count:expected.length,
      applied_count:applied.length,
      samples:mismatches.slice(0,MAX_SAMPLES),
    });
  } else {
    pushCheck(checks, {
      id:'schema.migration_history',
      status:'FAIL',
      count:1,
      reason:'SCHEMA_MIGRATIONS_MISSING',
      samples:[],
    });
  }

  const orphanSpecs = [
    ['archive_messages.conversation','archive_messages','conversations','conversation_id'],
    ['sync_checkpoints.conversation','sync_checkpoints','conversations','conversation_id'],
    ['memory_candidates.conversation','memory_candidates','conversations','conversation_id'],
    ['memory_candidates.message','memory_candidates','archive_messages','message_id'],
    ['plugin_versions.plugin','plugin_versions','plugins','plugin_id'],
    ['module_versions.module','module_versions','modules','module_id'],
    ['module_runs.module','module_runs','modules','module_id'],
    ['connector_states.connector','connector_states','connectors','connector_id'],
    ['agent_runs.agent','agent_runs','agents','agent_id'],
    ['automation_runs.automation','automation_runs','automations','automation_id'],
  ];
  for (const [id,childTable,parentTable,childColumn] of orphanSpecs) {
    await orphanCheck({ db, tables, checks, id, childTable, parentTable, childColumn });
  }

  await compositeReferenceCheck({
    db, tables, checks,
    id:'memory_candidates.message_conversation_pair',
    requiredTables:['memory_candidates','archive_messages'],
    countSql:`SELECT COUNT(*) n
      FROM memory_candidates c
      JOIN archive_messages a ON a.id=c.message_id
      WHERE a.conversation_id<>c.conversation_id`,
    sampleSql:`SELECT c.id candidate_id,c.conversation_id candidate_conversation,a.conversation_id message_conversation
      FROM memory_candidates c
      JOIN archive_messages a ON a.id=c.message_id
      WHERE a.conversation_id<>c.conversation_id
      LIMIT ${MAX_SAMPLES}`,
  });

  await compositeReferenceCheck({
    db, tables, checks,
    id:'sync_checkpoints.message_conversation_pair',
    requiredTables:['sync_checkpoints','archive_messages'],
    countSql:`SELECT COUNT(*) n
      FROM sync_checkpoints s
      LEFT JOIN archive_messages a
        ON a.id=s.last_message_id AND a.conversation_id=s.conversation_id
      WHERE a.id IS NULL`,
    sampleSql:`SELECT s.device_id,s.conversation_id,s.last_message_id
      FROM sync_checkpoints s
      LEFT JOIN archive_messages a
        ON a.id=s.last_message_id AND a.conversation_id=s.conversation_id
      WHERE a.id IS NULL
      LIMIT ${MAX_SAMPLES}`,
  });

  for (const table of ['conversations','devices','plugins','modules','connectors']) {
    await temporalCheck({ db, tables, checks, id:`${table}.time_order`, table });
  }

  const jsonSpecs = [
    ['conversations.metadata','conversations','metadata',false],
    ['devices.metadata','devices','metadata',false],
    ['archive_messages.attachments_json','archive_messages','attachments_json',true],
    ['archive_messages.capabilities_used_json','archive_messages','capabilities_used_json',true],
    ['archive_messages.metadata','archive_messages','metadata',false],
    ['audit_logs.details_json','audit_logs','details_json',false],
    ['backup_objects.metadata_json','backup_objects','metadata_json',false],
    ['mentor_lessons.evidence_json','mentor_lessons','evidence_json',true],
    ['mentor_lessons.tags_json','mentor_lessons','tags_json',false],
    ['capability_watch_state.state_json','capability_watch_state','state_json',false],
    ['conversation_focus_state.constraints_json','conversation_focus_state','constraints_json',false],
    ['conversation_focus_state.excluded_topics_json','conversation_focus_state','excluded_topics_json',false],
    ['mel_response_quality_events.focus_json','mel_response_quality_events','focus_json',false],
    ['mel_response_quality_events.issues_json','mel_response_quality_events','issues_json',false],
    ['mel_response_quality_events.relevance_json','mel_response_quality_events','relevance_json',false],
    ['chatgpt_collector_coverage.manifest_json','chatgpt_collector_coverage','manifest_json',false],
    ['knowledge_artifacts.tags_json','knowledge_artifacts','tags_json',false],
    ['knowledge_artifacts.sources_json','knowledge_artifacts','sources_json',false],
    ['knowledge_artifacts.metadata_json','knowledge_artifacts','metadata_json',false],
  ];
  for (const [id,table,column,nullable] of jsonSpecs) {
    if (!table) continue;
    await jsonCheck({ db, tables, checks, id, table, column, nullable });
  }

  await valueDomainCheck({
    db, tables, checks,
    id:'archive_messages.role',
    table:'archive_messages',
    column:'role',
    allowed:['user','assistant','system','tool'],
  });

  await numericRangeCheck({
    db, tables, checks,
    id:'memory_candidates.confidence',
    table:'memory_candidates',
    column:'confidence',
    min:0,
    max:1,
  });

  const failed = checks.filter(check => check.status === 'FAIL');
  const skipped = checks.filter(check => check.status === 'SKIPPED');
  const passed = checks.filter(check => check.status === 'PASS');

  return {
    schema:'mel.data-integrity-audit',
    version:1,
    ok:failed.length===0,
    state:failed.length ? 'FAIL' : skipped.length ? 'PARTIAL' : 'PASS',
    generated_at:new Date().toISOString(),
    duration_ms:Math.max(0,Date.now()-startedAt),
    database:{
      expected_schema_version:DB_SCHEMA_VERSION,
      discovered_table_count:tables.size,
    },
    summary:{
      total:checks.length,
      passed:passed.length,
      failed:failed.length,
      skipped:skipped.length,
      anomaly_count:failed.reduce((sum,check)=>sum+Math.max(1,Number(check.count)||0),0),
    },
    checks,
  };
}
