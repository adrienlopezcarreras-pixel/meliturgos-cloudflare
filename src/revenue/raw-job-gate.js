export const ALLOWED_JOB_KINDS = Object.freeze([
  'json-transform', 'csv-transform', 'text-extract', 'embedding-batch',
  'image-inference', 'audio-transcription', 'video-transcode'
]);
const MAX_SECONDS = 86400;
const MAX_WATTS = 10000;
const MICROS_PER_KWH_WATT_SECOND = 3600000;
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const integer = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
const reject = (reason, extra = {}) => Object.freeze({ decision: 'REJECT', reason, ...extra });

/** Deterministic gate for normalized external jobs. Never launches workloads or moves funds. */
export function evaluateRawJob(job, policy = {}) {
  if (!record(job) || !record(policy)) return reject('INVALID_INPUT');
  const provider = typeof job.provider === 'string' ? job.provider.trim().toLowerCase() : '';
  if (!provider || !Array.isArray(policy.allowedProviders) || !policy.allowedProviders.map(String).map(x => x.toLowerCase()).includes(provider)) return reject('PROVIDER_NOT_ALLOWLISTED');
  if (!ALLOWED_JOB_KINDS.includes(job.kind)) return reject('JOB_KIND_NOT_ALLOWLISTED');
  if (typeof job.jobId !== 'string' || !job.jobId.trim()) return reject('JOB_ID_MISSING');
  if (typeof job.imageDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(job.imageDigest)) return reject('IMAGE_NOT_PINNED');
  if (!integer(job.payoutEurMicros, 1, Number.MAX_SAFE_INTEGER)) return reject('PAYOUT_NOT_NORMALIZED');
  if (!integer(job.maxRuntimeSeconds, 1, MAX_SECONDS)) return reject('RUNTIME_INVALID');
  if (!integer(job.powerWatts, 1, MAX_WATTS)) return reject('POWER_INVALID');
  if (!integer(job.feesEurMicros, 0, Number.MAX_SAFE_INTEGER) || !integer(job.otherCostEurMicros, 0, Number.MAX_SAFE_INTEGER)) return reject('COSTS_INVALID');
  const s = job.sandbox;
  if (!record(s) || s.rootless !== true || s.readOnlyRootFs !== true || s.noHostMounts !== true || s.noPrivileged !== true || !['none', 'allowlisted'].includes(s.network)) return reject('SANDBOX_UNSAFE');
  if (job.needsHostCredentials === true || job.arbitraryHostCommands === true || job.userDataAccess === true) return reject('HOST_ACCESS_FORBIDDEN');
  if (!integer(policy.maxRuntimeSeconds, 1, MAX_SECONDS) || job.maxRuntimeSeconds > policy.maxRuntimeSeconds) return reject('RUNTIME_POLICY_EXCEEDED');
  if (!integer(policy.maxPowerWatts, 1, MAX_WATTS) || job.powerWatts > policy.maxPowerWatts) return reject('POWER_POLICY_EXCEEDED');
  if (!integer(policy.electricityEurMicrosPerKwh, 0, Number.MAX_SAFE_INTEGER)) return reject('ELECTRICITY_RATE_MISSING');
  if (!integer(policy.minimumProfitEurMicros, 0, Number.MAX_SAFE_INTEGER)) return reject('MINIMUM_PROFIT_MISSING');
  if (!integer(policy.minimumMarginBps, 0, 10000)) return reject('MINIMUM_MARGIN_MISSING');
  const powerCostBig = (BigInt(job.powerWatts) * BigInt(job.maxRuntimeSeconds) * BigInt(policy.electricityEurMicrosPerKwh) + BigInt(MICROS_PER_KWH_WATT_SECOND - 1)) / BigInt(MICROS_PER_KWH_WATT_SECOND);
  const estimatedCostBig = powerCostBig + BigInt(job.feesEurMicros) + BigInt(job.otherCostEurMicros);
  if (powerCostBig > BigInt(Number.MAX_SAFE_INTEGER) || estimatedCostBig > BigInt(Number.MAX_SAFE_INTEGER)) return reject('COST_OVERFLOW');
  const powerCost = Number(powerCostBig);
  const estimatedCostEurMicros = Number(estimatedCostBig);
  const expectedProfitEurMicros = job.payoutEurMicros - estimatedCostEurMicros;
  const estimatedMarginBps = Number((BigInt(expectedProfitEurMicros) * 10000n) / BigInt(job.payoutEurMicros));
  const economics = { provider, jobId: job.jobId, payoutEurMicros: job.payoutEurMicros, electricityCostEurMicros: powerCost, estimatedCostEurMicros, expectedProfitEurMicros, estimatedMarginBps };
  if (expectedProfitEurMicros < policy.minimumProfitEurMicros) return reject('PROFIT_TOO_LOW', economics);
  if (estimatedMarginBps < policy.minimumMarginBps) return reject('MARGIN_TOO_LOW', economics);
  if (policy.dispatchEnabled !== true) return Object.freeze({ decision: 'OBSERVE_ONLY', reason: 'DISPATCH_DISABLED', ...economics });
  if (policy.sandboxVerified !== true) return reject('SANDBOX_NOT_VERIFIED', economics);
  return Object.freeze({ decision: 'ELIGIBLE_FOR_DISPATCH', reason: 'POLICY_PASSED', ...economics });
}