import { MAX_AUTONOMOUS_REPAIR_ATTEMPTS } from './autonomy-repair-policy.js';

// Hash only the actual file bytes and paths: provider/summary/base metadata
// cannot turn a vetoed implementation into a new proposal.
export async function packageContentFingerprint(files) {
  if (!Array.isArray(files) || !files.length) return null;
  const normalized=files.map(file=>({path:String(file?.path||''),content:String(file?.content||'')}))
    .sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const bytes=new TextEncoder().encode(JSON.stringify(normalized));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function rememberCouncilRejectedPackage(job,observedAt) {
  const fingerprint=await packageContentFingerprint(job?.files_json);
  const history=(Array.isArray(job?.result_json?.council_rejected_packages)?job.result_json.council_rejected_packages:[])
    .filter(row=>row?.schema==='mel.council-rejected-package/v1' && /^[a-f0-9]{64}$/.test(String(row?.content_sha256||'')))
    .map(row=>({schema:row.schema,content_sha256:row.content_sha256,
      candidate_sha:/^[a-f0-9]{40}$/.test(String(row.candidate_sha||''))?row.candidate_sha:null,
      rejected_at:String(row.rejected_at||'').slice(0,40)}));
  if (!fingerprint) return history.slice(-MAX_AUTONOMOUS_REPAIR_ATTEMPTS);
  return [...history.filter(row=>row.content_sha256!==fingerprint),{
    schema:'mel.council-rejected-package/v1',
    content_sha256:fingerprint,
    candidate_sha:/^[a-f0-9]{40}$/.test(String(job?.result_json?.council_review?.head||''))?job.result_json.council_review.head:null,
    rejected_at:observedAt,
  }].slice(-MAX_AUTONOMOUS_REPAIR_ATTEMPTS);
}

export async function isCouncilRejectedPackage(job,files) {
  const fingerprint=await packageContentFingerprint(files);
  return fingerprint!==null && Array.isArray(job?.result_json?.council_rejected_packages)
    && job.result_json.council_rejected_packages.some(row=>row?.schema==='mel.council-rejected-package/v1' && row.content_sha256===fingerprint);
}
