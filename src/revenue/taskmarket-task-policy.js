const ALLOWED_CATEGORIES = new Set(['information', 'data-processing', 'software', 'analysis', 'benchmark']);
const MODES = new Set(['bounty', 'claim', 'benchmark', 'auction']);
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const integer = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
const reject = (reason, extra = {}) => Object.freeze({ decision: 'REJECT', reason, ...extra });

/**
 * Read-only screening for Taskmarket TaskResponse records.
 * reward is a string in USDC base units (6 decimals). No API call, signature,
 * wallet interaction, claim, bid, or submission is performed here.
 */
export function screenTaskmarketTask(task, assessment, policy = {}) {
  if (!record(task) || !record(assessment) || !record(policy)) return reject('INVALID_INPUT');
  if (task.status !== 'open') return reject('TASK_NOT_OPEN');
  if (typeof task.id !== 'string' || !task.id.trim()) return reject('TASK_ID_MISSING');
  if (typeof task.description !== 'string' || task.description.trim().length < 10) return reject('TASK_DESCRIPTION_INSUFFICIENT');
  if (!MODES.has(task.mode)) return reject('TASK_MODE_NOT_ALLOWED');
  if (task.stakeRequired === true) return reject('STAKE_REQUIRED');
  if (task.claimedBy) return reject('TASK_ALREADY_CLAIMED');
  const expiry = Date.parse(task.expiryTime);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return reject('TASK_EXPIRED_OR_UNDATED');
  if (!/^[0-9]+$/.test(String(task.reward ?? ''))) return reject('REWARD_INVALID');
  const gross = BigInt(task.reward);
  if (gross <= 0n) return reject('REWARD_NOT_POSITIVE');
  const feeBps = task.platformFeeBps === undefined ? 750 : task.platformFeeBps;
  if (!integer(feeBps, 0, 10000)) return reject('PLATFORM_FEE_INVALID');

  if (!ALLOWED_CATEGORIES.has(assessment.category)) return reject('CATEGORY_NOT_ALLOWLISTED');
  if (assessment.machineVerifiable !== true) return reject('ACCEPTANCE_NOT_MACHINE_VERIFIABLE');
  if (assessment.requiresHuman === true) return reject('HUMAN_WORK_REQUIRED');
  if (assessment.requiresPhysicalWorld === true) return reject('PHYSICAL_WORLD_WORK_REQUIRED');
  if (assessment.requiresHostSecrets === true || assessment.requiresUnsafeAction === true) return reject('UNSAFE_OR_SECRET_ACCESS_REQUIRED');
  if (!integer(assessment.confidenceBps, 0, 10000) || assessment.confidenceBps < (policy.minimumConfidenceBps ?? 8500)) return reject('CLASSIFICATION_CONFIDENCE_TOO_LOW');
  if (!integer(assessment.estimatedComputeCostMicros, 0, Number.MAX_SAFE_INTEGER)) return reject('COST_ESTIMATE_MISSING');
  if (!integer(policy.minimumProfitMicros, 0, Number.MAX_SAFE_INTEGER)) return reject('MINIMUM_PROFIT_MISSING');
  if (!integer(policy.minimumMarginBps, 0, 10000)) return reject('MINIMUM_MARGIN_MISSING');

  // Taskmarket reward uses 6-decimal USDC base units. Convert net payout to
  // integer micro-USDC and do not label it EUR or settled earnings.
  if (gross > BigInt(Number.MAX_SAFE_INTEGER)) return reject('REWARD_OVERFLOW');
  const netRewardMicros = (gross * BigInt(10000 - feeBps)) / 10000n;
  if (netRewardMicros > BigInt(Number.MAX_SAFE_INTEGER)) return reject('REWARD_OVERFLOW');
  const grossNumber = Number(gross);
  const net = Number(netRewardMicros);
  const expectedProfitMicros = net - assessment.estimatedComputeCostMicros;
  const marginBps = net === 0 ? -10000 : Number((BigInt(expectedProfitMicros) * 10000n) / BigInt(net));
  const economics = { taskId: task.id, mode: task.mode, grossRewardMicros: grossNumber, netRewardMicros: net, platformFeeBps: feeBps, estimatedComputeCostMicros: assessment.estimatedComputeCostMicros, expectedProfitMicros, marginBps, confidenceBps: assessment.confidenceBps };
  if (expectedProfitMicros < policy.minimumProfitMicros) return reject('EXPECTED_PROFIT_TOO_LOW', economics);
  if (marginBps < policy.minimumMarginBps) return reject('EXPECTED_MARGIN_TOO_LOW', economics);
  if (policy.automaticSubmissionEnabled !== true) return Object.freeze({ decision: 'OBSERVE_ONLY', reason: 'AUTOMATIC_SUBMISSION_DISABLED', ...economics });
  if (policy.legalBundleReviewed !== true || policy.workerIdentityReady !== true) return reject('OPERATOR_SETUP_NOT_CONFIRMED', economics);
  if (policy.outputValidatorVerified !== true) return reject('OUTPUT_VALIDATOR_NOT_VERIFIED', economics);
  return Object.freeze({ decision: 'ELIGIBLE_FOR_SUBMISSION', reason: 'POLICY_PASSED', ...economics });
}