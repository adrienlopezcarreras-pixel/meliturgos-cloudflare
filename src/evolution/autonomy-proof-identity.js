// Only evidence containing the exact, distinct provider/model identities from
// a completed runtime DAG can certify or be reused as multi-AI execution.
export function isVerifiedRuntimeWorkProof(proof, jobId = null) {
  if (!proof || proof.status !== 'VERIFIED' || proof.version !== 3
    || proof.recovered_interrupted_node !== true) return false;
  if (proof.target_job_id != null
    && String(proof.target_job_id) !== String(jobId)) return false;
  const identities = proof.provider_model_identities;
  const attempted = proof.providers_attempted;
  const successful = proof.successful_candidates;
  if (!Array.isArray(identities) || identities.length < 2 || identities.length > 64
    || !Number.isSafeInteger(attempted) || attempted !== identities.length
    || !Number.isSafeInteger(successful) || successful < 1
    || successful > attempted) return false;
  const keys = [];
  for (const identity of identities) {
    if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
    const { provider, model } = identity;
    if (typeof provider !== 'string' || typeof model !== 'string'
      || !provider.trim() || !model.trim()
      || provider !== provider.trim() || model !== model.trim()
      || provider.length > 200 || model.length > 200) return false;
    keys.push(JSON.stringify([provider, model]));
  }
  return new Set(keys).size === identities.length;
}

export function distinctModelIdentitiesFromFanout(result) {
  const attempted = Array.isArray(result?.providersAttempted) ? result.providersAttempted : [];
  const health = Array.isArray(result?.providerHealth) ? result.providerHealth : [];
  const identities = attempted.map(id => {
    const matches = health.filter(row => row?.id === id);
    if (matches.length !== 1 || typeof id !== 'string' || !id.trim()) return null;
    const provider = matches[0].provider;
    const model = matches[0].model;
    if (typeof provider !== 'string' || typeof model !== 'string'
      || !provider.trim() || !model.trim()) return null;
    return { provider: provider.trim(), model: model.trim() };
  });
  const unique = new Set(identities.filter(Boolean)
    .map(row => JSON.stringify([row.provider, row.model])));
  if (attempted.length < 2 || attempted.length > 64 || identities.some(row => !row)
    || new Set(attempted).size !== attempted.length || unique.size !== attempted.length) {
    const error = new Error('RUNTIME_WORK_DAG_MULTI_AI_NOT_PROVEN');
    error.code = 'RUNTIME_WORK_DAG_MULTI_AI_NOT_PROVEN';
    throw error;
  }
  return identities;
}
