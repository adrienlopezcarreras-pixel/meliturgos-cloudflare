function relayError(code, status = 500) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}
function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}
function normalizeRow(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    status: String(row.status || ''),
    operation: String(row.operation || ''),
    input: parseJson(row.input_json, {}),
    result: parseJson(row.result_json, null),
    error: row.error || null,
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
    claimed_at: row.claimed_at == null ? null : Number(row.claimed_at),
    completed_at: row.completed_at == null ? null : Number(row.completed_at),
  };
}
export class D1CloudflareApiRelayStore {
  constructor(db) {
    if (!db || typeof db.prepare !== 'function') throw relayError('CLOUDFLARE_RELAY_DB_REQUIRED', 503);
    this.db = db;
    this.ready = null;
    this.transport = 'd1-cloudflare-api-relay';
  }
  async init() {
    if (!this.ready) this.ready = (async () => {
      await this.db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_api_relay_jobs (
        id TEXT PRIMARY KEY,status TEXT NOT NULL,operation TEXT NOT NULL,
        input_json TEXT NOT NULL DEFAULT '{}',result_json TEXT,error TEXT,
        created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,claimed_at INTEGER,completed_at INTEGER
      )`).run();
      await this.db.prepare(`CREATE INDEX IF NOT EXISTS idx_cloudflare_api_relay_jobs_status_created
        ON cloudflare_api_relay_jobs(status, created_at)`).run();
      await this.db.prepare(`CREATE TABLE IF NOT EXISTS cloudflare_api_relay_state (
        id TEXT PRIMARY KEY,status TEXT NOT NULL,last_seen_at INTEGER NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      )`).run();
    })();
    await this.ready;
  }
  async heartbeat({ status='ONLINE', metadata={}, now=Date.now() }={}) {
    await this.init();
    await this.db.prepare(`INSERT INTO cloudflare_api_relay_state(id,status,last_seen_at,metadata_json)
      VALUES('primary',?,?,?)
      ON CONFLICT(id) DO UPDATE SET status=excluded.status,last_seen_at=excluded.last_seen_at,metadata_json=excluded.metadata_json`)
      .bind(String(status).slice(0,40), Number(now), JSON.stringify(metadata||{})).run();
    return this.health({now});
  }
  async health({ now=Date.now(), onlineWithinMs=10*60*1000 }={}) {
    await this.init();
    const row=await this.db.prepare(`SELECT status,last_seen_at,metadata_json FROM cloudflare_api_relay_state WHERE id='primary'`).first();
    const lastSeenAt=Number(row?.last_seen_at||0);
    return {online:Boolean(row && String(row.status).toUpperCase()==='ONLINE' && now-lastSeenAt<=onlineWithinMs),
      status:row?.status||'OFFLINE',last_seen_at:lastSeenAt||null,metadata:parseJson(row?.metadata_json,{})};
  }
  async enqueue({ operation, input={}, id=`cf-relay-${crypto.randomUUID()}`, now=Date.now() }={}) {
    await this.init();
    if (!['workers.list','deployments.list','deployments.create'].includes(String(operation))) throw relayError('CLOUDFLARE_RELAY_OPERATION_NOT_ALLOWED',400);
    await this.db.prepare(`INSERT INTO cloudflare_api_relay_jobs
      (id,status,operation,input_json,result_json,error,created_at,updated_at,claimed_at,completed_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`)
      .bind(id,'QUEUED',String(operation),JSON.stringify(input||{}),null,null,now,now,null,null).run();
    return this.get(id);
  }
  async get(id) {
    await this.init();
    const row=await this.db.prepare('SELECT * FROM cloudflare_api_relay_jobs WHERE id=?').bind(String(id||'')).first();
    return normalizeRow(row);
  }
  async claim({ now=Date.now() }={}) {
    await this.init();
    for(let attempt=0;attempt<3;attempt+=1){
      const row=await this.db.prepare(`SELECT id FROM cloudflare_api_relay_jobs WHERE status='QUEUED' ORDER BY created_at ASC LIMIT 1`).first();
      if(!row?.id)return null;
      await this.db.prepare(`UPDATE cloudflare_api_relay_jobs SET status='CLAIMED',claimed_at=?,updated_at=? WHERE id=? AND status='QUEUED'`)
        .bind(now,now,row.id).run();
      const claimed=await this.get(row.id);
      if(claimed?.status==='CLAIMED')return claimed;
    }
    return null;
  }
  async complete(id,{status,result=null,error=null,now=Date.now()}={}) {
    await this.init();
    const normalized=String(status||'').toUpperCase();
    if(!['COMPLETE','FAILED'].includes(normalized)) throw relayError('CLOUDFLARE_RELAY_RESULT_STATUS_INVALID',400);
    const current=await this.get(id);
    if(!current) throw relayError('CLOUDFLARE_RELAY_JOB_NOT_FOUND',404);
    await this.db.prepare(`UPDATE cloudflare_api_relay_jobs SET status=?,result_json=?,error=?,updated_at=?,completed_at=? WHERE id=?`)
      .bind(normalized,result==null?null:JSON.stringify(result),error?String(error).slice(0,500):null,now,now,String(id)).run();
    return this.get(id);
  }
}
