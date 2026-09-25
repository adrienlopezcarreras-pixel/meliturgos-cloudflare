import { requireValue } from '../core/contracts.js';
import { RUN_STATUSES } from './agent-automation-policy.js';

const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = value => value == null ? value : structuredClone(value);

export function createAgentAutomationRunnerAdapter({
  policy,
  agentRuntime,
  now = () => Date.now(),
} = {}) {
  requireValue(
    policy
      && typeof policy.authorizeRun === 'function'
      && typeof policy.completeRun === 'function'
      && typeof policy.failRun === 'function'
      && typeof policy.getRun === 'function',
    'AUTOMATION_POLICY_REQUIRED',
    500,
  );
  requireValue(
    agentRuntime
      && typeof agentRuntime.run === 'function'
      && typeof agentRuntime.cancel === 'function',
    'AUTOMATION_AGENT_RUNTIME_REQUIRED',
    500,
  );

  async function executeClaim(claim, context = {}) {
    const metadata = isRecord(claim.metadata) ? claim.metadata : {};
    try {
      const work = await agentRuntime.run({
        agent_id: claim.agent_id,
        run_id: `automation-work:${claim.run_id}`,
        input: clone(metadata.input || {}),
        roadmap_item: metadata.roadmap_item || '',
        candidate_branch: metadata.candidate_branch || null,
        candidate_sha: metadata.candidate_sha || null,
      }, context);

      if (work.summary.completed) {
        const completed = await policy.completeRun({
          run_id: claim.run_id,
          completed_at: now(),
          result: {
            work_run_id: work.run_id,
            work_status: work.summary.status,
            agent_id: claim.agent_id,
          },
        });
        return Object.freeze({ claim: completed, executed: true, work });
      }

      if (work.summary.blocked) {
        const failed = await policy.failRun({
          run_id: claim.run_id,
          failed_at: now(),
          error_code: 'AUTOMATION_AGENT_BLOCKED',
          result: {
            work_run_id: work.run_id,
            work_status: work.summary.status,
            agent_id: claim.agent_id,
          },
        });
        return Object.freeze({ claim: failed, executed: true, work });
      }

      return Object.freeze({ claim, executed: true, waiting: true, work });
    } catch (error) {
      const failed = await policy.failRun({
        run_id: claim.run_id,
        failed_at: now(),
        error_code: String(error?.code || error?.message || 'AUTOMATION_AGENT_FAILED').slice(0, 160),
        result: { agent_id: claim.agent_id },
      });
      return Object.freeze({ claim: failed, executed: true, error_code: failed.error_code });
    }
  }

  return Object.freeze({
    async run(input = {}, context = {}) {
      const authorization = await policy.authorizeRun(input);
      if (authorization.deduplicated) {
        return Object.freeze({
          claim: authorization.claim,
          deduplicated: true,
          executed: false,
        });
      }
      return executeClaim(authorization.claim, context);
    },

    async resume(input = {}, context = {}) {
      requireValue(typeof input.run_id === 'string' && input.run_id.trim(), 'AUTOMATION_RUN_ID_INVALID', 400);
      const claim = await policy.getRun({ run_id: input.run_id.trim() });
      if (claim.status !== RUN_STATUSES.AUTHORIZED) {
        return Object.freeze({ claim, executed: false, terminal: true });
      }
      return executeClaim(claim, context);
    },

    async cancel(input = {}, context = {}) {
      requireValue(typeof input.run_id === 'string' && input.run_id.trim(), 'AUTOMATION_RUN_ID_INVALID', 400);
      const claim = await policy.getRun({ run_id: input.run_id.trim() });
      if (claim.status !== RUN_STATUSES.AUTHORIZED) {
        return Object.freeze({ claim, cancelled: false, terminal: true });
      }
      const metadata = isRecord(claim.metadata) ? claim.metadata : {};
      await agentRuntime.cancel({
        run_id: `automation-work:${claim.run_id}`,
        roadmap_item: metadata.roadmap_item || '',
      }, context).catch(() => null);
      const failed = await policy.failRun({
        run_id: claim.run_id,
        failed_at: now(),
        error_code: 'AUTOMATION_CANCELLED',
        result: { agent_id: claim.agent_id },
      });
      return Object.freeze({ claim: failed, cancelled: true });
    },
  });
}
