import { DomainError, requireValue } from '../core/contracts.js';
import { PERMISSION_TIERS } from '../automations/agent-automation-policy.js';

const TIER_RANK = Object.freeze({
  [PERMISSION_TIERS.READ]: 0,
  [PERMISSION_TIERS.SAFE_WRITE]: 1,
  [PERMISSION_TIERS.SENSITIVE]: 2,
  [PERMISSION_TIERS.DESTRUCTIVE]: 3,
});

function agentError(code, status = 500) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function strings(value, code, { min = 0, max = 128 } = {}) {
  requireValue(Array.isArray(value) && value.length >= min && value.length <= max, code, 400);
  const rows = value.map(item => {
    const normalized = text(item);
    requireValue(normalized.length > 0 && normalized.length <= 160, code, 400);
    return normalized;
  });
  requireValue(new Set(rows).size === rows.length, code + '_DUPLICATE', 400);
  return rows.sort((a,b) => a.localeCompare(b));
}

function ownerFrom(context = {}) {
  const owner = text(context.owner);
  requireValue(owner, 'AGENT_OWNER_REQUIRED', 401);
  return owner;
}

export function agentDescriptor(input = {}) {
  requireValue(record(input), 'AGENT_INVALID', 400);
  const id = text(input.agent_id ?? input.id);
  const name = text(input.name);
  const role = text(input.role);
  requireValue(id && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(id), 'AGENT_ID_INVALID', 400);
  requireValue(name && name.length <= 200, 'AGENT_NAME_INVALID', 400);
  requireValue(role && role.length <= 500, 'AGENT_ROLE_INVALID', 400);
  requireValue(Object.hasOwn(TIER_RANK, input.permission_ceiling), 'AGENT_PERMISSION_CEILING_INVALID', 400);
  requireValue(input.enabled === undefined || typeof input.enabled === 'boolean', 'AGENT_ENABLED_INVALID', 400);
  requireValue(input.metadata === undefined || record(input.metadata), 'AGENT_METADATA_INVALID', 400);

  return {
    agent_id: id,
    name,
    role,
    capabilities: strings(input.capabilities ?? [], 'AGENT_CAPABILITIES_INVALID', { min: 1 }),
    permission_ceiling: input.permission_ceiling,
    enabled: input.enabled ?? true,
    metadata: structuredClone(input.metadata || {}),
  };
}

function rowToAgent(row) {
  if (!row) return null;
  let capabilities;
  let metadata;
  try {
    capabilities = JSON.parse(row.capabilities_json);
    metadata = JSON.parse(row.metadata_json || '{}');
  } catch {
    throw agentError('AGENT_RECORD_CORRUPT', 500);
  }
  return {
    owner: row.owner,
    agent_id: row.agent_id,
    name: row.name,
    role: row.role,
    capabilities,
    permission_ceiling: row.permission_ceiling,
    enabled: Boolean(row.enabled),
    metadata,
    created_at: Number(row.created_at),
    updated_at: Number(row.updated_at),
  };
}

