export const FAILURE_CATEGORIES = Object.freeze(['technical_error','timeout','rate_limit','quota_exceeded','context_limit','model_unavailable','provider_unavailable','capability_missing','tool_missing','invalid_request','application_policy','provider_policy','model_refusal','low_confidence','unknown']);
export function categorize(error) {
  if (FAILURE_CATEGORIES.includes(error.category)) return error.category;
  if (error.status===429) return 'rate_limit';
  if (error.status===400) return 'invalid_request';
  if (/timeout/i.test(error.code || error.message)) return 'timeout';
  return 'technical_error';
}
export const retryable = category => ['technical_error','timeout','rate_limit','model_unavailable','provider_unavailable'].includes(category);
