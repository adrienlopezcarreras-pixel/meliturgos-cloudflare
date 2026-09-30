import { DomainError, requireValue } from '../core/contracts.js';
import {
  PERMISSION_TIERS,
  RUN_STATUSES,
  automationExecutionPolicy,
  authorizeRunRequest,
  listRunsRequest,
} from './agent-automation-policy.js';

const TIER_RANK = Object.freeze({
  [PERMISSION_TIERS.READ]: 0,
  [PERMISSION_TIERS.SAFE_WRITE]: 1,
  [PERMISSION_TIERS.SENSITIVE]: 2,
  [PERMISSION_TIERS.DESTRUCTIVE]: 3,
});

function automationError(code, status = 500) {
  return new DomainError(code, status);
}

function parseJson(value, code) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    throw automationError(code, 500);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  return String(value ?? '').trim();
}

function completionRequest(input = {}, kind) {
  requireValue(isRecord(input), `AUTOMATION_${kind}_INVALID`, 400);
  requireValue(text(input.run_id), 'AUTOMATION_RUN_ID_INVALID', 400);
  const field = kind === 'COMPLETE' ? 'completed_at' : 'failed_at';
  requireValue(Number.isFinite(input[field]), `AUTOMATION_${kind}_TIME_INVALID`, 400);
  if (kind === 'FAIL') requireValue(text(input.error_code), 'AUTOMATION_FAILURE_CODE_INVALID', 400);
  return {
    run_id: text(input.run_id),
    [field]: input[field],
    ...(kind === 'FAIL' ? { error_code: text(input.error_code) } : {}),
    ...(isRecord(input.result) ? { result: structuredClone(input.result) } : {}),
  };
}

function rowSnapshot(row) {
  if (!row) return null;
  return {
    run_id: row.run_id,
    automation_id: row.automation_id,
    agent_id: row.agent_id,
    owner: row.owner,
    idempotency_key: row.idempotency_key,
    required_capabilities: parseJson(row.required_capabilities_json, 'AUTOMATION_CAPABILITIES_CORRUPT'),
    permission_tier: row.permission_tier,
    status: row.status,
    requested_at: Number(row.requested_at),
    ...(row.completed_at != null ? { completed_at: Number(row.completed_at) } : {}),
    ...(row.failed_at != null ? { failed_at: Number(row.failed_at) } : {}),
    ...(row.error_code ? { error_code: row.error_code } : {}),
    ...(row.result_json ? { result: parseJson(row.result_json, 'AUTOMATION_RESULT_CORRUPT') } : {}),
  };
}

export class D1AgentAutomationPolicyAdapter {
  constructor(db) {
    if (!db) throw automationError('AUTOMATION_DB_REQUIRED', 503);
    this.db = db;
    this._ready = false;
  }

