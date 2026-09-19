import { requireAuth } from "../core/security.js";
import { createGen2Runtime } from "../core/orchestrator/gen2-runtime.js";

export const WAVESHARE_TERMINAL_MODEL = "waveshare-esp32-s3-touch-lcd-3.5-c";
export const WAVESHARE_TERMINAL_API = "/api/device/v1";
const DOWNLOAD_PREFIX = "devices/waveshare-esp32-s3-touch-lcd-3.5-c/";

function json(value, status = 200, headers = {}) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function base64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bearer(request) {
  const header = request.headers.get("authorization") || "";
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i, "").trim() : "";
}

async function ensureTables(env) {
  if (!env?.DB) throw Object.assign(new Error("DEVICE_DB_REQUIRED"), { status: 503, code: "DEVICE_DB_REQUIRED" });
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS device_tokens (
    device_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
  )`).run();
}

async function registerRuntimeDevice(env, body) {
  try {
    const runtime = createGen2Runtime({ env });
    await runtime.bus.execute("device.register", {
      id: body.device_id,
      owner: env.MELITURGOS_USER || "owner",
      name: body.name || "MEL Terminal",
      kind: "waveshare-terminal",
      metadata: {
        model: WAVESHARE_TERMINAL_MODEL,
        firmware: body.firmware || null,
        capabilities: [
          "display.touch",
          "camera.ov5640",
          "audio.microphone",
          "audio.speaker",
          "imu.qmi8658",
          "rtc.pcf85063",
          "storage.microsd",
          "wifi",
          "bluetooth",
          "download.assets",
          "ota"
        ]
      }
    }, {
      owner: env.MELITURGOS_USER || "owner",
      permissions: env.CAPABILITY_PERMISSIONS || [],
      requestId: crypto.randomUUID()
    });
  } catch {
    // Pairing remains valid even if the optional device registry is unavailable.
  }
}

async function pairDevice(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  await ensureTables(env);

  const body = await request.json().catch(() => ({}));
  const deviceId = String(body.device_id || "").trim();
  if (!deviceId) return json({ ok: false, code: "DEVICE_ID_REQUIRED" }, 400);
  const model = String(body.model || WAVESHARE_TERMINAL_MODEL);
  if (model !== WAVESHARE_TERMINAL_MODEL) return json({ ok: false, code: "MODEL_UNSUPPORTED" }, 400);

  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = base64url(tokenBytes);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();

  await env.DB.prepare(`INSERT INTO device_tokens(device_id,token_hash,model,created_at,last_seen_at,revoked_at)
    VALUES(?,?,?,?,?,NULL)
    ON CONFLICT(device_id) DO UPDATE SET token_hash=excluded.token_hash, model=excluded.model,
      created_at=excluded.created_at, last_seen_at=excluded.last_seen_at, revoked_at=NULL`)
    .bind(deviceId, tokenHash, model, now, now)
    .run();

  await registerRuntimeDevice(env, { ...body, device_id: deviceId });
  return json({
    ok: true,
    device_id: deviceId,
    model,
    token,
    api_base: WAVESHARE_TERMINAL_API,
    note: "Token returned once. Store it in device NVS and discard operator credentials."
  });
}

async function authorizeDevice(request, env) {
  await ensureTables(env);
  const token = bearer(request);
  const deviceId = String(request.headers.get("x-mel-device-id") || "").trim();
  if (!token || !deviceId) return { ok: false, response: json({ ok: false, code: "DEVICE_AUTH_REQUIRED" }, 401) };
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT device_id,model,revoked_at FROM device_tokens WHERE device_id=? AND token_hash=? LIMIT 1")
    .bind(deviceId, tokenHash).first();
  if (!row || row.revoked_at != null) return { ok: false, response: json({ ok: false, code: "DEVICE_AUTH_INVALID" }, 401) };
  await env.DB.prepare("UPDATE device_tokens SET last_seen_at=? WHERE device_id=?").bind(Date.now(), deviceId).run();
  return { ok: true, deviceId, model: row.model };
}

async function loadManifest(env, origin) {
  const key = `${DOWNLOAD_PREFIX}manifest.json`;
  let manifest = null;
  if (env?.MEDIA_BUCKET) {
    try {
      const object = await env.MEDIA_BUCKET.get(key);
      if (object) manifest = JSON.parse(await object.text());
    } catch {
      manifest = null;
    }
  }

  const defaults = {
    model: WAVESHARE_TERMINAL_MODEL,
    channel: "stable",
    firmware: {
      version: String(env.MEL_TERMINAL_FIRMWARE_VERSION || "0.1.0-dev"),
      available: false,
      key: null,
      sha256: null
    },
    assets: {
      version: "1",
      items: []
    }
  };

  const value = manifest && typeof manifest === "object" ? { ...defaults, ...manifest } : defaults;
  value.api_base = `${origin}${WAVESHARE_TERMINAL_API}`;
  value.download_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/download`;
  value.pair_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/pair`;
  value.heartbeat_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/heartbeat`;
  return value;
}

