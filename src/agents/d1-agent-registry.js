import { requireValue } from '../core/contracts.js';
import { createWorkDag } from '../work/work-dag.js';

const ACTIVE = 'ACTIVE';
const DISABLED = 'DISABLED';
const VALID_STATUSES = new Set([ACTIVE, DISABLED]);
const VALID_KINDS = new Set(['TASK', 'AUGMENTIO', 'TEACHER']);

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
const clone = value => structuredClone(value);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function normalizeStep(step, index) {
  requireValue(isRecord(step), 'AGENT_STEP_INVALID', 400);
  const id = nonEmptyString(step.id) ? step.id.trim() : `step-${index + 1}`;
  const kind = String(step.kind || 'TASK').toUpperCase();
  requireValue(VALID_KINDS.has(kind), 'AGENT_STEP_KIND_INVALID', 400);
  const dependsOn = Array.isArray(step.depends_on)
    ? step.depends_on.map(value => {
        requireValue(nonEmptyString(value), 'AGENT_STEP_DEPENDENCY_INVALID', 400);
        return value.trim();
      })
    : [];

  const payload = isRecord(step.payload) ? clone(step.payload) : {};
  if (kind === 'TASK') {
    const capability = step.capability ?? payload.capability;
    requireValue(nonEmptyString(capability), 'AGENT_STEP_CAPABILITY_REQUIRED', 400);
    payload.capability = capability.trim();
  }
  if (kind === 'AUGMENTIO') {
    const capability = step.capability ?? payload.capability ?? 'council.state-of-play';
    requireValue(nonEmptyString(capability), 'AGENT_STEP_CAPABILITY_REQUIRED', 400);
    payload.capability = capability.trim();
  }
  if (kind === 'TEACHER') {
    const request = step.request ?? payload.request;
    requireValue(isRecord(request) && nonEmptyString(request.request_id), 'AGENT_TEACHER_REQUEST_REQUIRED', 400);
    payload.request = clone(request);
  }
  if (step.input !== undefined) payload.input = clone(step.input);
  if (step.use_run_input !== undefined) {
    requireValue(typeof step.use_run_input === 'boolean', 'AGENT_STEP_RUN_INPUT_INVALID', 400);
    payload.use_run_input = step.use_run_input;
  }

  return {
    id,
    kind,
    depends_on: dependsOn,
    idempotent: step.idempotent === true,
    payload,
  };
}

export function normalizeAgentDefinition(input = {}) {
  requireValue(isRecord(input), 'AGENT_DEFINITION_INVALID', 400);
  requireValue(nonEmptyString(input.id), 'AGENT_ID_REQUIRED', 400);
  requireValue(nonEmptyString(input.version), 'AGENT_VERSION_REQUIRED', 400);
  requireValue(Array.isArray(input.steps) && input.steps.length > 0 && input.steps.length <= 64, 'AGENT_STEPS_REQUIRED', 400);
  const steps = input.steps.map(normalizeStep);
  const ids = steps.map(step => step.id);
  requireValue(new Set(ids).size === ids.length, 'AGENT_STEP_ID_DUPLICATE', 400);

  // Reuse the canonical Work DAG validator for dependency/cycle checks.
  createWorkDag({
    id: 'agent-definition-validation',
    jobId: `agent:${input.id.trim()}`,
    goal: input.goal || input.description || input.name || input.id,
    nodes: steps,
  });

  const requiredCapabilities = [...new Set(
    steps
      .filter(step => step.kind !== 'TEACHER')
      .map(step => step.payload.capability)
      .filter(Boolean),
  )].sort();

  return Object.freeze({
    id: input.id.trim(),
    version: input.version.trim(),
    name: nonEmptyString(input.name) ? input.name.trim() : input.id.trim(),
    description: typeof input.description === 'string' ? input.description.trim().slice(0, 2000) : '',
    goal: typeof input.goal === 'string' ? input.goal.trim().slice(0, 4000) : '',
    steps: Object.freeze(steps.map(step => Object.freeze(clone(step)))),
    required_capabilities: Object.freeze(requiredCapabilities),
    metadata: isRecord(input.metadata) ? Object.freeze(clone(input.metadata)) : Object.freeze({}),
  });
}

function rowToRecord(row) {
  requireValue(row, 'AGENT_NOT_FOUND', 404);
  let definition;
  try {
    definition = JSON.parse(row.definition_json);
  } catch {
    requireValue(false, 'AGENT_DEFINITION_CORRUPT', 500);
  }
  const normalized = normalizeAgentDefinition(definition);
  requireValue(VALID_STATUSES.has(row.status), 'AGENT_STATUS_CORRUPT', 500);
  return Object.freeze({
    ...clone(normalized),
    status: row.status,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  });
}