  async ready() {
    if (this._ready) return this;
    await this.db.prepare(`CREATE TABLE IF NOT EXISTS agent_automation_runs (
      run_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      automation_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      owner TEXT NOT NULL,
      required_capabilities_json TEXT NOT NULL,
      permission_tier TEXT NOT NULL,
      status TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      completed_at INTEGER,
      failed_at INTEGER,
      error_code TEXT,
      result_json TEXT,
      policy_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`).run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_automation_runs_owner ON agent_automation_runs(owner,status,requested_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_automation_runs_automation ON agent_automation_runs(automation_id,status,requested_at)').run();
    await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_agent_automation_runs_agent ON agent_automation_runs(agent_id,status,requested_at)').run();
    this._ready = true;
    return this;
  }

  async rowByRunId(runId) {
    await this.ready();
    return this.db.prepare('SELECT * FROM agent_automation_runs WHERE run_id=?').bind(runId).first();
  }

  async rowByIdempotency(key) {
    await this.ready();
    return this.db.prepare('SELECT * FROM agent_automation_runs WHERE idempotency_key=?').bind(key).first();
  }

  async authorizeRun(input) {
    await this.ready();
    requireValue(isRecord(input), 'AUTOMATION_RUN_INVALID', 400);
    const policy = automationExecutionPolicy(input.policy);
    const request = authorizeRunRequest(input);
    requireValue(policy.enabled, 'AUTOMATION_DISABLED', 409);

    const existingIdem = await this.rowByIdempotency(request.idempotency_key);
    if (existingIdem) {
      requireValue(
        existingIdem.automation_id === policy.automation_id
          && existingIdem.owner === request.owner
          && existingIdem.run_id === request.run_id,
        'AUTOMATION_IDEMPOTENCY_CONFLICT',
        409,
      );
      return { claim: rowSnapshot(existingIdem), deduplicated: true };
    }

    requireValue(!(await this.rowByRunId(request.run_id)), 'AUTOMATION_RUN_ID_EXISTS', 409);
    requireValue(
      TIER_RANK[request.granted_tier] >= TIER_RANK[policy.permission_tier],
      'AUTOMATION_PERMISSION_TIER_DENIED',
      403,
    );
    const grants = new Set(request.granted_capabilities);
    const missing = policy.required_capabilities.filter(capability => !grants.has(capability));
    requireValue(missing.length === 0, 'AUTOMATION_CAPABILITY_DENIED', 403);
    requireValue(
      policy.permission_tier !== PERMISSION_TIERS.DESTRUCTIVE || request.approved,
      'AUTOMATION_EXPLICIT_APPROVAL_REQUIRED',
      403,
    );

    try {
      await this.db.prepare(`INSERT INTO agent_automation_runs(
        run_id,idempotency_key,automation_id,agent_id,owner,
        required_capabilities_json,permission_tier,status,requested_at,
        completed_at,failed_at,error_code,result_json,policy_json,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        request.run_id,
        request.idempotency_key,
        policy.automation_id,
        policy.agent_id,
        request.owner,
        JSON.stringify(policy.required_capabilities),
        policy.permission_tier,
        RUN_STATUSES.AUTHORIZED,
        request.requested_at,
        null,
        null,
        null,
        null,
        JSON.stringify(policy),
        request.requested_at,
      ).run();
    } catch (error) {
      const racedIdem = await this.rowByIdempotency(request.idempotency_key);
      if (racedIdem) {
        requireValue(
          racedIdem.automation_id === policy.automation_id
            && racedIdem.owner === request.owner
            && racedIdem.run_id === request.run_id,
          'AUTOMATION_IDEMPOTENCY_CONFLICT',
          409,
        );
        return { claim: rowSnapshot(racedIdem), deduplicated: true };
      }
      if (await this.rowByRunId(request.run_id)) throw automationError('AUTOMATION_RUN_ID_EXISTS', 409);
      throw error;
    }

    const inserted = await this.rowByRunId(request.run_id);
    if (!inserted) throw automationError('AUTOMATION_RUN_INSERT_FAILED', 500);
    return { claim: rowSnapshot(inserted), deduplicated: false };
  }

  async completeRun(input) {
    await this.ready();
    const request = completionRequest(input, 'COMPLETE');
    const current = await this.rowByRunId(request.run_id);
    requireValue(current, 'AUTOMATION_RUN_NOT_FOUND', 404);
    if (current.status === RUN_STATUSES.COMPLETED) return rowSnapshot(current);
    requireValue(current.status === RUN_STATUSES.AUTHORIZED, 'AUTOMATION_RUN_NOT_ACTIVE', 409);

    const changed = await this.db.prepare(`UPDATE agent_automation_runs
      SET status=?, completed_at=?, result_json=?, updated_at=?
      WHERE run_id=? AND status=?`).bind(
      RUN_STATUSES.COMPLETED,
      request.completed_at,
      request.result ? JSON.stringify(request.result) : null,
      request.completed_at,
      request.run_id,
      RUN_STATUSES.AUTHORIZED,
    ).run();
    requireValue(Boolean(changed?.meta?.changes), 'AUTOMATION_COMPLETE_RACE_LOST', 409);
    return rowSnapshot(await this.rowByRunId(request.run_id));
  }

  async failRun(input) {
    await this.ready();
    const request = completionRequest(input, 'FAIL');
    const current = await this.rowByRunId(request.run_id);
    requireValue(current, 'AUTOMATION_RUN_NOT_FOUND', 404);
    if (current.status === RUN_STATUSES.FAILED) {
      requireValue(current.error_code === request.error_code, 'AUTOMATION_FAILURE_CONFLICT', 409);
      return rowSnapshot(current);
    }
    requireValue(current.status === RUN_STATUSES.AUTHORIZED, 'AUTOMATION_RUN_NOT_ACTIVE', 409);

    const changed = await this.db.prepare(`UPDATE agent_automation_runs
      SET status=?, failed_at=?, error_code=?, result_json=?, updated_at=?
      WHERE run_id=? AND status=?`).bind(
      RUN_STATUSES.FAILED,
      request.failed_at,
      request.error_code,
      request.result ? JSON.stringify(request.result) : null,
      request.failed_at,
      request.run_id,
      RUN_STATUSES.AUTHORIZED,
    ).run();
    requireValue(Boolean(changed?.meta?.changes), 'AUTOMATION_FAIL_RACE_LOST', 409);
    return rowSnapshot(await this.rowByRunId(request.run_id));
  }

  async getRun(input = {}) {
    const runId = text(input?.run_id);
    requireValue(runId, 'AUTOMATION_RUN_ID_INVALID', 400);
    const row = await this.rowByRunId(runId);
    requireValue(row, 'AUTOMATION_RUN_NOT_FOUND', 404);
    return rowSnapshot(row);
  }

  async listRuns(input = {}) {
    await this.ready();
    const query = listRunsRequest(input);
    const clauses = [];
    const args = [];
    if (query.status !== undefined) {
      clauses.push('status=?');
      args.push(query.status);
    }
    if (query.automation_id !== undefined) {
      clauses.push('automation_id=?');
      args.push(query.automation_id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.db.prepare(
      `SELECT * FROM agent_automation_runs ${where}
       ORDER BY requested_at ASC, run_id ASC LIMIT ?`
    ).bind(...args, query.limit).all();
    return (result.results || []).map(rowSnapshot);
  }
}

export function createD1AgentAutomationPolicyAdapter(db) {
  return new D1AgentAutomationPolicyAdapter(db);
}