export class D1AgentRegistryAdapter {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db) throw agentError('AGENT_DB_REQUIRED', 503);
    this.db = db;
    this.now = now;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS mel_agents (
      owner TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,
      permission_ceiling TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(owner, agent_id)
    )`).run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_mel_agents_enabled ON mel_agents(owner,enabled,agent_id)').run();
    this._ready = true;
    return this;
  }

  async register(input, context = {}) {
    await this.ready();
    const owner = ownerFrom(context);
    const agent = agentDescriptor(input);
    const existing = await this.db.prepare(
      'SELECT * FROM mel_agents WHERE owner=? AND agent_id=?'
    ).bind(owner, agent.agent_id).first();
    requireValue(!existing, 'AGENT_EXISTS', 409);
    const at = this.now();

    try {
      await this.db.prepare(`INSERT INTO mel_agents(
        owner,agent_id,name,role,capabilities_json,permission_ceiling,
        enabled,metadata_json,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
        owner,
        agent.agent_id,
        agent.name,
        agent.role,
        JSON.stringify(agent.capabilities),
        agent.permission_ceiling,
        agent.enabled ? 1 : 0,
        JSON.stringify(agent.metadata),
        at,
        at,
      ).run();
    } catch (error) {
      const raced = await this.db.prepare(
        'SELECT * FROM mel_agents WHERE owner=? AND agent_id=?'
      ).bind(owner, agent.agent_id).first();
      if (raced) throw agentError('AGENT_EXISTS', 409);
      throw error;
    }
    return this.get({ agent_id: agent.agent_id }, context);
  }

  async get(input = {}, context = {}) {
    await this.ready();
    const owner = ownerFrom(context);
    const id = text(input.agent_id ?? input.id);
    requireValue(id, 'AGENT_ID_INVALID', 400);
    const row = await this.db.prepare(
      'SELECT * FROM mel_agents WHERE owner=? AND agent_id=?'
    ).bind(owner, id).first();
    requireValue(row, 'AGENT_NOT_FOUND', 404);
    return rowToAgent(row);
  }

  async list(input = {}, context = {}) {
    await this.ready();
    const owner = ownerFrom(context);
    requireValue(input && typeof input === 'object' && !Array.isArray(input), 'AGENT_LIST_INVALID', 400);
    requireValue(input.enabled === undefined || typeof input.enabled === 'boolean', 'AGENT_ENABLED_INVALID', 400);
    const limit = input.limit ?? 100;
    requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'AGENT_LIST_LIMIT_INVALID', 400);

    const result = input.enabled === undefined
      ? await this.db.prepare(
          'SELECT * FROM mel_agents WHERE owner=? ORDER BY agent_id ASC LIMIT ?'
        ).bind(owner, limit).all()
      : await this.db.prepare(
          'SELECT * FROM mel_agents WHERE owner=? AND enabled=? ORDER BY agent_id ASC LIMIT ?'
        ).bind(owner, input.enabled ? 1 : 0, limit).all();
    return (result.results || []).map(rowToAgent);
  }

  async disable(input = {}, context = {}) {
    await this.ready();
    const owner = ownerFrom(context);
    const id = text(input.agent_id ?? input.id);
    requireValue(id, 'AGENT_ID_INVALID', 400);
    const current = await this.get({ agent_id: id }, context);
    if (!current.enabled) return current;
    const at = this.now();
    const changed = await this.db.prepare(
      'UPDATE mel_agents SET enabled=0,updated_at=? WHERE owner=? AND agent_id=? AND enabled=1'
    ).bind(at, owner, id).run();
    requireValue(Boolean(changed?.meta?.changes), 'AGENT_DISABLE_RACE_LOST', 409);
    return this.get({ agent_id: id }, context);
  }
}

export class AgentAutomationGuard {
  constructor({ agentRegistry, policy }) {
    if (!agentRegistry || typeof agentRegistry.get !== 'function') throw new Error('AGENT_GUARD_REGISTRY_REQUIRED');
    if (!policy
      || typeof policy.authorizeRun !== 'function'
      || typeof policy.completeRun !== 'function'
      || typeof policy.failRun !== 'function'
      || typeof policy.getRun !== 'function') {
      throw new Error('AGENT_GUARD_POLICY_REQUIRED');
    }
    this.agentRegistry = agentRegistry;
    this.policy = policy;
  }

  async authorizeRun(input, context = {}) {
    const owner = ownerFrom(context);
    requireValue(record(input), 'AUTOMATION_RUN_INVALID', 400);
    const policy = input.policy;
    requireValue(record(policy), 'AUTOMATION_POLICY_INVALID', 400);
    const agent = await this.agentRegistry.get({ agent_id: policy.agent_id }, context);
    requireValue(agent.enabled, 'AUTOMATION_AGENT_DISABLED', 409);

    const required = strings(policy.required_capabilities ?? [], 'AUTOMATION_REQUIRED_CAPABILITIES_INVALID', { min: 1 });
    const agentCaps = new Set(agent.capabilities);
    requireValue(required.every(capability => agentCaps.has(capability)), 'AUTOMATION_AGENT_CAPABILITY_DENIED', 403);
    requireValue(
      Object.hasOwn(TIER_RANK, policy.permission_tier)
        && TIER_RANK[policy.permission_tier] <= TIER_RANK[agent.permission_ceiling],
      'AUTOMATION_AGENT_TIER_DENIED',
      403,
    );

    return this.policy.authorizeRun({
      ...input,
      owner,
      policy: {
        ...policy,
        agent_id: agent.agent_id,
        required_capabilities: required,
      },
    });
  }

  async completeRun(input, context = {}) {
    return this.#ownerScopedTerminal('completeRun', input, context);
  }

  async failRun(input, context = {}) {
    return this.#ownerScopedTerminal('failRun', input, context);
  }

  async #ownerScopedTerminal(method, input, context) {
    const owner = ownerFrom(context);
    const run = await this.policy.getRun({ run_id: input?.run_id });
    requireValue(run.owner === owner, 'AUTOMATION_RUN_OWNER_MISMATCH', 403);
    return this.policy[method](input);
  }
}

export function createD1AgentRegistryAdapter(db, options = {}) {
  return new D1AgentRegistryAdapter(db, options);
}