export function createInMemoryAgentRegistryAdapter({ now = () => Date.now() } = {}) {
  const records = new Map();

  return Object.freeze({
    async register(input = {}) {
      const definition = normalizeAgentDefinition(input.definition ?? input);
      const current = records.get(definition.id);
      if (current && current.version === definition.version) {
        requireValue(stableJson(current.definition) === stableJson(definition), 'AGENT_VERSION_CONFLICT', 409);
        if (current.status === ACTIVE) return rowToRecord({
          definition_json: stableJson(current.definition),
          status: current.status,
          created_at: current.created_at,
          updated_at: current.updated_at,
        });
      }
      const timestamp = now();
      const record = {
        definition,
        version: definition.version,
        status: ACTIVE,
        created_at: current?.created_at ?? timestamp,
        updated_at: timestamp,
      };
      records.set(definition.id, record);
      return rowToRecord({
        definition_json: stableJson(definition),
        status: record.status,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    },
    async get(input = {}) {
      const id = typeof input === 'string' ? input : input.agent_id ?? input.id;
      requireValue(nonEmptyString(id), 'AGENT_ID_REQUIRED', 400);
      const row = records.get(id.trim());
      requireValue(row, 'AGENT_NOT_FOUND', 404);
      return rowToRecord({
        definition_json: stableJson(row.definition),
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    },
    async list() {
      return [...records.values()]
        .sort((a, b) => a.definition.id.localeCompare(b.definition.id))
        .map(row => rowToRecord({
          definition_json: stableJson(row.definition),
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
    },
    async disable(input = {}) {
      const id = typeof input === 'string' ? input : input.agent_id ?? input.id;
      requireValue(nonEmptyString(id), 'AGENT_ID_REQUIRED', 400);
      const row = records.get(id.trim());
      requireValue(row, 'AGENT_NOT_FOUND', 404);
      row.status = DISABLED;
      row.updated_at = now();
      return rowToRecord({
        definition_json: stableJson(row.definition),
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    },
  });
}

export function createD1AgentRegistryAdapter(db, { now = () => Date.now() } = {}) {
  requireValue(db && typeof db.prepare === 'function', 'AGENT_REGISTRY_D1_REQUIRED', 500);
  let ready = null;
  const init = async () => {
    if (!ready) {
      ready = db.prepare(`CREATE TABLE IF NOT EXISTS agent_definitions (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        status TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`).run();
    }
    await ready;
  };

  async function getRow(id) {
    await init();
    return db.prepare('SELECT * FROM agent_definitions WHERE id=?').bind(id).first();
  }

  return Object.freeze({
    async register(input = {}) {
      await init();
      const definition = normalizeAgentDefinition(input.definition ?? input);
      const existing = await getRow(definition.id);
      if (existing && String(existing.version) === definition.version) {
        const current = rowToRecord(existing);
        requireValue(
          stableJson(normalizeAgentDefinition(current)) === stableJson(definition),
          'AGENT_VERSION_CONFLICT',
          409,
        );
        if (existing.status === ACTIVE) return current;
      }

      const timestamp = now();
      await db.prepare(`INSERT INTO agent_definitions(id,version,status,definition_json,created_at,updated_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          version=excluded.version,
          status=excluded.status,
          definition_json=excluded.definition_json,
          updated_at=excluded.updated_at`)
        .bind(
          definition.id,
          definition.version,
          ACTIVE,
          stableJson(definition),
          existing ? Number(existing.created_at) : timestamp,
          timestamp,
        ).run();
      return rowToRecord(await getRow(definition.id));
    },

    async get(input = {}) {
      const id = typeof input === 'string' ? input : input.agent_id ?? input.id;
      requireValue(nonEmptyString(id), 'AGENT_ID_REQUIRED', 400);
      return rowToRecord(await getRow(id.trim()));
    },

    async list(input = {}) {
      await init();
      const status = input.status;
      requireValue(status === undefined || VALID_STATUSES.has(status), 'AGENT_STATUS_INVALID', 400);
      const limit = input.limit ?? 100;
      requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'AGENT_LIMIT_INVALID', 400);
      const query = status === undefined
        ? db.prepare('SELECT * FROM agent_definitions ORDER BY id ASC LIMIT ?').bind(limit)
        : db.prepare('SELECT * FROM agent_definitions WHERE status=? ORDER BY id ASC LIMIT ?').bind(status, limit);
      return ((await query.all()).results || []).map(rowToRecord);
    },

    async disable(input = {}) {
      const id = typeof input === 'string' ? input : input.agent_id ?? input.id;
      requireValue(nonEmptyString(id), 'AGENT_ID_REQUIRED', 400);
      const current = await getRow(id.trim());
      requireValue(current, 'AGENT_NOT_FOUND', 404);
      await db.prepare('UPDATE agent_definitions SET status=?,updated_at=? WHERE id=?')
        .bind(DISABLED, now(), id.trim())
        .run();
      return rowToRecord(await getRow(id.trim()));
    },
  });
}

export const AGENT_STATUSES = Object.freeze({ ACTIVE, DISABLED });
