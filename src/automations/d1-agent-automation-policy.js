import { requireValue } from '../core/contracts.js';
import {
  PERMISSION_TIERS,
  RUN_STATUSES,
  authorizeRunRequest,
  automationExecutionPolicy,
  listRunsRequest,
} from './agent-automation-policy.js';

const TIER_RANK = Object.freeze({
  [PERMISSION_TIERS.READ]: 0,
  [PERMISSION_TIERS.SAFE_WRITE]: 1,
  [PERMISSION_TIERS.SENSITIVE]: 2,
  [PERMISSION_TIERS.DESTRUCTIVE]: 3,
});

const clone = value => value == null ? value : structuredClone(value);

function parseJson(value, code) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    requireValue(false, code, 500);
  }
}

function rowSnapshot(row) {
  requireValue(row, 'AUTOMATION_RUN_NOT_FOUND', 404);
  const policy = parseJson(row.policy_json, 'AUTOMATION_RUN_POLICY_CORRUPT');
  return Object.freeze({
    run_id: String(row.run_id),
    automation_id: String(row.automation_id),
    agent_id: String(row.agent_id),
    owner: String(row.owner),
    idempotency_key: String(row.idempotency_key),
    required_capabilities: clone(policy.required_capabilities || []),
    permission_tier: policy.permission_tier,
    metadata: clone(policy.metadata || {}),
    status: String(row.status),
    requested_at: Number(row.requested_at),
    ...(row.completed_at == null ? {} : { completed_at: Number(row.completed_at) }),
    ...(row.failed_at == null ? {} : { failed_at: Number(row.failed_at) }),
    ...(row.error_code ? { error_code: String(row.error_code) } : {}),
    ...(row.result_json ? { result: parseJson(row.result_json, 'AUTOMATION_RUN_RESULT_CORRUPT') } : {}),
  });
}

