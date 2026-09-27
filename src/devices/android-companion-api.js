import { requireAuth } from "../core/security.js";
import { handleNativeChat } from "../api/native-chat.js";
import { handleVoiceTranscription } from "../api/voice-transcribe.js";
import { handleFileUpload } from "../api/file-upload.js";
import { createConversationService } from "../conversations/conversation-service.js";

export const ANDROID_API_BASE = "/api/android/v1";
export const ANDROID_PROTOCOL_VERSION = "1.0";
const PAIR_TTL_MS = 10 * 60 * 1000;

function json(value,status=200,headers={}) {
  return Response.json(value,{status,headers:{"cache-control":"no-store",...headers}});
}

function safe(value,max=200) {
  return typeof value === "string" ? value.trim().slice(0,max) : "";
}

function bearer(request) {
  const header = request.headers.get("authorization") || "";
  return /^Bearer\s+/i.test(header) ? header.replace(/^Bearer\s+/i,"").trim() : "";
}

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2,"0")).join("");
}

function pairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => alphabet[byte % alphabet.length]).join("");
}

async function ensureTables(env) {
  if (!env?.DB) throw Object.assign(new Error("ANDROID_DB_REQUIRED"),{code:"ANDROID_DB_REQUIRED",status:503});
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS android_pair_codes(
    code_hash TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_at INTEGER
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS android_device_tokens(
    device_id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    app_version TEXT,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    revoked_at INTEGER
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS android_device_status(
    device_id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  )`).run();
}

async function createPairCode(request,env) {
  const auth = requireAuth(request,env);
  if (!auth.ok) return auth.response;
  await ensureTables(env);
  const code = pairCode();
  const now = Date.now();
  await env.DB.prepare("DELETE FROM android_pair_codes WHERE expires_at < ? OR used_at IS NOT NULL").bind(now).run();
  await env.DB.prepare("INSERT INTO android_pair_codes(code_hash,created_at,expires_at,used_at) VALUES(?,?,?,NULL)")
    .bind(await sha256Hex(code),now,now+PAIR_TTL_MS).run();
  return json({ok:true,code,expires_at:now+PAIR_TTL_MS,ttl_seconds:PAIR_TTL_MS/1000});
}

async function consumePairCode(env,code) {
  const normalized = safe(code,32).toUpperCase();
  if (!normalized) return false;
  const hash = await sha256Hex(normalized);
  const now = Date.now();
  const row = await env.DB.prepare("SELECT code_hash FROM android_pair_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>? LIMIT 1")
    .bind(hash,now).first();
  if (!row) return false;
  await env.DB.prepare("UPDATE android_pair_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL")
    .bind(now,hash).run();
  return true;
}

async function pairDevice(request,env) {
  await ensureTables(env);
  const body = await request.json().catch(()=>({}));
  if (String(body.protocol_version || ANDROID_PROTOCOL_VERSION) !== ANDROID_PROTOCOL_VERSION) {
    return json({ok:false,code:"PROTOCOL_UNSUPPORTED",supported:ANDROID_PROTOCOL_VERSION},426);
  }
  if (!(await consumePairCode(env,body.pair_code))) {
    return json({ok:false,code:"PAIR_CODE_INVALID_OR_EXPIRED"},401);
  }
  const deviceId = safe(body.device_id,200);
  if (!deviceId) return json({ok:false,code:"DEVICE_ID_REQUIRED"},400);
  const name = safe(body.name,200) || "MEL Android";
  const appVersion = safe(body.app_version,100) || null;
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = base64url(tokenBytes);
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO android_device_tokens(device_id,token_hash,name,app_version,created_at,last_seen_at,revoked_at)
    VALUES(?,?,?,?,?,?,NULL)
    ON CONFLICT(device_id) DO UPDATE SET
      token_hash=excluded.token_hash,
      name=excluded.name,
      app_version=excluded.app_version,
      created_at=excluded.created_at,
      last_seen_at=excluded.last_seen_at,
      revoked_at=NULL`)
    .bind(deviceId,await sha256Hex(token),name,appVersion,now,now).run();

  const service = createConversationService(env);
  await service.registerDevice({
    id:deviceId,
    owner:env.MELITURGOS_USER || "owner",
    name,
    kind:"android-companion",
    metadata:{
      protocol_version:ANDROID_PROTOCOL_VERSION,
      app_version:appVersion,
      capabilities:["chat","conversation.sync","voice.stt","voice.tts","files.upload","heartbeat"],
    },
  });

  return json({
    ok:true,
    device_id:deviceId,
    protocol_version:ANDROID_PROTOCOL_VERSION,
    token,
    api_base:ANDROID_API_BASE,
    token_storage:"ANDROID_KEYSTORE_REQUIRED",
  });
}

async function authorizeDevice(request,env) {
  await ensureTables(env);
  const deviceId = safe(request.headers.get("x-mel-device-id"),200);
  const token = bearer(request);
  if (!deviceId || !token) return {ok:false,response:json({ok:false,code:"DEVICE_AUTH_REQUIRED"},401)};
  const row = await env.DB.prepare("SELECT device_id,revoked_at FROM android_device_tokens WHERE device_id=? AND token_hash=? LIMIT 1")
    .bind(deviceId,await sha256Hex(token)).first();
  if (!row || row.revoked_at != null) return {ok:false,response:json({ok:false,code:"DEVICE_AUTH_INVALID"},401)};
  await env.DB.prepare("UPDATE android_device_tokens SET last_seen_at=? WHERE device_id=?").bind(Date.now(),deviceId).run();
  return {ok:true,deviceId};
}

async function ownerStatus(request,env) {
  const auth = requireAuth(request,env);
  if (!auth.ok) return auth.response;
  await ensureTables(env);
  const rows = await env.DB.prepare(`SELECT t.device_id,t.name,t.app_version,t.created_at,t.last_seen_at,t.revoked_at,
    s.payload_json,s.updated_at
    FROM android_device_tokens t
    LEFT JOIN android_device_status s ON s.device_id=t.device_id
    ORDER BY t.last_seen_at DESC LIMIT 20`).all();
  const now = Date.now();
  return json({
    ok:true,
    devices:(rows.results||[]).map(row=>({
      device_id:row.device_id,
      name:row.name,
      app_version:row.app_version || null,
      paired_at:Number(row.created_at||0),
      last_seen_at:Number(row.last_seen_at||0),
      online:row.revoked_at == null && now-Number(row.last_seen_at||0)<30000,
      revoked:row.revoked_at != null,
      status:(()=>{try{return JSON.parse(row.payload_json||"{}")}catch{return {}}})(),
    })),
  });
}

async function revokeDevice(request,env) {
  const auth = requireAuth(request,env);
  if (!auth.ok) return auth.response;
  await ensureTables(env);
  const body = await request.json().catch(()=>({}));
  const deviceId = safe(body.device_id,200);
  if (!deviceId) return json({ok:false,code:"DEVICE_ID_REQUIRED"},400);
  await env.DB.prepare("UPDATE android_device_tokens SET revoked_at=? WHERE device_id=?").bind(Date.now(),deviceId).run();
  return json({ok:true,device_id:deviceId,revoked:true});
}

async function heartbeat(request,env,auth) {
  const body = await request.json().catch(()=>({}));
  const now = Date.now();
  const status = {
    app_version:safe(body.app_version,100)||null,
    sdk_int:Number.isFinite(Number(body.sdk_int)) ? Math.trunc(Number(body.sdk_int)) : null,
    battery:Number.isFinite(Number(body.battery)) ? Number(body.battery) : null,
    charging:body.charging === true,
    network:safe(body.network,40)||null,
    phase:safe(body.phase,40)||"ONLINE",
  };
  await env.DB.prepare(`INSERT INTO android_device_status(device_id,payload_json,updated_at) VALUES(?,?,?)
    ON CONFLICT(device_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
    .bind(auth.deviceId,JSON.stringify(status),now).run();
  return json({ok:true,device_id:auth.deviceId,server_time:now,accepted:status});
}

function conversationIdFor(auth,bodyOrUrl) {
  if (bodyOrUrl instanceof URL) return safe(bodyOrUrl.searchParams.get("conversation_id"),200) || `android-${auth.deviceId}`;
  return safe(bodyOrUrl?.conversation_id,200) || `android-${auth.deviceId}`;
}

async function companionDevices(env) {
  try {
    const rows = await env.DB.prepare(`SELECT t.device_id,t.model,t.last_seen_at,t.revoked_at,
      s.payload_json,s.updated_at
      FROM device_tokens t
      LEFT JOIN device_status s ON s.device_id=t.device_id
      ORDER BY t.last_seen_at DESC LIMIT 20`).all();
    const now = Date.now();
    return json({
      ok:true,
      devices:(rows.results||[]).map(row=>{
        let status={};
        try{ status=JSON.parse(row.payload_json||"{}"); }catch{}
        return {
          device_id:row.device_id,
          name:safe(status.name,80)||"MINI",
          model:safe(row.model,120)||"waveshare-terminal",
          online:row.revoked_at == null && now-Number(row.last_seen_at||0)<30000,
          last_seen_at:Number(row.last_seen_at||0),
          phase:safe(status.phase,40)||null,
          firmware:safe(status.firmware,80)||null,
          battery:Number.isFinite(Number(status.battery))?Number(status.battery):null,
          wifi_rssi:Number.isFinite(Number(status.wifi_rssi))?Number(status.wifi_rssi):null,
          camera:status.camera ?? null,
          microphone:status.microphone ?? null,
          speaker:status.speaker ?? null
        };
      })
    });
  } catch {
    // MINI may not have been paired yet. Keep Android usable and return an empty list.
    return json({ok:true,devices:[]});
  }
}

function approximateNetworkLocation(request) {
  const cf = request?.cf || {};
  const parts = [
    safe(cf.city, 120),
    safe(cf.region, 120),
    safe(cf.country, 80),
  ].filter(Boolean);
  return parts.join(", ").slice(0, 240);
}

async function deviceChat(request,env,auth) {
  const body = await request.json().catch(()=>({}));
  const text = safe(body.text ?? body.message,100000);
  if (!text) return json({ok:false,code:"MESSAGE_REQUIRED"},400);
  const inputSource = body.input_source === "voice-server-transcription" ? "voice-server-transcription" : "text";
  const uiMode = safe(body.ui_mode,20).toLowerCase() === "complete" ? "complete" : "normal";
  const internal = new Request(new URL("/api/chat",request.url),{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      text,
      conversation_id:conversationIdFor(auth,body),
      device_id:auth.deviceId,
      ui_theme:safe(body.ui_theme,40)||"futuristic",
      ui_mode:uiMode,
      input_source:inputSource,
      voice_reply:body.voice_reply === true || inputSource !== "text",
      intent_context:{
        surface:uiMode === "complete" ? "mel-android-complete" : "mel-android-normal",
        ui_mode:uiMode,
        device:"android-companion",
        approximate_location:approximateNetworkLocation(request),
      },
    }),
  });
  return handleNativeChat(internal,env,{authorized:true,source:"android-companion",device_id:auth.deviceId});
}

async function syncMessages(request,env,auth,url) {
  const conversationId = conversationIdFor(auth,url);
  const service = createConversationService(env);
  const result = await service.sync({deviceId:auth.deviceId,conversationId});
  return json({ok:true,...result});
}

async function ackMessages(request,env,auth) {
  const body = await request.json().catch(()=>({}));
  const conversationId = conversationIdFor(auth,body);
  const lastMessageId = safe(body.last_message_id,240);
  const ts = Number(body.last_message_timestamp);
  if (!lastMessageId || !Number.isFinite(ts) || ts < 0) return json({ok:false,code:"SYNC_ACK_INVALID"},400);
  const service = createConversationService(env);
  await service.updateSyncCheckpoint(auth.deviceId,conversationId,lastMessageId,Math.trunc(ts));
  return json({ok:true,device_id:auth.deviceId,conversation_id:conversationId,last_message_id:lastMessageId,last_message_timestamp:Math.trunc(ts)});
}

async function deviceVoice(request,env,auth) {
  const type = String(request.headers.get("content-type")||"");
  if (!type.toLowerCase().includes("multipart/form-data")) return json({ok:false,code:"AUDIO_REQUIRED"},415);
  const bytes = await request.arrayBuffer();
  const internal = new Request(new URL("/api/voice/transcribe",request.url),{
    method:"POST",
    headers:{"content-type":type},
    body:bytes,
  });
  return handleVoiceTranscription(internal,env,{authorized:true,source:"android-companion",device_id:auth.deviceId});
}

async function deviceTts(request,env,auth) {
  const body = await request.json().catch(()=>({}));
  const text = safe(body.text,1200);
  if (!text) return json({ok:false,code:"TEXT_REQUIRED"},400);
  if (!env?.AI || typeof env.AI.run !== "function") {
    return json({ok:false,code:"TTS_UNAVAILABLE",reason:"AI_BINDING_MISSING"},503);
  }

  const speaker = safe(body.speaker,32) || "luna";
  const format = safe(body.format,16).toLowerCase() === "mp3" ? "mp3" : "pcm";
  const model = String(env.MEL_TTS_MODEL || "@cf/deepgram/aura-1");
  const ttsInput = format === "mp3"
    ? { text, speaker, encoding:"mp3" }
    : { text, speaker, encoding:"linear16", container:"none", sample_rate:48000 };
  try {
    const result = await env.AI.run(model,ttsInput,{returnRawResponse:true});

    const audioHeaders = {
      "content-type": format === "mp3" ? "audio/mpeg" : "application/octet-stream",
      "cache-control":"no-store",
      "x-mel-audio-format": format === "mp3" ? "mp3" : "pcm-s16le",
      "x-mel-speaker":speaker
    };
    if (format !== "mp3") {
      audioHeaders["x-mel-audio-rate"]="48000";
      audioHeaders["x-mel-audio-channels"]="1";
    }

    if (result instanceof Response) {
      const headers = new Headers(result.headers);
      Object.entries(audioHeaders).forEach(([key,value])=>headers.set(key,value));
      return new Response(result.body,{status:result.status,headers});
    }
    if (result?.body) {
      return new Response(result.body,{status:200,headers:audioHeaders});
    }
    return json({ok:false,code:"TTS_EMPTY_RESPONSE"},503);
  } catch (error) {
    return json({ok:false,code:"TTS_FAILED",detail:String(error?.message||error).slice(0,180)},503);
  }
}

async function deviceFileUpload(request,env,auth) {
  const type = String(request.headers.get("content-type")||"");
  if (!type.toLowerCase().includes("multipart/form-data")) return json({ok:false,code:"FILE_REQUIRED"},415);
  const bytes = await request.arrayBuffer();
  const internal = new Request(new URL("/api/files/upload",request.url),{
    method:"POST",
    headers:{"content-type":type},
    body:bytes,
  });
  return handleFileUpload(internal,env,{authorized:true,source:"android-companion",device_id:auth.deviceId});
}

export async function maybeHandleAndroidCompanionApi(request,env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(ANDROID_API_BASE+"/")) return null;

  if (url.pathname === ANDROID_API_BASE+"/pair-code" && request.method === "POST") return createPairCode(request,env);
  if (url.pathname === ANDROID_API_BASE+"/pair" && request.method === "POST") return pairDevice(request,env);
  if (url.pathname === ANDROID_API_BASE+"/status" && request.method === "GET") return ownerStatus(request,env);
  if (url.pathname === ANDROID_API_BASE+"/revoke" && request.method === "POST") return revokeDevice(request,env);

  const auth = await authorizeDevice(request,env);
  if (!auth.ok) return auth.response;
  if (url.pathname === ANDROID_API_BASE+"/heartbeat" && request.method === "POST") return heartbeat(request,env,auth);
  if (url.pathname === ANDROID_API_BASE+"/companions" && request.method === "GET") return companionDevices(env);
  if (url.pathname === ANDROID_API_BASE+"/chat" && request.method === "POST") return deviceChat(request,env,auth);
  if (url.pathname === ANDROID_API_BASE+"/sync" && request.method === "GET") return syncMessages(request,env,auth,url);
  if (url.pathname === ANDROID_API_BASE+"/sync/ack" && request.method === "POST") return ackMessages(request,env,auth);
  if (url.pathname === ANDROID_API_BASE+"/voice/transcribe" && request.method === "POST") return deviceVoice(request,env,auth);
  if (url.pathname === ANDROID_API_BASE+"/voice/tts" && request.method === "POST") return deviceTts(request,env,auth);
  if (url.pathname === ANDROID_API_BASE+"/files/upload" && request.method === "POST") return deviceFileUpload(request,env,auth);
  return json({ok:false,code:"ANDROID_ROUTE_NOT_FOUND"},404);
}
