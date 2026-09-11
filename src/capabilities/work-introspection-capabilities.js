const ALLOWED_STATUS = new Set(['RUNNING', 'WAITING', 'COMPLETED', 'BLOCKED']);

function workError(code) {
  return Object.assign(new Error(code), { code });
}

async function ensureWorkTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS work_dags (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    status TEXT NOT NULL,
    record_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`).run();
}

export function sanitizeWorkIndexRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).slice(0, 100).map(row => ({
    id: String(row?.id || '').slice(0, 200),
    job_id: String(row?.job_id || '').slice(0, 200),
    status: ALLOWED_STATUS.has(String(row?.status || '').toUpperCase()) ? String(row.status).toUpperCase() : 'UNKNOWN',
    created_at: Number(row?.created_at || 0) || null,
    updated_at: Number(row?.updated_at || 0) || null,
  })).filter(row => row.id);
}

export async function listPersistentWork(db, { limit = 20, status = null, openOnly = false } = {}) {
  if (!db) throw workError('WORK_DAG_DB_REQUIRED');
  await ensureWorkTable(db);
  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const requestedStatus = status ? String(status).toUpperCase() : null;
  if (requestedStatus && !ALLOWED_STATUS.has(requestedStatus)) throw workError('WORK_STATUS_INVALID');

  let sql = 'SELECT id,job_id,status,created_at,updated_at FROM work_dags';
  const values = [];
  if (openOnly) {
    sql += ` WHERE status IN ('RUNNING','WAITING')`;
  } else if (requestedStatus) {
    sql += ' WHERE status=?';
    values.push(requestedStatus);
  }
  sql += ' ORDER BY updated_at DESC LIMIT ?';
  values.push(boundedLimit);
  const statement = db.prepare(sql);
  const result = values.length ? await statement.bind(...values).all() : await statement.all();
  const work = sanitizeWorkIndexRows(result?.results || []);
  return {
    ok: true,
    open_only: Boolean(openOnly),
    filter_status: requestedStatus,
    count: work.length,
    work,
  };
}

export function registerWorkIntrospectionCapabilities(bus, env = {}) {
  const health = env.DB ? 'HEALTHY' : 'DEGRADED';
  const listSchema = {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      status: { type: 'string', enum: ['RUNNING', 'WAITING', 'COMPLETED', 'BLOCKED'] },
    },
    additionalProperties: false,
  };

  bus.discover({
    id: 'work.list',
    name: 'Lister les travaux persistants',
    category: 'work',
    version: '1.0.0',
    provider: 'mel',
    description: 'Lists only bounded Work DAG metadata so MEL can rediscover tasks after a restart without exposing payloads or secrets.',
    input_schema: listSchema,
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health,
    enabled: true,
  }, input => listPersistentWork(env.DB, { limit: input.limit, status: input.status }));

  bus.discover({
    id: 'work.open',
    name: 'Travaux ouverts à reprendre',
    category: 'work',
    version: '1.0.0',
    provider: 'mel',
    description: 'Returns RUNNING and WAITING persistent jobs ordered by most recent checkpoint so MEL can resume open loops after a restart.',
    input_schema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false },
    output_schema: { type: 'object', additionalProperties: true },
    risk: 'LOW',
    permissions: [],
    health,
    enabled: true,
  }, input => listPersistentWork(env.DB, { limit: input.limit, openOnly: true }));

  return bus;
}
