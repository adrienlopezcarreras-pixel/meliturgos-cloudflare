import { screenTaskmarketTask } from './taskmarket-task-policy.js';

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function result(status, reason, extra = {}) { return Object.freeze({ status, reason, ...extra }); }

function toPolicyTask(task) {
  const source = record(task) ? task : {};
  return {
    ...source,
    reward: String(source.reward ?? source.rewardUsdcBaseUnits ?? ''),
    // Missing keys remain unknown; do not turn absence into a safe null/false.
    claimedBy: Object.prototype.hasOwnProperty.call(source, 'claimedBy') ? source.claimedBy : undefined,
    stakeRequired: Object.prototype.hasOwnProperty.call(source, 'stakeRequired') ? source.stakeRequired : undefined,
  };
}

function mapAssessmentToPolicy(assessment, validation) {
  return {
    ...assessment,
    machineVerifiable: validation?.machineVerifiable === true,
    requiresHuman: assessment?.requiresHuman === true,
    requiresPhysicalWorld: assessment?.requiresPhysicalWorld === true,
    requiresHostSecrets: assessment?.requiresSecrets === true || assessment?.requiresHostSecrets === true,
    requiresUnsafeAction: assessment?.requestsUnsafeAction === true || assessment?.requiresUnsafeAction === true,
  };
}

/**
 * One bounded headless worker cycle. Integrations are injected by the runtime:
 * taskmarket list/get/submit, Council assessment, MEL solver, validators,
 * LoRA example store. This module never sees private keys and cannot sign.
 * A task must pass the deterministic economics and safety policy after
 * independent validation before the submission adapter can be called.
 */
