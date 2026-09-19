import {
  ensureComputerTables,
  listComputerDevices,
  getComputerDevice,
  enqueueComputerPlan,
  listComputerCommands,
} from "../devices/computer-companion-store.js";

const anyObject = { type: "object", additionalProperties: true };

function computerError(code, status = 400) {
  const e = new Error(code);
  e.code = code;
  e.status = status;
  return e;
}

async function health(db) {
  if (!db) return "UNAVAILABLE";
  try {
    await ensureComputerTables(db);
    const devices = await listComputerDevices(db);
    if (devices.some(d => d.online && !d.halted)) return "ONLINE";
    return devices.length ? "DEGRADED" : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

export function registerComputerRuntimeCapabilities(bus, { db } = {}) {
  const dbAvailable = Boolean(db);

  bus.discover({
    id: "computer.status",
    name: "État des ordinateurs MEL",
    category: "device",
    version: "1.0.0",
    provider: "mel",
    description: "Liste les ordinateurs compagnons appairés, leur présence et l’historique récent sans prendre le contrôle.",
    input_schema: { type: "object", properties: { computer_id: { type: "string", maxLength: 200 } }, additionalProperties: false },
    output_schema: anyObject,
    risk: "LOW",
    permissions: [],
    health: dbAvailable ? "DEGRADED" : "UNAVAILABLE",
    enabled: true,
  }, async input => {
    if (!db) throw computerError("COMPUTER_DB_REQUIRED", 503);
    const devices = await listComputerDevices(db);
    const selected = input.computer_id
      ? devices.find(d => d.id === input.computer_id) || null
      : devices[0] || null;
    const commands = selected ? await listComputerCommands(db, selected.id, 20) : [];
    return { ok: true, devices, selected, commands };
  }, dbAvailable ? async () => health(db) : null);

  bus.discover({
    id: "computer.execute",
    name: "Contrôle visuel de l’ordinateur",
    category: "device",
    version: "1.0.0",
    provider: "mel",
    description: "Met en file un plan de contrôle visuel approuvé (capture, pointeur, clavier, application, presse-papiers) pour le compagnon local. Les actions sensibles exigent une approbation exacte par étape.",
    input_schema: {
      type: "object",
      properties: {
        computer_id: { type: "string", minLength: 1, maxLength: 200 },
        session_id: { type: "string", maxLength: 200 },
        steps: { type: "array", minItems: 1, maxItems: 100, items: { type: "object", additionalProperties: true } },
        approvals: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
        allowed_apps: { type: "array", maxItems: 64, items: { type: "string", maxLength: 200 } },
        allowed_origins: { type: "array", maxItems: 64, items: { type: "string", maxLength: 2048 } },
        max_steps: { type: "integer", minimum: 1, maximum: 100 }
      },
      required: ["computer_id", "steps"],
      additionalProperties: false
    },
    output_schema: anyObject,
    risk: "HIGH",
    permissions: ["computer.control"],
    health: dbAvailable ? "DEGRADED" : "UNAVAILABLE",
    enabled: true,
  }, async input => {
    if (!db) throw computerError("COMPUTER_DB_REQUIRED", 503);
    const device = await getComputerDevice(db, input.computer_id);
    if (!device) throw computerError("COMPUTER_NOT_FOUND", 404);
    if (device.halted) throw computerError("OWNER_HALT_ACTIVE", 409);
    return enqueueComputerPlan(db, device, input);
  }, dbAvailable ? async () => health(db) : null);

  return bus;
}
