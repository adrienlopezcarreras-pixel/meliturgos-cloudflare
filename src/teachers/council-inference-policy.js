// Stable inference policy identity: releases alone must never replenish retries.
export const COUNCIL_INFERENCE_POLICY = 'bounded-cloud-critique-512-synthesis-768-v1';
export const COUNCIL_CRITIQUE_MAX_TOKENS = 512;
export const COUNCIL_SYNTHESIS_MAX_TOKENS = 768;
export function staleCouncilDeferral(job) {
  const delay = job?.result_json?.autonomy_deferral;
  return delay?.phase === 'council' && delay.inference_policy !== COUNCIL_INFERENCE_POLICY;
}
