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

async function objectJson(object) {
  if (!object) return null;
  if (typeof object.json === 'function') {
    try { return await object.json(); } catch {}
  }
  if (typeof object.text === 'function') {
    try { return parseJson(await object.text(), null); } catch {}
  }
  return null;
}

export class R2GitHubActionRelayStore {
  constructor(bucket, { prefix = 'github-action-relay' } = {}) {
    if (!bucket || typeof bucket.put !== 'function' || typeof bucket.get !== 'function') {
      throw relayError('GITHUB_R2_RELAY_BUCKET_REQUIRED', 503);
    }
    this.bucket = bucket;
    this.prefix = String(prefix || 'github-action-relay').replace(/^\/+|\/+$/g, '');
    this.transport = 'r2-github-actions-relay';
  }

  stateKey() {
    return `${this.prefix}/state.json`;
  }

  jobKey(id) {
    const safe = String(id || '');
    if (!/^gh-relay-[A-Za-z0-9-]+$/.test(safe)) throw relayError('GITHUB_RELAY_JOB_ID_INVALID', 400);
    return `${this.prefix}/jobs/${safe}.json`;
  }

  async heartbeat({ status = 'ONLINE', metadata = {}, now = Date.now() } = {}) {
    const state = {
      status: String(status || 'ONLINE').slice(0, 40),
      last_seen_at: Number(now),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    };
    await this.bucket.put(this.stateKey(), JSON.stringify(state), {
      httpMetadata: { contentType: 'application/json' },
    });
    return this.health({ now });
  }

  async health({ now = Date.now(), onlineWithinMs = 10 * 60 * 1000 } = {}) {
    const row = await objectJson(await this.bucket.get(this.stateKey()));
    const lastSeenAt = Number(row?.last_seen_at || 0);
    const online = Boolean(row && String(row.status || '').toUpperCase() === 'ONLINE' && now - lastSeenAt <= onlineWithinMs);
    return {
      online,
      status: row?.status || 'OFFLINE',
      last_seen_at: lastSeenAt || null,
      metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    };
  }

  async enqueue({ workflow, ref, inputs = {}, id = `gh-relay-${crypto.randomUUID()}`, now = Date.now() } = {}) {
    const row = {
      id,
      status: 'QUEUED',
      workflow: String(workflow || ''),
      ref: String(ref || ''),
      inputs: inputs && typeof inputs === 'object' && !Array.isArray(inputs) ? inputs : {},
      result: null,
      error: null,
      created_at: Number(now),
      updated_at: Number(now),
      claimed_at: null,
      completed_at: null,
    };
    await this.bucket.put(this.jobKey(id), JSON.stringify(row), {
      httpMetadata: { contentType: 'application/json' },
    });
    return structuredClone(row);
  }

  async get(id) {
    const row = await objectJson(await this.bucket.get(this.jobKey(id)));
    return row && typeof row === 'object' ? row : null;
  }
}
