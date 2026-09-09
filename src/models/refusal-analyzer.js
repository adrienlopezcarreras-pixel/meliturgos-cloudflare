const ALLOWED = new Set(['UNNECESSARY_TOPIC_REFUSAL','TOPIC_SENSITIVE_REFUSAL','ACADEMIC_TOPIC_REFUSAL','CAPABILITY_REFUSAL','MODEL_LIMITATION','LOW_CONFIDENCE','provider_unavailable','model_unavailable','timeout','quota','context_limit','quota_exceeded']);
export function analyzeRefusal(error = {}) {
  const reason = String(error.reason || error.code || error.category || error.message || 'unknown');
  const normalized = reason.toUpperCase().replace(/[- ]/g,'_');
  const operational = normalized.includes('OPERATIONAL_HARM_BOUNDARY') || normalized.includes('IMMINENT_HARM');
  const allowed = !operational && (ALLOWED.has(reason) || ALLOWED.has(normalized) || /REFUSAL|LIMITATION|LOW_CONFIDENCE|UNAVAILABLE|TIMEOUT|QUOTA|CONTEXT_LIMIT/.test(normalized));
  return { reason, normalized, operational, useFinalFallback: allowed };
}
