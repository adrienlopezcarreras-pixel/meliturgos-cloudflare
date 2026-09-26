import { DomainError, requireValue } from '../core/contracts.js';
import { RUN_STATUSES } from '../automations/agent-automation-policy.js';

function runtimeError(code, status = 500) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedNodes(nodes) {
  requireValue(Array.isArray(nodes) && nodes.length >= 1 && nodes.length <= 64, 'AGENT_WORK_NODES_INVALID', 400);
  return nodes;
}

function workCapabilities(nodes) {
  const capabilities = new Set();
  for (const node of boundedNodes(nodes)) {
    const kind = text(node?.kind || 'TASK').toUpperCase();
    if (kind === 'TASK') {
      const capability = text(node?.payload?.capability);
      requireValue(capability, 'AGENT_WORK_CAPABILITY_REQUIRED', 400);
      requireValue(!capability.startsWith('work.'), 'AGENT_WORK_RECURSIVE_CAPABILITY_DENIED', 400);
      capabilities.add(capability);
    } else if (kind === 'AUGMENTIO') {
      capabilities.add('augmentio.fanout');
    } else {
      throw runtimeError('AGENT_WORK_NODE_KIND_DENIED', 400);
    }
  }
  return [...capabilities].sort((a, b) => a.localeCompare(b));
}

function councilConfig(value) {
  if (value == null) return null;
  requireValue(record(value), 'AGENT_COUNCIL_CONFIG_INVALID', 400);
  if (value.enabled === false) return null;
  const capability = text(value.capability || 'GENERAL');
  requireValue(capability, 'AGENT_COUNCIL_CAPABILITY_INVALID', 400);
  const maxCandidates = Math.max(2, Math.min(12, Number(value.max_candidates) || 4));
  const timeoutMs = Math.max(100, Math.min(120000, Number(value.timeout_ms) || 30000));
  return {
    capability,
    maxCandidates,
    timeoutMs,
  };
}

