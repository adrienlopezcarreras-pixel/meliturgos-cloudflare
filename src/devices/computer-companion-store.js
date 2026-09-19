import { evaluateComputerUsePlan, COMPUTER_USE_RISK } from "./computer-use.js";

function err(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

function text(value, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export async function ensureComputerTables(db) {
  if (!db) throw err("COMPUTER_DB_REQUIRED", 503);
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_devices (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    capabilities TEXT NOT NULL,
    allowed_apps TEXT NOT NULL,
    halted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_commands (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    plan_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    claimed_at INTEGER,
    finished_at INTEGER,
    result_json TEXT,
    error_code TEXT
  )`).run();
}

export function normalizeComputerDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    capabilities: parseJson(row.capabilities, []),
    allowed_apps: parseJson(row.allowed_apps, []),
    halted: Number(row.halted) === 1,
    created_at: Number(row.created_at || 0),
    last_seen_at: Number(row.last_seen_at || 0),
    online: Date.now() - Number(row.last_seen_at || 0) < 15000,
    metadata: parseJson(row.metadata, {}),
  };
}

export async function upsertComputerDevice(db, {
  id, tokenHash, name = "MEL PC", platform = "windows",
  capabilities = ["computer.use"], allowedApps = ["notepad","calculator","explorer","msedge","firefox","chrome"],
  metadata = {}
}) {
  await ensureComputerTables(db);
  const deviceId = text(id, 200);
  if (!deviceId || !tokenHash) throw err("COMPUTER_ID_AND_TOKEN_REQUIRED");
  const now = Date.now();
  await db.prepare(`INSERT INTO computer_devices(id,token_hash,name,platform,capabilities,allowed_apps,halted,created_at,last_seen_at,metadata)
    VALUES(?,?,?,?,?,?,0,?,?,?)
    ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,name=excluded.name,platform=excluded.platform,
      capabilities=excluded.capabilities,allowed_apps=excluded.allowed_apps,halted=0,last_seen_at=excluded.last_seen_at,metadata=excluded.metadata`)
    .bind(deviceId, tokenHash, text(name,200) || "MEL PC", text(platform,80) || "windows",
      JSON.stringify(Array.isArray(capabilities) ? capabilities.slice(0,64) : ["computer.use"]),
      JSON.stringify(Array.isArray(allowedApps) ? allowedApps.slice(0,64) : []),
      now, now, JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}))
    .run();
  return getComputerDevice(db, deviceId);
}

export async function getComputerDevice(db, id) {
  await ensureComputerTables(db);
  const row = await db.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1").bind(text(id,200)).first();
  return normalizeComputerDevice(row);
}

export async function listComputerDevices(db) {
  await ensureComputerTables(db);
  const rows = await db.prepare("SELECT * FROM computer_devices ORDER BY last_seen_at DESC LIMIT 20").all();
  return (rows.results || []).map(normalizeComputerDevice);
}

export async function authenticateComputer(db, id, tokenHash) {
  await ensureComputerTables(db);
  const row = await db.prepare("SELECT * FROM computer_devices WHERE id=? AND token_hash=? LIMIT 1")
    .bind(text(id,200), tokenHash).first();
  return normalizeComputerDevice(row);
}

export async function heartbeatComputer(db, id, metadata = {}) {
  await ensureComputerTables(db);
  await db.prepare("UPDATE computer_devices SET last_seen_at=?, metadata=? WHERE id=?")
    .bind(Date.now(), JSON.stringify(metadata && typeof metadata === "object" ? metadata : {}), text(id,200)).run();
  return getComputerDevice(db, id);
}

export async function setComputerHalt(db, id, halted) {
  await ensureComputerTables(db);
  await db.prepare("UPDATE computer_devices SET halted=? WHERE id=?").bind(halted ? 1 : 0, text(id,200)).run();
  return getComputerDevice(db, id);
}

export function buildComputerPlan(device, input = {}) {
  if (!device) throw err("COMPUTER_NOT_FOUND", 404);
  const sessionId = text(input.session_id, 200) || crypto.randomUUID();
  const rawSteps = Array.isArray(input.steps) ? input.steps : [];
  const approvals = Array.isArray(input.approvals) ? input.approvals : [];
  const plan = evaluateComputerUsePlan({
    session_id: sessionId,
    owner_halt: device.halted === true,
    device: { id: device.id, capabilities: device.capabilities },
    sandbox: {
      allowed_apps: Array.isArray(input.allowed_apps) && input.allowed_apps.length ? input.allowed_apps : device.allowed_apps,
      allowed_origins: Array.isArray(input.allowed_origins) ? input.allowed_origins : [],
      max_steps: Math.max(1, Math.min(100, Number(input.max_steps) || 20)),
    },
    approvals,
    steps: rawSteps,
  });
  return plan;
}

export async function enqueueComputerPlan(db, device, input = {}) {
  await ensureComputerTables(db);
  const plan = buildComputerPlan(device, input);
  if (!plan.allowed) throw err(plan.reason, 403);
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at)
    VALUES(?,?,?,?,?,?)`)
    .bind(id, device.id, plan.request.session_id, JSON.stringify(plan.request), "PENDING", Date.now()).run();
  return {
    ok: true,
    command_id: id,
    device_id: device.id,
    session_id: plan.request.session_id,
    status: "PENDING",
    decisions: plan.decisions,
  };
}

export async function claimNextComputerCommand(db, deviceId) {
  await ensureComputerTables(db);
  const row = await db.prepare(`SELECT * FROM computer_commands
    WHERE device_id=? AND status='PENDING' ORDER BY created_at ASC LIMIT 1`).bind(text(deviceId,200)).first();
  if (!row) return null;
  const now = Date.now();
  await db.prepare("UPDATE computer_commands SET status='RUNNING', claimed_at=? WHERE id=? AND status='PENDING'")
    .bind(now, row.id).run();
  const claimed = await db.prepare("SELECT * FROM computer_commands WHERE id=? LIMIT 1").bind(row.id).first();
  if (!claimed || claimed.status !== "RUNNING") return null;
  return {
    id: claimed.id,
    device_id: claimed.device_id,
    session_id: claimed.session_id,
    plan: parseJson(claimed.plan_json, {}),
    created_at: Number(claimed.created_at || 0),
  };
}

export async function finishComputerCommand(db, { id, deviceId, ok, result = null, errorCode = null }) {
  await ensureComputerTables(db);
  const commandId = text(id,200);
  const status = ok ? "SUCCEEDED" : "FAILED";
  await db.prepare(`UPDATE computer_commands SET status=?, finished_at=?, result_json=?, error_code=?
    WHERE id=? AND device_id=?`)
    .bind(status, Date.now(), JSON.stringify(result ?? null), errorCode ? text(errorCode,200) : null, commandId, text(deviceId,200)).run();
  return getComputerCommand(db, commandId);
}

export async function getComputerCommand(db, id) {
  await ensureComputerTables(db);
  const row = await db.prepare("SELECT * FROM computer_commands WHERE id=? LIMIT 1").bind(text(id,200)).first();
  if (!row) return null;
  return {
    id: row.id,
    device_id: row.device_id,
    session_id: row.session_id,
    status: row.status,
    created_at: Number(row.created_at || 0),
    claimed_at: row.claimed_at == null ? null : Number(row.claimed_at),
    finished_at: row.finished_at == null ? null : Number(row.finished_at),
    result: parseJson(row.result_json, null),
    error_code: row.error_code || null,
  };
}

export async function listComputerCommands(db, deviceId, limit = 30) {
  await ensureComputerTables(db);
  const n = Math.max(1, Math.min(100, Number(limit) || 30));
  const rows = await db.prepare(`SELECT * FROM computer_commands WHERE device_id=? ORDER BY created_at DESC LIMIT ?`)
    .bind(text(deviceId,200), n).all();
  return (rows.results || []).map(row => ({
    id: row.id,
    device_id: row.device_id,
    session_id: row.session_id,
    status: row.status,
    created_at: Number(row.created_at || 0),
    claimed_at: row.claimed_at == null ? null : Number(row.claimed_at),
    finished_at: row.finished_at == null ? null : Number(row.finished_at),
    result: parseJson(row.result_json, null),
    error_code: row.error_code || null,
  }));
}

export function approvalsForPlan(sessionId, steps = []) {
  return (Array.isArray(steps) ? steps : [])
    .filter(step => ["keyboard.type","app.open","clipboard.read","clipboard.write"].includes(String(step?.action || "")))
    .map(step => ({
      approved: true,
      session_id: sessionId,
      step_id: String(step.id || ""),
      action: String(step.action || ""),
    }));
}

export function summarizePlanRisk(plan) {
  const rows = Array.isArray(plan?.decisions) ? plan.decisions : [];
  return rows.reduce((acc, row) => {
    const risk = row.risk || COMPUTER_USE_RISK.DENY;
    acc[risk] = (acc[risk] || 0) + 1;
    return acc;
  }, {});
}
