import { DB_SCHEMA_VERSION } from '../core/config.js';

const MAX_SAMPLES = 10;

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

export async function auditDataIntegrity(db) {
  if (!db) throw integrityError('DATA_INTEGRITY_DB_REQUIRED');

  const startedAt = Date.now();
  const tables = await tableNames(db);
  const checks = [];

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

  const orphanSpecs = [
    ['archive_messages.conversation','archive_messages','conversations','conversation_id'],
    ['sync_checkpoints.conversation','sync_checkpoints','conversations','conversation_id'],
    ['sync_checkpoints.device','sync_checkpoints','devices','device_id'],
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

  for (const table of ['conversations','devices','plugins','modules','connectors']) {
    await temporalCheck({ db, tables, checks, id:`${table}.time_order`, table });
  }

  const jsonSpecs = [
    ['conversations.metadata','conversations','metadata',false],
    ['devices.metadata','devices','metadata',false],
    ['archive_messages.attachments_json','archive_messages','attachments_json',true],
    ['archive_messages.capabilities_used_json','archive_messages','capabilities_used_json',true],
    ['memory_candidates.none',null,null,false],
    ['knowledge_artifacts.tags_json','knowledge_artifacts','tags_json',false],
    ['knowledge_artifacts.sources_json','knowledge_artifacts','sources_json',false],
    ['knowledge_artifacts.metadata_json','knowledge_artifacts','metadata_json',false],
  ];
  for (const [id,table,column,nullable] of jsonSpecs) {
    if (!table) continue;
    await jsonCheck({ db, tables, checks, id, table, column, nullable });
  }

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
