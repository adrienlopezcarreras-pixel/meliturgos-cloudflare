import {
  evaluateComputerUsePlan,
  classifyComputerUseAction,
  COMPUTER_USE_RISK,
} from "../devices/computer-use.js";

function parse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeDevice(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    capabilities: parse(row.capabilities, []),
    allowed_apps: parse(row.allowed_apps, []),
    halted: Number(row.halted) === 1,
    last_seen_at: Number(row.last_seen_at || 0),
    online: Date.now() - Number(row.last_seen_at || 0) < 15000,
    metadata: parse(row.metadata, {}),
  };
}

async function ensure(db) {
  if (!db) throw Object.assign(new Error("COMPUTER_DB_REQUIRED"), { code: "COMPUTER_DB_REQUIRED", status: 503 });
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,capabilities TEXT NOT NULL,allowed_apps TEXT NOT NULL,halted INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL,metadata TEXT NOT NULL DEFAULT "{}")`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS computer_commands(id TEXT PRIMARY KEY,device_id TEXT NOT NULL,session_id TEXT NOT NULL,plan_json TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,claimed_at INTEGER,finished_at INTEGER,result_json TEXT,error_code TEXT)`).run();
}

function sensitiveApprovals(session, steps) {
  const sensitive = new Set(["keyboard.type", "app.open", "clipboard.read", "clipboard.write"]);
  return steps
    .filter(step => sensitive.has(String(step.action || "")))
    .map(step => ({
      approved: true,
      session_id: session,
      step_id: String(step.id),
      action: String(step.action),
    }));
}

function computerStepsNeedExplicitApproval(steps = []) {
  return (Array.isArray(steps) ? steps : []).some(step => {
    const action = String(step?.action || "");
    const risk = classifyComputerUseAction(action);
    return risk === COMPUTER_USE_RISK.SENSITIVE
      || action === "pointer.click"
      || action === "keyboard.press";
  });
}

function quickNeedsExplicitApproval(input = {}) {
  return ["open_app", "type_text", "click", "press_key"].includes(String(input?.kind || ""));
}

function centralApproval(context, capability) {
  return context?.explicitApprovalVerified?.capability === capability;
}

function quickSteps(input) {
  const kind = String(input.kind || "");
  if (kind === "screenshot") return [{ action: "screen.capture" }];
  if (kind === "open_app") return [{ action: "app.open", app: String(input.app || "") }];
  if (kind === "type_text") return [{ action: "keyboard.type", text: String(input.text || "").slice(0, 4096) }];
  if (kind === "press_key") return [{ action: "keyboard.press", key: String(input.key || "").slice(0, 80) }];
  if (kind === "scroll") return [{ action: "pointer.scroll", delta_y: Number(input.delta_y) || -240 }];
  if (kind === "click") return [
    { action: "cursor.move", x: Number(input.x) || 0, y: Number(input.y) || 0 },
    { action: "pointer.click" },
  ];
  return [];
}

async function queuePlan(
  db,
  device,
  { session_id, steps, allowed_origins = [], max_steps = 20 } = {},
  approved = false,
) {
  if (!device) throw Object.assign(new Error("COMPUTER_NOT_FOUND"), { code: "COMPUTER_NOT_FOUND", status: 404 });
  if (device.halted) throw Object.assign(new Error("OWNER_HALT_ACTIVE"), { code: "OWNER_HALT_ACTIVE", status: 409 });
  const session = String(session_id || crypto.randomUUID());
  const normalized = (steps || []).map((step, index) => ({
    ...step,
    id: String(step?.id || `step-${index + 1}`),
  }));
  const approvals = approved === true ? sensitiveApprovals(session, normalized) : [];
  const plan = evaluateComputerUsePlan({
    session_id: session,
    owner_halt: false,
    device: { id: device.id, capabilities: device.capabilities },
    sandbox: {
      allowed_apps: device.allowed_apps,
      allowed_origins: Array.isArray(allowed_origins) ? allowed_origins : [],
      max_steps: Math.max(1, Math.min(100, Number(max_steps) || 20)),
    },
    approvals,
    steps: normalized,
  });
  if (!plan.allowed) throw Object.assign(new Error(plan.reason), { code: plan.reason, status: 403 });
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO computer_commands(id,device_id,session_id,plan_json,status,created_at) VALUES(?,?,?,?,?,?)")
    .bind(id, device.id, session, JSON.stringify(plan.request), "PENDING", Date.now()).run();
  return { ok: true, command_id: id, status: "PENDING", device_id: device.id, decisions: plan.decisions };
}