export function createD1AgentAutomationPolicyAdapter(db) {
  requireValue(db && typeof db.prepare === 'function', 'AUTOMATION_POLICY_D1_REQUIRED', 500);
  let ready = null;
  const init = async () => {
    if (!ready) {
      ready = db.prepare(`CREATE TABLE IF NOT EXISTS automation_run_claims (
        run_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        automation_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        owner TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at INTEGER NOT NULL,
        completed_at INTEGER,
        failed_at INTEGER,
        error_code TEXT,
        result_json TEXT
      )`).run();
    }
    await ready;
  };

  async function byRun(id) {
    await init();
    return db.prepare('SELECT * FROM automation_run_claims WHERE run_id=?').bind(id).first();
  }

  async function byIdempotency(key) {
    await init();
    return db.prepare('SELECT * FROM automation_run_claims WHERE idempotency_key=?').bind(key).first();
  }

  return Object.freeze({
    async authorizeRun(input = {}) {
      await init();
      const policy = automationExecutionPolicy(input.policy);
      const request = authorizeRunRequest(input);
      requireValue(policy.enabled, 'AUTOMATION_DISABLED', 409);

      const existing = await byIdempotency(request.idempotency_key);
      if (existing) {
        const claim = rowSnapshot(existing);
        requireValue(
          claim.automation_id === policy.automation_id
            && claim.agent_id === policy.agent_id
            && claim.owner === request.owner
            && claim.run_id === request.run_id,
          'AUTOMATION_IDEMPOTENCY_CONFLICT',
          409,
        );
        return { claim, deduplicated: true };
      }

      requireValue(TIER_RANK[request.granted_tier] >= TIER_RANK[policy.permission_tier], 'AUTOMATION_PERMISSION_TIER_DENIED', 403);
      const grants = new Set(request.granted_capabilities);
      const missing = policy.required_capabilities.filter(capability => !grants.has(capability));
      requireValue(missing.length === 0, 'AUTOMATION_CAPABILITY_DENIED', 403);
      requireValue(
        policy.permission_tier !== PERMISSION_TIERS.DESTRUCTIVE || request.approved,
        'AUTOMATION_EXPLICIT_APPROVAL_REQUIRED',
        403,
      );

      try {
        await db.prepare(`INSERT INTO automation_run_claims(
          run_id,idempotency_key,automation_id,agent_id,owner,policy_json,status,requested_at
        ) VALUES(?,?,?,?,?,?,?,?)`).bind(
          request.run_id,
          request.idempotency_key,
          policy.automation_id,
          policy.agent_id,
          request.owner,
          JSON.stringify(policy),
          RUN_STATUSES.AUTHORIZED,
          request.requested_at,
        ).run();
      } catch (error) {
        const raced = await byIdempotency(request.idempotency_key);
        if (!raced) throw error;
        const claim = rowSnapshot(raced);
        requireValue(
          claim.automation_id === policy.automation_id
            && claim.agent_id === policy.agent_id
            && claim.owner === request.owner
            && claim.run_id === request.run_id,
          'AUTOMATION_IDEMPOTENCY_CONFLICT',
          409,
        );
        return { claim, deduplicated: true };
      }

      return { claim: rowSnapshot(await byRun(request.run_id)), deduplicated: false };
    },

    async completeRun(input = {}) {
      requireValue(typeof input.run_id === 'string' && input.run_id.trim(), 'AUTOMATION_RUN_ID_INVALID', 400);
      requireValue(Number.isFinite(input.completed_at), 'AUTOMATION_COMPLETE_TIME_INVALID', 400);
      const row = await byRun(input.run_id.trim());
      const claim = rowSnapshot(row);
      if (claim.status === RUN_STATUSES.COMPLETED) return claim;
      requireValue(claim.status === RUN_STATUSES.AUTHORIZED, 'AUTOMATION_RUN_NOT_ACTIVE', 409);
      await db.prepare(`UPDATE automation_run_claims
        SET status=?,completed_at=?,result_json=?
        WHERE run_id=? AND status=?`).bind(
          RUN_STATUSES.COMPLETED,
          input.completed_at,
          JSON.stringify(input.result || {}),
          claim.run_id,
          RUN_STATUSES.AUTHORIZED,
        ).run();
      return rowSnapshot(await byRun(claim.run_id));
    },

    async failRun(input = {}) {
      requireValue(typeof input.run_id === 'string' && input.run_id.trim(), 'AUTOMATION_RUN_ID_INVALID', 400);
      requireValue(Number.isFinite(input.failed_at), 'AUTOMATION_FAIL_TIME_INVALID', 400);
      requireValue(typeof input.error_code === 'string' && input.error_code.trim(), 'AUTOMATION_FAILURE_CODE_INVALID', 400);
      const row = await byRun(input.run_id.trim());
      const claim = rowSnapshot(row);
      if (claim.status === RUN_STATUSES.FAILED) {
        requireValue(claim.error_code === input.error_code.trim(), 'AUTOMATION_FAILURE_CONFLICT', 409);
        return claim;
      }
      requireValue(claim.status === RUN_STATUSES.AUTHORIZED, 'AUTOMATION_RUN_NOT_ACTIVE', 409);
      await db.prepare(`UPDATE automation_run_claims
        SET status=?,failed_at=?,error_code=?,result_json=?
        WHERE run_id=? AND status=?`).bind(
          RUN_STATUSES.FAILED,
          input.failed_at,
          input.error_code.trim(),
          JSON.stringify(input.result || {}),
          claim.run_id,
          RUN_STATUSES.AUTHORIZED,
        ).run();
      return rowSnapshot(await byRun(claim.run_id));
    },

    async getRun(input = {}) {
      requireValue(typeof input.run_id === 'string' && input.run_id.trim(), 'AUTOMATION_RUN_ID_INVALID', 400);
      return rowSnapshot(await byRun(input.run_id.trim()));
    },

    async listRuns(input = {}) {
      await init();
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
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      args.push(query.limit);
      const result = await db.prepare(`SELECT * FROM automation_run_claims${where}
        ORDER BY requested_at ASC,run_id ASC LIMIT ?`).bind(...args).all();
      return (result.results || []).map(rowSnapshot);
    },
  });
}
