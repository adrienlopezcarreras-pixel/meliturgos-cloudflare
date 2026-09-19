import { requireAuth } from "../core/security.js";
import {
  ensureComputerTables,
  upsertComputerDevice,
  authenticateComputer,
  heartbeatComputer,
  listComputerDevices,
  getComputerDevice,
  setComputerHalt,
  enqueueComputerPlan,
  claimNextComputerCommand,
  finishComputerCommand,
  listComputerCommands,
  approvalsForPlan,
} from "./computer-companion-store.js";

export const COMPUTER_API_BASE = "/api/computer/v1";

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });
}

function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(b => b.toString(16).padStart(2, "0")).join("");
}

function bearer(request) {
  const h = request.headers.get("authorization") || "";
  return /^Bearer\s+/i.test(h) ? h.replace(/^Bearer\s+/i, "").trim() : "";
}

async function computerAuth(request, env) {
  const id = String(request.headers.get("x-mel-computer-id") || "").trim();
  const token = bearer(request);
  if (!id || !token) return { ok: false, response: json({ ok: false, code: "COMPUTER_AUTH_REQUIRED" }, 401) };
  const device = await authenticateComputer(env.DB, id, await sha256Hex(token));
  if (!device) return { ok: false, response: json({ ok: false, code: "COMPUTER_AUTH_INVALID" }, 401) };
  return { ok: true, device };
}

async function pair(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const id = String(body.computer_id || body.device_id || "").trim() || crypto.randomUUID();
  const tokenBytes = new Uint8Array(32);
  crypto.getRandomValues(tokenBytes);
  const token = base64url(tokenBytes);
  const tokenHash = await sha256Hex(token);
  const allowedApps = Array.isArray(body.allowed_apps) && body.allowed_apps.length
    ? body.allowed_apps
    : ["notepad","calculator","explorer","msedge","firefox","chrome"];
  const device = await upsertComputerDevice(env.DB, {
    id,
    tokenHash,
    name: body.name || "Ordinateur MEL",
    platform: body.platform || "windows",
    capabilities: ["computer.use"],
    allowedApps,
    metadata: { version: body.version || null, paired_by: env.MELITURGOS_USER || "owner" },
  });
  return json({
    ok: true,
    computer: device,
    token,
    note: "Le jeton n'est affiché qu'ici. Le compagnon doit le stocker localement."
  });
}

async function ownerStatus(request, env, url) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const devices = await listComputerDevices(env.DB);
  const selectedId = url.searchParams.get("computer_id") || devices[0]?.id || "";
  const commands = selectedId ? await listComputerCommands(env.DB, selectedId, 20) : [];
  return json({ ok: true, devices, selected_id: selectedId || null, commands });
}

async function ownerCommand(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const id = String(body.computer_id || "").trim();
  const device = await getComputerDevice(env.DB, id);
  if (!device) return json({ ok: false, code: "COMPUTER_NOT_FOUND" }, 404);
  if (device.halted) return json({ ok: false, code: "OWNER_HALT_ACTIVE" }, 409);
  const steps = (Array.isArray(body.steps) ? body.steps : []).map((step, index) => ({
    ...step,
    id: String(step?.id || `step-${index + 1}`),
  }));
  const sessionId = String(body.session_id || crypto.randomUUID());
  const approvals = body.approve_sensitive === true
    ? approvalsForPlan(sessionId, steps)
    : (Array.isArray(body.approvals) ? body.approvals : []);
  try {
    const result = await enqueueComputerPlan(env.DB, device, {
      session_id: sessionId,
      steps,
      approvals,
      allowed_apps: body.allowed_apps,
      allowed_origins: body.allowed_origins,
      max_steps: body.max_steps,
    });
    return json(result, 202);
  } catch (error) {
    return json({ ok: false, code: error.code || error.message || "COMPUTER_COMMAND_REJECTED" }, error.status || 400);
  }
}

async function ownerHalt(request, env, halted) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const id = String(body.computer_id || "").trim();
  if (!id) return json({ ok: false, code: "COMPUTER_ID_REQUIRED" }, 400);
  const device = await setComputerHalt(env.DB, id, halted);
  if (!device) return json({ ok: false, code: "COMPUTER_NOT_FOUND" }, 404);
  return json({ ok: true, computer: device });
}

async function ownerInstaller(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!env?.ASSETS?.fetch) return json({ ok: false, code: "ASSETS_BINDING_UNAVAILABLE" }, 503);
  const target = new URL("/MEL-Computer-Setup.ps1", request.url);
  const response = await env.ASSETS.fetch(new Request(target.toString(), { method: "GET" }));
  if (!response.ok) return json({ ok: false, code: "INSTALLER_NOT_FOUND" }, 404);
  const headers = new Headers(response.headers);
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("content-disposition", 'attachment; filename="MEL-Computer-Setup.ps1"');
  headers.set("cache-control", "no-store");
  return new Response(response.body, { status: 200, headers });
}