export function registerComputerRuntimeCapabilities(bus, { db } = {}) {
  const health = async () => {
    if (!db) return "OFFLINE";
    try {
      await ensure(db);
      const row = await db.prepare("SELECT COUNT(*) AS n FROM computer_devices WHERE last_seen_at>? AND halted=0")
        .bind(Date.now() - 15000).first();
      return Number(row?.n || 0) > 0 ? "ONLINE" : "OFFLINE";
    } catch {
      return "OFFLINE";
    }
  };

  bus.discover({
    id: "computer.status",
    name: "État ordinateur MEL",
    category: "device",
    version: "1.0.0",
    provider: "mel",
    description: "Liste les ordinateurs appairés et leur présence récente.",
    input_schema: { type: "object", additionalProperties: false },
    output_schema: { type: "object", additionalProperties: true },
    risk: "LOW",
    permissions: [],
    health: db ? "DEGRADED" : "UNAVAILABLE",
    enabled: true,
  }, async () => {
    await ensure(db);
    const rows = await db.prepare("SELECT * FROM computer_devices ORDER BY last_seen_at DESC LIMIT 20").all();
    return { ok: true, devices: (rows.results || []).map(normalizeDevice) };
  }, db ? health : null);

  bus.discover({
    id: "computer.execute",
    name: "Contrôler ordinateur MEL",
    category: "device",
    version: "1.1.0",
    provider: "mel",
    description: "Met en file des actions visuelles bornées. Les actions interactives ou sensibles exigent une approbation explicite de la requête courante, vérifiée centralement.",
    input_schema: {
      type: "object",
      properties: {
        computer_id: { type: "string", minLength: 1, maxLength: 200 },
        session_id: { type: "string", maxLength: 200 },
        steps: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: true } },
        approve_sensitive: { type: "boolean" },
        allowed_origins: { type: "array", maxItems: 32, items: { type: "string", maxLength: 2048 } },
        max_steps: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["computer_id", "steps"],
      additionalProperties: false,
    },
    output_schema: { type: "object", additionalProperties: true },
    risk: "HIGH",
    permissions: [],
    health: db ? "DEGRADED" : "UNAVAILABLE",
    enabled: true,
    approval: { mode: "EXPLICIT_CURRENT_REQUEST", reason: "COMPUTER_INTERACTIVE_ACTION" },
    approvalcheck: input => ({ required: computerStepsNeedExplicitApproval(input?.steps) }),
  }, async (input, context) => {
    await ensure(db);
    const row = await db.prepare("SELECT * FROM computer_devices WHERE id=? LIMIT 1")
      .bind(String(input.computer_id)).first();
    return queuePlan(db, normalizeDevice(row), input, centralApproval(context, "computer.execute"));
  }, db ? health : null);

  bus.discover({
    id: "computer.quick",
    name: "Commande rapide ordinateur",
    category: "device",
    version: "1.1.0",
    provider: "mel",
    description: "Exécute une commande directe sur le premier ordinateur MEL en ligne. Ouverture, saisie, touche et clic exigent une approbation explicite de la requête courante.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["screenshot", "open_app", "type_text", "press_key", "scroll", "click"] },
        app: { type: "string", maxLength: 100 },
        text: { type: "string", maxLength: 4096 },
        key: { type: "string", maxLength: 80 },
        x: { type: "number" },
        y: { type: "number" },
        delta_y: { type: "number" },
        approve_sensitive: { type: "boolean" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
    output_schema: { type: "object", additionalProperties: true },
    risk: "HIGH",
    permissions: [],
    health: db ? "DEGRADED" : "UNAVAILABLE",
    enabled: true,
    approval: { mode: "EXPLICIT_CURRENT_REQUEST", reason: "COMPUTER_QUICK_INTERACTIVE_ACTION" },
    approvalcheck: input => ({ required: quickNeedsExplicitApproval(input) }),
  }, async (input, context) => {
    await ensure(db);
    const row = await db.prepare("SELECT * FROM computer_devices WHERE halted=0 ORDER BY CASE WHEN last_seen_at>? THEN 0 ELSE 1 END,last_seen_at DESC LIMIT 1")
      .bind(Date.now() - 15000).first();
    const device = normalizeDevice(row);
    const steps = quickSteps(input);
    if (!steps.length) throw Object.assign(new Error("COMPUTER_QUICK_ACTION_INVALID"), { code: "COMPUTER_QUICK_ACTION_INVALID", status: 400 });
    return queuePlan(db, device, { steps }, centralApproval(context, "computer.quick"));
  }, db ? health : null);
}
