// ShardVault's GitHub mirror is reserved for the seventh RS(4/7) code
// fragment. Cached endpoint qualifications can outlive a snapshot, so the
// ordering of candidate endpoints cannot be trusted as an authorization gate.
const MIRROR_ID='github-actions-code-mirror';
const MIRROR_ADAPTER='github_actions_code_mirror';

export function allowCodeEndpointForShard(endpoint, index, goal) {
  if (!Number.isInteger(index)||!Number.isInteger(goal)||goal<2||goal>7||index<0||index>=goal) return false;
  if (String(endpoint?.id||'')===MIRROR_ID ||
      String(endpoint?.adapter||'')===MIRROR_ADAPTER) return goal===7&&index===6;
  return true;
}
