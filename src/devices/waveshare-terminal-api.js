import { requireAuth } from "../core/security.js";
import { createGen2Runtime } from "../core/orchestrator/gen2-runtime.js";
import { handleNativeChat } from "../api/native-chat.js";
import { handleVoiceTranscription } from "../api/voice-transcribe.js";

export const WAVESHARE_TERMINAL_MODEL = "waveshare-esp32-s3-touch-lcd-3.5-c";
export const WAVESHARE_TERMINAL_API = "/api/device/v1";
export const WAVESHARE_TERMINAL_PROTOCOL = "1.0";
export const WAVESHARE_TERMINAL_CAPABILITIES = Object.freeze([
  "display.touch",
  "camera.ov5640",
  "audio.microphone",
  "audio.speaker",
  "storage.internal",
  "wifi",
  "chat",
  "voice.stt",
  "voice.reply",
  "download.assets",
  "ota"
]);
const DOWNLOAD_PREFIX = "devices/waveshare-esp32-s3-touch-lcd-3.5-c/";
const OWNER_PAIR_CODE_PATH = "/api/device/v1/pair-code";
const OWNER_STATUS_PATH = "/api/device/v1/status";
const OWNER_SETUP_SCRIPT_PATH = "/api/device/v1/setup-script";
const PAIR_TTL_MS = 10 * 60 * 1000;

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });
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

function pairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
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
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS device_pair_codes (
    code_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS device_status (
    device_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  )`).run();
}

async function registerRuntimeDevice(env, body) {
  try {
    const runtime = createGen2Runtime({ env });
    await runtime.bus.execute("device.register", {
      id: body.device_id,
      owner: env.MELITURGOS_USER || "owner",
      name: body.name || "MINI",
      kind: "waveshare-terminal",
      metadata: {
        model: WAVESHARE_TERMINAL_MODEL,
        firmware: body.firmware || null,
        capabilities: [...WAVESHARE_TERMINAL_CAPABILITIES]
      }
    }, {
      owner: env.MELITURGOS_USER || "owner",
      permissions: env.CAPABILITY_PERMISSIONS || [],
      requestId: crypto.randomUUID()
    });
  } catch {
    // Device pairing remains usable even if the optional registry is unavailable.
  }
}

async function createPairCode(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  await ensureTables(env);
  const code = pairCode();
  const now = Date.now();
  await env.DB.prepare("DELETE FROM device_pair_codes WHERE expires_at < ? OR used_at IS NOT NULL").bind(now).run();
  await env.DB.prepare("INSERT INTO device_pair_codes(code_hash,created_at,expires_at,used_at) VALUES(?,?,?,NULL)")
    .bind(await sha256Hex(code), now, now + PAIR_TTL_MS).run();
  return json({ ok: true, code, expires_at: now + PAIR_TTL_MS, ttl_seconds: PAIR_TTL_MS / 1000 });
}

async function consumePairCode(env, code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return false;
  const hash = await sha256Hex(normalized);
  const now = Date.now();
  const row = await env.DB.prepare("SELECT code_hash FROM device_pair_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1")
    .bind(hash, now).first();
  if (!row) return false;
  await env.DB.prepare("UPDATE device_pair_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL").bind(now, hash).run();
  return true;
}

async function authorizeAndroidBridge(request, env) {
  const androidDeviceId = String(request.headers.get("x-mel-android-device-id") || "").trim();
  const androidToken = String(request.headers.get("x-mel-android-token") || "").trim();
  if (!androidDeviceId || !androidToken || !env?.DB) return false;
  try {
    const tokenHash = await sha256Hex(androidToken);
    const row = await env.DB.prepare("SELECT device_id,revoked_at FROM android_device_tokens WHERE device_id=? AND token_hash=? LIMIT 1")
      .bind(androidDeviceId, tokenHash).first();
    if (!row || row.revoked_at != null) return false;
    await env.DB.prepare("UPDATE android_device_tokens SET last_seen_at=? WHERE device_id=?")
      .bind(Date.now(), androidDeviceId).run();
    return true;
  } catch {
    return false;
  }
}

async function issueDeviceToken(env, body) {
  const deviceId = String(body.device_id || "").trim().slice(0, 200);
  if (!deviceId) return json({ ok: false, code: "DEVICE_ID_REQUIRED" }, 400);
  const model = String(body.model || WAVESHARE_TERMINAL_MODEL);
  if (model !== WAVESHARE_TERMINAL_MODEL) return json({ ok: false, code: "MODEL_UNSUPPORTED" }, 400);
  const protocolVersion = String(body.protocol_version || WAVESHARE_TERMINAL_PROTOCOL);
  if (protocolVersion !== WAVESHARE_TERMINAL_PROTOCOL) return json({ ok: false, code: "PROTOCOL_UNSUPPORTED", supported: WAVESHARE_TERMINAL_PROTOCOL }, 426);

  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = base64url(tokenBytes);
  const tokenHash = await sha256Hex(token);
  const now = Date.now();

  await env.DB.prepare(`INSERT INTO device_tokens(device_id,token_hash,model,created_at,last_seen_at,revoked_at)
    VALUES(?,?,?,?,?,NULL)
    ON CONFLICT(device_id) DO UPDATE SET token_hash=excluded.token_hash, model=excluded.model,
      created_at=excluded.created_at, last_seen_at=excluded.last_seen_at, revoked_at=NULL`)
    .bind(deviceId, tokenHash, model, now, now).run();

  await env.DB.prepare(`INSERT INTO device_status(device_id,payload_json,updated_at) VALUES(?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
    .bind(deviceId, JSON.stringify({
      name: body.name || "MINI",
      firmware: body.firmware || null,
      phase: "PAIRED",
      protocol_version: protocolVersion
    }), now).run();

  await registerRuntimeDevice(env, { ...body, device_id: deviceId });
  return json({
    ok: true,
    device_id: deviceId,
    model,
    protocol_version: WAVESHARE_TERMINAL_PROTOCOL,
    token,
    api_base: WAVESHARE_TERMINAL_API,
    note: "Store the token in NVS. Pair codes and operator credentials must not be retained."
  });
}

async function pairDevice(request, env) {
  const body = await request.json().catch(() => ({}));

  // A previously paired Android companion may securely sponsor its attached MINI.
  // This lets a restored MINI recover its own device token without requiring the
  // user to type a fresh pair code on the physical screen.
  if (await authorizeAndroidBridge(request, env)) {
    await ensureTables(env);
    return issueDeviceToken(env, body);
  }

  if (body.pair_code) {
    await ensureTables(env);
    const valid = await consumePairCode(env, body.pair_code);
    if (!valid) return json({ ok: false, code: "PAIR_CODE_INVALID_OR_EXPIRED" }, 401);
    return issueDeviceToken(env, body);
  }
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  await ensureTables(env);
  return issueDeviceToken(env, body);
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

async function ownerStatus(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  await ensureTables(env);
  const rows = await env.DB.prepare(`SELECT t.device_id,t.model,t.created_at,t.last_seen_at,t.revoked_at,
    s.payload_json,s.updated_at FROM device_tokens t LEFT JOIN device_status s ON s.device_id=t.device_id
    ORDER BY t.last_seen_at DESC LIMIT 20`).all();
  const now = Date.now();
  const devices = (rows.results || []).map((row) => ({
    device_id: row.device_id,
    model: row.model,
    paired_at: Number(row.created_at || 0),
    last_seen_at: Number(row.last_seen_at || 0),
    online: row.revoked_at == null && now - Number(row.last_seen_at || 0) < 30000,
    revoked: row.revoked_at != null,
    status: (() => { try { return JSON.parse(row.payload_json || "{}"); } catch { return {}; } })()
  }));
  return json({ ok: true, model: WAVESHARE_TERMINAL_MODEL, devices });
}

async function updateHeartbeat(request, env, auth) {
  const body = await request.json().catch(() => ({}));
  const now = Date.now();
  const status = {
    firmware: body.firmware || null,
    protocol_version: body.protocol_version || null,
    battery: body.battery ?? null,
    wifi_rssi: body.wifi_rssi ?? null,
    free_heap: body.free_heap ?? null,
    ip: body.ip || null,
    uptime_ms: body.uptime_ms ?? null,
    camera: body.camera ?? null,
    microphone: body.microphone ?? null,
    speaker: body.speaker ?? null,
    sdcard: body.sdcard ?? null,
    internal_storage: body.internal_storage ?? null,
    storage_total_bytes: body.storage_total_bytes ?? null,
    storage_free_bytes: body.storage_free_bytes ?? null,
    phase: body.phase || "ONLINE"
  };
  await env.DB.prepare(`INSERT INTO device_status(device_id,payload_json,updated_at) VALUES(?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET payload_json=excluded.payload_json, updated_at=excluded.updated_at`)
    .bind(auth.deviceId, JSON.stringify(status), now).run();
  return json({ ok: true, device_id: auth.deviceId, server_time: now, accepted: status });
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
    protocol_version: WAVESHARE_TERMINAL_PROTOCOL,
    channel: "stable",
    firmware: {
      version: String(env.MEL_TERMINAL_FIRMWARE_VERSION || "0.1.0-dev"),
      available: false,
      key: null,
      sha256: null
    },
    installer: {
      available: false,
      key: null,
      sha256: null
    },
    assets: { version: "1", items: [] }
  };
  const value = manifest && typeof manifest === "object" ? { ...defaults, ...manifest } : defaults;
  value.api_base = `${origin}${WAVESHARE_TERMINAL_API}`;
  value.download_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/download`;
  value.pair_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/pair`;
  value.heartbeat_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/heartbeat`;
  value.chat_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/chat`;
  value.voice_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/voice/transcribe`;
  value.tts_endpoint = `${origin}${WAVESHARE_TERMINAL_API}/voice/tts`;
  return value;
}

function validDownloadKey(key) {
  return typeof key === "string" && key.startsWith(DOWNLOAD_PREFIX) && !key.includes("..") && key.length < 512;
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

async function ownerFirmwareInfo(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  return json({ ok: true, ...(await loadManifest(env, new URL(request.url).origin)) });
}

async function ownerFirmware(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const manifest = await loadManifest(env, new URL(request.url).origin);

  // USB installation needs the merged image (bootloader + partitions + app).
  // OTA deliberately uses manifest.firmware.key, which must be app-only.
  const installer = manifest?.installer?.available === true ? manifest.installer : manifest?.firmware;
  const key = String(installer?.key || "");
  if (installer?.available !== true || !validDownloadKey(key)) {
    return json({ ok: false, code: "FIRMWARE_NOT_PUBLISHED" }, 404);
  }
  if (!env?.MEDIA_BUCKET) return json({ ok: false, code: "MEDIA_BUCKET_UNAVAILABLE" }, 503);
  const object = await env.MEDIA_BUCKET.get(key);
  if (!object) return json({ ok: false, code: "FIRMWARE_NOT_FOUND" }, 404);
  const headers = new Headers({
    "content-type": "application/octet-stream",
    "content-length": String(object.size),
    "content-disposition": 'attachment; filename="mini-first-install.bin"',
    "cache-control": "no-store",
    "x-mel-sha256": String(installer?.sha256 || object.customMetadata?.sha256 || "")
  });
  return new Response(object.body, { status: 200, headers });
}

async function serveSetupScript(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!env?.ASSETS?.fetch) return json({ ok: false, code: "ASSETS_BINDING_UNAVAILABLE" }, 503);
  const target = new URL("/MEL-Waveshare-Flash.ps1", request.url);
  const response = await env.ASSETS.fetch(new Request(target.toString(), { method: "GET" }));
  if (!response.ok) return json({ ok: false, code: "FLASH_SCRIPT_NOT_FOUND" }, 404);
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("content-disposition", 'attachment; filename="MEL-Waveshare-Flash.ps1"');
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: 200, headers });
}

async function deviceChat(request, env, auth) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || body.message || "").trim();
  if (!text) return json({ ok: false, code: "MESSAGE_REQUIRED" }, 400);
  const internal = new Request(new URL("/api/chat", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      device_id: auth.deviceId,
      conversation_id: body.conversation_id || `terminal-${auth.deviceId}`,
      ui_theme: body.ui_theme || "default",
      parallel: body.parallel === true
    })
  });
  return handleNativeChat(internal, env, { authorized: true, source: "waveshare-terminal", device_id: auth.deviceId });
}

async function deviceVoice(request, env, auth) {
  const bytes = await request.arrayBuffer();
  const internal = new Request(new URL("/api/voice/transcribe", request.url), {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") || "application/octet-stream" },
    body: bytes
  });
  const response = await handleVoiceTranscription(internal, env, { authorized: true, source: "waveshare-terminal", device_id: auth.deviceId });
  return response || json({ ok: false, code: "TRANSCRIPTION_UNAVAILABLE" }, 503);
}


async function deviceTts(request, env, auth) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "").trim().slice(0, 1200);
  if (!text) return json({ ok: false, code: "TEXT_REQUIRED" }, 400);
  if (!env?.AI || typeof env.AI.run !== "function") {
    return json({ ok: false, code: "TTS_UNAVAILABLE", reason: "AI_BINDING_MISSING" }, 503);
  }

  const speaker = String(body.speaker || "luna").trim().slice(0, 32) || "luna";
  const model = String(env.MEL_TTS_MODEL || "@cf/deepgram/aura-1");

  try {
    const result = await env.AI.run(model, {
      text,
      speaker,
      encoding: "linear16",
      container: "none",
      sample_rate: 48000
    }, { returnRawResponse: true });

    if (result instanceof Response) {
      const headers = new Headers(result.headers);
      headers.set("content-type", "application/octet-stream");
      headers.set("cache-control", "no-store");
      headers.set("x-mel-audio-format", "pcm-s16le");
      headers.set("x-mel-audio-rate", "48000");
      headers.set("x-mel-audio-channels", "1");
      return new Response(result.body, { status: result.status, headers });
    }

    if (result?.body) {
      return new Response(result.body, {
        status: 200,
        headers: {
          "content-type": "application/octet-stream",
          "cache-control": "no-store",
          "x-mel-audio-format": "pcm-s16le",
          "x-mel-audio-rate": "48000",
          "x-mel-audio-channels": "1"
        }
      });
    }

    return json({ ok: false, code: "TTS_EMPTY_RESPONSE" }, 503);
  } catch (error) {
    return json({ ok: false, code: "TTS_FAILED", detail: String(error?.message || error).slice(0, 180) }, 503);
  }
}

export async function maybeHandleWaveshareTerminalApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(WAVESHARE_TERMINAL_API + "/")) return null;

  if (url.pathname === OWNER_PAIR_CODE_PATH && request.method === "POST") return createPairCode(request, env);
  if (url.pathname === WAVESHARE_TERMINAL_API + "/pair" && request.method === "POST") return pairDevice(request, env);
  if (url.pathname === OWNER_STATUS_PATH && request.method === "GET") return ownerStatus(request, env);
  if (url.pathname === WAVESHARE_TERMINAL_API + "/firmware-info" && request.method === "GET") return ownerFirmwareInfo(request, env);
  if (url.pathname === WAVESHARE_TERMINAL_API + "/firmware" && request.method === "GET") return ownerFirmware(request, env);
  if (url.pathname === OWNER_SETUP_SCRIPT_PATH && request.method === "GET") return serveSetupScript(request, env);

  const auth = await authorizeDevice(request, env);
  if (!auth.ok) return auth.response;

  if (url.pathname === WAVESHARE_TERMINAL_API + "/manifest" && request.method === "GET") {
    return json({ ok: true, device_id: auth.deviceId, ...(await loadManifest(env, url.origin)) });
  }
  if (url.pathname === WAVESHARE_TERMINAL_API + "/heartbeat" && request.method === "POST") return updateHeartbeat(request, env, auth);
  if (url.pathname === WAVESHARE_TERMINAL_API + "/chat" && request.method === "POST") return deviceChat(request, env, auth);
  if (url.pathname === WAVESHARE_TERMINAL_API + "/voice/transcribe" && request.method === "POST") return deviceVoice(request, env, auth);
  if (url.pathname === WAVESHARE_TERMINAL_API + "/voice/tts" && request.method === "POST") return deviceTts(request, env, auth);
  if (url.pathname === WAVESHARE_TERMINAL_API + "/download" && (request.method === "GET" || request.method === "HEAD")) return serveDownload(request, env, url);

  return json({ ok: false, code: "DEVICE_ROUTE_NOT_FOUND" }, 404);
}
