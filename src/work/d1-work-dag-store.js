import { validateWorkDag, verifyWorkDag } from './work-dag.js';

const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;
const MAX_RECORD_BYTES = 900_000;

function workError(code) {
  return Object.assign(new Error(code), { code });
}

function clean(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return SECRET_VALUE.test(value) ? '[REDACTED]' : value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => clean(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 120)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = clean(item, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 12000);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signForStorage(dag) {
  const unsigned = clean({ ...dag, updated_at: Date.now() });
  delete unsigned.integrity_sha256;
  return { ...unsigned, integrity_sha256: await sha256(stable(unsigned)) };
}

/**
 * Durable store for general-purpose MEL Work DAGs. Each instance is pinned to
 * exactly one DAG id so a caller cannot accidentally read or overwrite another
 * task. The table bootstrap is additive and idempotent for existing D1 databases.
 */
export class D1WorkDagStore {
  constructor(db, dagId) {
    if (!db) throw workError('WORK_DAG_DB_REQUIRED');
    if (!dagId || String(dagId).length > 200) throw workError('WORK_DAG_ID_REQUIRED');
    this.db = db;
    this.dagId = String(dagId);
    this.ready = null;
  }

  async init() {
    if (!this.ready) {
      this.ready = this.db.prepare(`CREATE TABLE IF NOT EXISTS work_dags (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`).run();
    }
    await this.ready;
  }

  async load() {
    await this.init();
    const row = await this.db.prepare('SELECT record_json FROM work_dags WHERE id=?').bind(this.dagId).first();
    if (!row) return null;
    let dag;
    try {
      dag = JSON.parse(row.record_json);
    } catch {
      throw workError('WORK_DAG_STORE_CORRUPT');
    }
    if (dag?.id !== this.dagId) throw workError('WORK_DAG_STORE_ID_MISMATCH');
    await verifyWorkDag(dag);
    return dag;
  }

  async save(dag) {
    await this.init();
    validateWorkDag(dag);
    if (dag.id !== this.dagId) throw workError('WORK_DAG_STORE_ID_MISMATCH');
    const signed = await signForStorage(dag);
    const serialized = JSON.stringify(signed);
    if (new TextEncoder().encode(serialized).length > MAX_RECORD_BYTES) {
      throw workError('WORK_DAG_STORE_RECORD_TOO_LARGE');
    }
    await this.db.prepare(`INSERT INTO work_dags(id,job_id,status,record_json,created_at,updated_at)
      VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET job_id=excluded.job_id,status=excluded.status,record_json=excluded.record_json,updated_at=excluded.updated_at`)
      .bind(signed.id, signed.job_id, signed.status, serialized, Number(signed.created_at || Date.now()), Number(signed.updated_at || Date.now()))
      .run();
    return signed;
  }
}