function validDownloadKey(key) {
  return typeof key === "string"
    && key.startsWith(DOWNLOAD_PREFIX)
    && !key.includes("..")
    && key.length < 512;
}

async function serveDownload(request, env, url) {
  if (!env?.MEDIA_BUCKET) return json({ ok: false, code: "MEDIA_BUCKET_UNAVAILABLE" }, 503);
  const key = url.searchParams.get("key") || "";
  if (!validDownloadKey(key)) return json({ ok: false, code: "DOWNLOAD_KEY_INVALID" }, 400);

  if (request.method === "HEAD") {
    const head = await env.MEDIA_BUCKET.head(key);
    if (!head) return new Response(null, { status: 404 });
    const headers = new Headers({
      "content-length": String(head.size),
      "etag": head.httpEtag || head.etag || "",
      "cache-control": "private, max-age=60",
      "x-mel-sha256": String(head.customMetadata?.sha256 || "")
    });
    head.writeHttpMetadata?.(headers);
    return new Response(null, { status: 200, headers });
  }

  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return json({ ok: false, code: "DOWNLOAD_NOT_FOUND" }, 404);
  const headers = new Headers({
    "content-length": String(object.size),
    "etag": object.httpEtag || object.etag || "",
    "cache-control": "private, max-age=60",
    "x-mel-sha256": String(object.customMetadata?.sha256 || "")
  });
  object.writeHttpMetadata?.(headers);
  if (!headers.get("content-type")) headers.set("content-type", "application/octet-stream");
  return new Response(object.body, { status: 200, headers });
}

export async function maybeHandleWaveshareTerminalApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(WAVESHARE_TERMINAL_API + "/")) return null;

  if (url.pathname === WAVESHARE_TERMINAL_API + "/pair" && request.method === "POST") {
    return pairDevice(request, env);
  }

  const auth = await authorizeDevice(request, env);
  if (!auth.ok) return auth.response;

  if (url.pathname === WAVESHARE_TERMINAL_API + "/manifest" && request.method === "GET") {
    return json({ ok: true, device_id: auth.deviceId, ...(await loadManifest(env, url.origin)) });
  }

  if (url.pathname === WAVESHARE_TERMINAL_API + "/heartbeat" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    return json({
      ok: true,
      device_id: auth.deviceId,
      server_time: Date.now(),
      accepted: {
        firmware: body.firmware || null,
        battery: body.battery ?? null,
        wifi_rssi: body.wifi_rssi ?? null,
        free_heap: body.free_heap ?? null
      }
    });
  }

  if (url.pathname === WAVESHARE_TERMINAL_API + "/download" && (request.method === "GET" || request.method === "HEAD")) {
    return serveDownload(request, env, url);
  }

  return json({ ok: false, code: "DEVICE_ROUTE_NOT_FOUND" }, 404);
}