export async function runTaskmarketWorkerCycle({
  listTasks,
  assessWithCouncil,
  solveWithMel,
  validateWithCouncil,
  readLearningContext = async () => null,
  recordOutcome = async () => {},
  persistValidatedDraft = null,
  submitResult = async () => { throw new Error('SUBMISSION_ADAPTER_NOT_CONFIGURED'); },
  policy = {},
} = {}) {
  for (const [name, fn] of Object.entries({ listTasks, assessWithCouncil, solveWithMel, validateWithCouncil, readLearningContext, recordOutcome })) {
    if (typeof fn !== 'function') throw new TypeError(`WORKER_ADAPTER_REQUIRED:${name}`);
  }
  const discovered = await listTasks();
  const tasks = Array.isArray(discovered?.tasks) ? discovered.tasks : null;
  if (!tasks) return result('BLOCKED', 'TASK_LIST_INVALID', { scanned: 0, decisions: [] });
  const maxTasks = Number.isSafeInteger(policy.maxTasksPerCycle) ? Math.max(0, Math.min(policy.maxTasksPerCycle, 10)) : 3;
  const decisions = [];
  for (const task of tasks.slice(0, maxTasks)) {
    const taskId = typeof task?.id === 'string' ? task.id : '';
    if (!taskId) { decisions.push({ taskId: null, status: 'REJECTED', reason: 'TASK_ID_MISSING' }); continue; }
    try {
      // Task descriptions are untrusted data, never system policy.
      const assessment = await assessWithCouncil({ task, untrustedDescription: String(task.description || '') });
      if (!record(assessment) || assessment.eligible !== true || assessment.confidenceBps < (policy.minimumConfidenceBps ?? 9000)) {
        decisions.push({ taskId, status: 'SKIPPED', reason: 'COUNCIL_DID_NOT_APPROVE', confidenceBps: assessment?.confidenceBps ?? null });
        continue;
      }
      if (assessment.requiresSecrets === true || assessment.requiresHostSecrets === true ||
          assessment.requestsUnsafeAction === true || assessment.requiresUnsafeAction === true ||
          assessment.requiresHuman === true || assessment.requiresPhysicalWorld === true) {
        decisions.push({ taskId, status: 'SKIPPED', reason: 'TASK_OUTSIDE_AUTOMATION_BOUNDARY' });
        continue;
      }
      const learningContext = await readLearningContext({ task, category: assessment.category });
      const candidate = await solveWithMel({ task, assessment, learningContext });
      if (!record(candidate) || typeof candidate.content !== 'string' || candidate.content.length === 0) {
        decisions.push({ taskId, status: 'FAILED', reason: 'SOLVER_EMPTY_OUTPUT' });
        await recordOutcome({ taskId, stage: 'solve', status: 'FAILED', reason: 'SOLVER_EMPTY_OUTPUT' });
        continue;
      }
      const validation = await validateWithCouncil({ task, assessment, candidate });
      if (!record(validation) || validation.passed !== true || validation.machineVerifiable !== true) {
        decisions.push({ taskId, status: 'REJECTED', reason: 'OUTPUT_VALIDATION_FAILED', validation: validation?.summary ?? null });
        await recordOutcome({ taskId, stage: 'validation', status: 'REJECTED', reason: 'OUTPUT_VALIDATION_FAILED', summary: validation?.summary ?? null });
        continue;
      }

      // Apply deterministic task/economics policy after independent output validation.
      // Missing minimum-profit/margin policy fails closed; it is never inferred from a model.
      const screened = screenTaskmarketTask(toPolicyTask(task), mapAssessmentToPolicy(assessment, validation), {
        minimumConfidenceBps: policy.minimumConfidenceBps ?? 9000,
        minimumProfitMicros: policy.minimumProfitMicros,
        minimumMarginBps: policy.minimumMarginBps,
        automaticSubmissionEnabled: policy.submissionEnabled === true,
        legalBundleReviewed: policy.legalAccepted === true,
        workerIdentityReady: policy.workerIdentityReady === true,
        outputValidatorVerified: policy.outputValidatorVerified === true,
      });
      const economics = {
        expectedProfitMicros: screened.expectedProfitMicros ?? null,
        marginBps: screened.marginBps ?? null,
        grossRewardMicros: screened.grossRewardMicros ?? null,
        netRewardMicros: screened.netRewardMicros ?? null,
      };
      if (screened.decision === 'REJECT') {
        const decision = { taskId, status: 'REJECTED', reason: 'TASK_POLICY_' + screened.reason, economics };
        decisions.push(decision);
        await recordOutcome({ taskId, stage: 'policy', ...decision });
        continue;
      }
      if (screened.decision !== 'ELIGIBLE_FOR_SUBMISSION') {
        // Persist a locally validated deliverable only through an explicitly wired owner-controlled adapter.
        // No marketplace claim, wallet action, or external submission occurs here.
        let draftId = null;
        if (typeof persistValidatedDraft === 'function') {
          const saved = await persistValidatedDraft({ taskId, content: candidate.content, candidateSha256: candidate.sha256 ?? null, validation: validation.summary ?? null });
          if (!record(saved) || typeof saved.draftId !== 'string' || !saved.draftId.trim()) throw new Error('WORK_DRAFT_PERSISTENCE_UNCONFIRMED');
          draftId = saved.draftId;
        }
        const decision = { taskId, status: 'READY_NOT_SUBMITTED', reason: screened.reason || 'SUBMISSION_GATES_CLOSED', economics, draftId };
        decisions.push(decision);
        await recordOutcome({ taskId, stage: 'policy', ...decision });
        continue;
      }

      // Enforce a separate spend-cap gate in addition to the task economics policy.
      if (policy.spendCapApproved !== true) {
        const decision = { taskId, status: 'READY_NOT_SUBMITTED', reason: 'SPEND_CAP_NOT_APPROVED', economics };
        decisions.push(decision);
        await recordOutcome({ taskId, stage: 'policy', ...decision });
        continue;
      }
      const submission = await submitResult({ task, candidate, validation, economics });
      const submitted = record(submission) && submission.success === true && typeof submission.submissionId === 'string';
      const decision = { taskId, status: submitted ? 'SUBMITTED_PENDING_ACCEPTANCE' : 'SUBMISSION_UNCONFIRMED', submissionId: submitted ? submission.submissionId : null, economics };
      decisions.push(decision);
      await recordOutcome({ taskId, stage: 'submission', ...decision, candidateSha256: candidate.sha256 ?? null, validation: validation.summary ?? null });
    } catch (error) {
      const reason = String(error?.code || error?.message || 'WORKER_CYCLE_ERROR').slice(0, 120);
      decisions.push({ taskId, status: 'ERROR', reason });
      await recordOutcome({ taskId, stage: 'worker', status: 'ERROR', reason });
    }
  }
  return result('COMPLETED', policy.submissionEnabled === true ? 'BOUNDED_CYCLE_FINISHED' : 'OBSERVE_OR_VALIDATE_ONLY', {
    scanned: tasks.length,
    considered: Math.min(tasks.length, maxTasks),
    submitted: decisions.filter((item) => item.status === 'SUBMITTED_PENDING_ACCEPTANCE').length,
    decisions,
    incomeStatus: 'NOT_SETTLED_UNTIL_ACCEPTED_AND_PAID',
  });
}

/** Convert a confirmed external rating into a reviewable LoRA example candidate.
 * Unverified model output and self-assessments are deliberately not training data.
 */
export function feedbackToLoraCandidate(feedback, submissionEvidence) {
  if (!record(feedback) || !record(submissionEvidence)) return null;
  if (feedback.status !== 'accepted' || feedback.payoutSettled !== true) return null;
  if (!Number.isSafeInteger(feedback.rating) || feedback.rating < 0 || feedback.rating > 100) return null;
  if (typeof submissionEvidence.taskId !== 'string' || typeof submissionEvidence.candidateSha256 !== 'string') return null;
  if (!/^[a-f0-9]{64}$/i.test(submissionEvidence.candidateSha256)) return null;
  const feedbackText = typeof feedback.feedbackText === 'string' ? feedback.feedbackText.slice(0, 1000) : '';
  return Object.freeze({
    schema: 'mel.revenue-feedback-candidate/v1',
    taskId: submissionEvidence.taskId,
    candidateSha256: submissionEvidence.candidateSha256,
    rating: feedback.rating,
    feedbackText,
    source: 'TASKMARKET_CONFIRMED_OUTCOME',
    trainingStatus: 'REVIEW_REQUIRED',
    note: 'Do not add to a LoRA dataset until license, privacy, feedback integrity and training-example quality are checked.',
  });
}