function normalizedGrant(grant) {
  requireValue(record(grant), 'AGENT_WORK_GRANTS_REQUIRED', 500);
  requireValue(Array.isArray(grant.capabilities), 'AGENT_WORK_GRANT_CAPABILITIES_REQUIRED', 500);
  const capabilities = [...new Set(grant.capabilities.map(text).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  requireValue(text(grant.tier), 'AGENT_WORK_GRANT_TIER_REQUIRED', 500);
  return {
    capabilities,
    tier: text(grant.tier),
    approved: grant.approved === true,
    provenance: record(grant.provenance) ? structuredClone(grant.provenance) : {},
  };
}

/**
 * Permissioned bridge from a registered Agent into the existing Work Engine.
 *
 * The agent never supplies its own effective grants. resolveGrants() is a
 * server-side dependency and Work child capabilities must be a subset of the
 * policy capabilities authorized by AgentAutomationGuard.
 */
export class GuardedAgentWorkRunner {
  constructor({
    guard,
    bus,
    resolveGrants,
    now = () => Date.now(),
  } = {}) {
    if (!guard || typeof guard.authorizeRun !== 'function'
      || typeof guard.completeRun !== 'function'
      || typeof guard.failRun !== 'function') {
      throw new Error('AGENT_WORK_GUARD_REQUIRED');
    }
    if (!bus || typeof bus.execute !== 'function') throw new Error('AGENT_WORK_BUS_REQUIRED');
    if (typeof resolveGrants !== 'function') throw new Error('AGENT_WORK_GRANT_RESOLVER_REQUIRED');
    this.guard = guard;
    this.bus = bus;
    this.resolveGrants = resolveGrants;
    this.now = now;
  }

  async execute(input = {}, context = {}) {
    const owner = text(context.owner);
    requireValue(owner, 'AGENT_WORK_OWNER_REQUIRED', 401);
    requireValue(record(input), 'AGENT_WORK_REQUEST_INVALID', 400);
    requireValue(record(input.policy), 'AGENT_WORK_POLICY_REQUIRED', 400);
    requireValue(record(input.work), 'AGENT_WORK_DEFINITION_REQUIRED', 400);

    const runId = text(input.run_id);
    const idempotencyKey = text(input.idempotency_key);
    requireValue(runId, 'AUTOMATION_RUN_ID_INVALID', 400);
    requireValue(idempotencyKey, 'AUTOMATION_IDEMPOTENCY_KEY_INVALID', 400);

    const policyCapabilities = new Set(
      Array.isArray(input.policy.required_capabilities)
        ? input.policy.required_capabilities.map(text).filter(Boolean)
        : []
    );
    const requiredByWork = workCapabilities(input.work.nodes);
    const council = councilConfig(input.council);
    const requiredCapabilities = council
      ? [...new Set([...requiredByWork, 'model.council'])].sort((a,b)=>a.localeCompare(b))
      : requiredByWork;
    const undeclared = requiredCapabilities.filter(capability => !policyCapabilities.has(capability));
    requireValue(undeclared.length === 0, 'AGENT_WORK_CAPABILITY_UNDECLARED', 403);

    const grant = normalizedGrant(await this.resolveGrants({
      owner,
      context,
      policy: structuredClone(input.policy),
      required_capabilities: requiredCapabilities,
    }));

    const authorized = await this.guard.authorizeRun({
      run_id: runId,
      idempotency_key: idempotencyKey,
      owner,
      granted_capabilities: grant.capabilities,
      granted_tier: grant.tier,
      requested_at: this.now(),
      approved: grant.approved,
      policy: structuredClone(input.policy),
    }, context);

    if (authorized.claim.status === RUN_STATUSES.COMPLETED
      || authorized.claim.status === RUN_STATUSES.FAILED) {
      return {
        claim: authorized.claim,
        deduplicated: true,
        work: null,
        executed: false,
        terminal: true,
      };
    }

    const workId = text(input.work.id) || `agent:${runId}`;
    const createInput = {
      id: workId,
      jobId: text(input.work.jobId) || `agent:${text(input.policy.agent_id)}:${runId}`.slice(0, 200),
      goal: text(input.work.goal),
      nodes: structuredClone(input.work.nodes),
      ...(text(input.work.candidateBranch) ? { candidateBranch: text(input.work.candidateBranch) } : {}),
      ...(text(input.work.candidateSha) ? { candidateSha: text(input.work.candidateSha) } : {}),
    };
    requireValue(createInput.goal, 'AGENT_WORK_GOAL_REQUIRED', 400);

    try {
      let councilResult = null;
      if (council) {
        councilResult = await this.bus.execute('model.council', {
          request: {
            goal: createInput.goal,
            agent_id: text(input.policy.agent_id),
            automation_id: text(input.policy.automation_id),
            run_id: runId,
            work: {
              id: workId,
              node_count: input.work.nodes.length,
              capabilities: requiredByWork,
            },
          },
          capability: council.capability,
          maxCandidates: council.maxCandidates,
          timeoutMs: council.timeoutMs,
        }, context);
        requireValue(councilResult && typeof councilResult === 'object', 'AGENT_COUNCIL_RESULT_INVALID', 502);
      }

      let created = null;
      if (authorized.deduplicated) {
        try {
          created = await this.bus.execute('work.status', { id: workId }, context);
        } catch (error) {
          if (error?.code !== 'WORK_DAG_NOT_FOUND' && error?.message !== 'WORK_DAG_NOT_FOUND') throw error;
        }
      }
      if (!created) {
        created = await this.bus.execute('work.create', createInput, context);
      }

      if (input.execute_now === false) {
        return {
          claim: authorized.claim,
          deduplicated: authorized.deduplicated,
          work: created,
          executed: false,
          terminal: false,
          grant_provenance: grant.provenance,
          council: councilResult,
        };
      }

      const state = created?.completed === true
        ? created
        : await this.bus.execute('work.run', { id: workId }, context);

      if (state?.completed === true) {
        const completed = await this.guard.completeRun({
          run_id: runId,
          completed_at: this.now(),
          result: {
            work_id: workId,
            work_status: text(state.status),
            completed: true,
          },
        }, context);
        return {
          claim: completed,
          deduplicated: authorized.deduplicated,
          work: state,
          executed: true,
          terminal: true,
          grant_provenance: grant.provenance,
          council: councilResult,
        };
      }

      return {
        claim: authorized.claim,
        deduplicated: authorized.deduplicated,
        work: state,
        executed: true,
        terminal: false,
        grant_provenance: grant.provenance,
        council: councilResult,
      };
    } catch (error) {
      try {
        await this.guard.failRun({
          run_id: runId,
          failed_at: this.now(),
          error_code: text(error?.code || error?.message || error) || 'AGENT_WORK_FAILED',
          result: {
            work_id: workId,
            retryable: error?.retryable === true,
          },
        }, context);
      } catch {
        // Preserve the original Work error. Terminal-claim conflicts remain
        // observable through the policy store and must not mask root cause.
      }
      throw error;
    }
  }
}