async function ownerScreenshot(request, env, url) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (!env?.MEDIA_BUCKET) return json({ ok: false, code: "MEDIA_BUCKET_UNAVAILABLE" }, 503);
  const key = String(url.searchParams.get("key") || "");
  if (!key.startsWith("computer/screenshots/") || key.includes("..")) return json({ ok: false, code: "SCREENSHOT_KEY_INVALID" }, 400);
  const obj = await env.MEDIA_BUCKET.get(key);
  if (!obj) return json({ ok: false, code: "SCREENSHOT_NOT_FOUND" }, 404);
  const headers = new Headers({ "content-type": "image/png", "cache-control": "private, max-age=30" });
  obj.writeHttpMetadata?.(headers);
  return new Response(obj.body, { headers });
}

async function deviceHeartbeat(request, env, auth) {
  const body = await request.json().catch(() => ({}));
  const device = await heartbeatComputer(env.DB, auth.device.id, {
    version: body.version || null,
    hostname: body.hostname || null,
    user: body.user || null,
    screen: body.screen || null,
    active_window: body.active_window || null,
  });
  return json({ ok: true, computer: device, server_time: Date.now() });
}

async function deviceCommands(request, env, auth) {
  if (auth.device.halted) return json({ ok: true, halted: true, command: null });
  const command = await claimNextComputerCommand(env.DB, auth.device.id);
  return json({ ok: true, halted: false, command });
}

async function deviceResult(request, env, auth) {
  const body = await request.json().catch(() => ({}));
  const commandId = String(body.command_id || "").trim();
  if (!commandId) return json({ ok: false, code: "COMMAND_ID_REQUIRED" }, 400);
  const command = await finishComputerCommand(env.DB, {
    id: commandId,
    deviceId: auth.device.id,
    ok: body.ok === true,
    result: body.result ?? null,
    errorCode: body.error_code || null,
  });
  if (!command) return json({ ok: false, code: "COMMAND_NOT_FOUND" }, 404);
  return json({ ok: true, command });
}

async function deviceScreenshot(request, env, auth, url) {
  if (!env?.MEDIA_BUCKET) return json({ ok: false, code: "MEDIA_BUCKET_UNAVAILABLE" }, 503);
  const commandId = String(url.searchParams.get("command_id") || "").trim();
  if (!commandId) return json({ ok: false, code: "COMMAND_ID_REQUIRED" }, 400);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) return json({ ok: false, code: "SCREENSHOT_SIZE_INVALID" }, 413);
  const safeDevice = auth.device.id.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0,120);
  const safeCommand = commandId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0,120);
  const key = `computer/screenshots/${safeDevice}/${safeCommand}.png`;
  await env.MEDIA_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: "image/png" },
    customMetadata: { device_id: auth.device.id, command_id: commandId, created_at: String(Date.now()) }
  });
  return json({ ok: true, key, view_url: `${url.origin}${COMPUTER_API_BASE}/screenshot?key=${encodeURIComponent(key)}` });
}

export async function maybeHandleComputerApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(COMPUTER_API_BASE + "/")) return null;
  await ensureComputerTables(env.DB);

  if (url.pathname === COMPUTER_API_BASE + "/pair" && request.method === "POST") return pair(request, env);
  if (url.pathname === COMPUTER_API_BASE + "/status" && request.method === "GET") return ownerStatus(request, env, url);
  if (url.pathname === COMPUTER_API_BASE + "/commands" && request.method === "POST") return ownerCommand(request, env);
  if (url.pathname === COMPUTER_API_BASE + "/halt" && request.method === "POST") return ownerHalt(request, env, true);
  if (url.pathname === COMPUTER_API_BASE + "/resume" && request.method === "POST") return ownerHalt(request, env, false);
  if (url.pathname === COMPUTER_API_BASE + "/installer" && request.method === "GET") return ownerInstaller(request, env);
  if (url.pathname === COMPUTER_API_BASE + "/screenshot" && request.method === "GET") return ownerScreenshot(request, env, url);

  const auth = await computerAuth(request, env);
  if (!auth.ok) return auth.response;
  if (url.pathname === COMPUTER_API_BASE + "/heartbeat" && request.method === "POST") return deviceHeartbeat(request, env, auth);
  if (url.pathname === COMPUTER_API_BASE + "/commands" && request.method === "GET") return deviceCommands(request, env, auth);
  if (url.pathname === COMPUTER_API_BASE + "/result" && request.method === "POST") return deviceResult(request, env, auth);
  if (url.pathname === COMPUTER_API_BASE + "/screenshot" && request.method === "POST") return deviceScreenshot(request, env, auth, url);

  return json({ ok: false, code: "COMPUTER_ROUTE_NOT_FOUND" }, 404);
}
