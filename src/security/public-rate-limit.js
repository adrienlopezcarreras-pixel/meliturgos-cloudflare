const memoryBuckets = new Map();
let schemaReady = null;

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

async function digestKey(value) {
  const bytes = new TextEncoder().encode(String(value));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let binary = '';
  for (const byte of hash) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '').slice(0, 32);
}

function clientIdentity(request) {
  const ip = clean(request?.headers?.get?.('cf-connecting-ip') || request?.headers?.get?.('x-forwarded-for') || '', 120);
  const agent = clean(request?.headers?.get?.('user-agent') || '', 240);
  return ip || agent || 'anonymous';
}

async function ensureSchema(db) {
  if (!db?.prepare) return false;
  if (!schemaReady) {
    schemaReady = db.prepare(`CREATE TABLE IF NOT EXISTS public_rate_limits (
      key TEXT PRIMARY KEY,
      window_started INTEGER NOT NULL,
      count INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return true;
}

function memoryLimit(key, now, limit, windowMs) {
  const row = memoryBuckets.get(key);
  if (!row || now - row.window_started >= windowMs) {
    memoryBuckets.set(key, { window_started: now, count: 1 });
    return { count: 1, window_started: now };
  }
  row.count += 1;
  return row;
}

export async function enforcePublicRateLimit(request, env = {}, {
  scope = 'public',
  limit = 20,
  windowMs = 60_000,
} = {}) {
  const boundedLimit = Math.max(1, Math.min(300, Number(limit) || 20));
  const boundedWindow = Math.max(10_000, Math.min(60 * 60_000, Number(windowMs) || 60_000));
  const now = Date.now();
  const identity = await digestKey(scope + '|' + clientIdentity(request));
  const key = clean(scope, 80) + ':' + identity;
  let row;

  if (env?.DB?.prepare) {
    try {
      await ensureSchema(env.DB);
      const resetBefore = now - boundedWindow;
      await env.DB.prepare(`INSERT INTO public_rate_limits(key,window_started,count,updated_at)
        VALUES(?,?,1,?)
        ON CONFLICT(key) DO UPDATE SET
          count=CASE WHEN public_rate_limits.window_started<=? THEN 1 ELSE public_rate_limits.count+1 END,
          window_started=CASE WHEN public_rate_limits.window_started<=? THEN excluded.window_started ELSE public_rate_limits.window_started END,
          updated_at=excluded.updated_at`)
        .bind(key, now, now, resetBefore, resetBefore)
        .run();
      row = await env.DB.prepare('SELECT window_started,count FROM public_rate_limits WHERE key=? LIMIT 1')
        .bind(key).first();
    } catch {
      row = memoryLimit(key, now, boundedLimit, boundedWindow);
    }
  } else {
    row = memoryLimit(key, now, boundedLimit, boundedWindow);
  }

  const count = Math.max(1, Number(row?.count) || 1);
  const windowStarted = Number(row?.window_started) || now;
  const retryAfterSeconds = Math.max(1, Math.ceil((boundedWindow - Math.max(0, now - windowStarted)) / 1000));
  return {
    ok: count <= boundedLimit,
    code: count <= boundedLimit ? 'PUBLIC_RATE_LIMIT_OK' : 'PUBLIC_RATE_LIMITED',
    status: count <= boundedLimit ? 200 : 429,
    limit: boundedLimit,
    count,
    retry_after_seconds: retryAfterSeconds,
  };
}
