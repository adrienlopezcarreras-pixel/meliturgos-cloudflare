const CHECKPOINT_SCHEMA = 'mel.dev-job-checkpoint';
export const DEV_JOB_CHECKPOINT_VERSION = 1;

const STAGES = Object.freeze([
  'QUEUED','CLAIMED','DIAGNOSE','PLAN','BRANCH','EDIT','TEST','STAGE','COMPARE',
  'RELEASE_CANDIDATE','BLOCKED','FAILED','CANCELLED','COMPLETED'
]);
const CANDIDATE_REQUIRED = new Set(['EDIT','TEST','STAGE','COMPARE','RELEASE_CANDIDATE','COMPLETED']);
const SHA_REQUIRED = new Set(['TEST','STAGE','COMPARE','RELEASE_CANDIDATE','COMPLETED']);
const TESTS_REQUIRED = new Set(['RELEASE_CANDIDATE','COMPLETED']);
const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,}|\b[a-z0-9_-]{16,}\.[a-z0-9_-]{16,}\.[a-z0-9_-]{8,}\b)/i;

function cleanString(value, max = 4000) {
  const text = String(value ?? '').slice(0, max);
  return SECRET_VALUE.test(text) ? '[REDACTED]' : text;
}

function sanitize(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return cleanString(value);
  if (Array.isArray(value)) return value.slice(0, 100).map(v => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value).slice(0, 100)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = sanitize(val, depth + 1);
    }
    return out;
  }
  return undefined;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function validateCore(cp) {
  if (!cp || cp.schema !== CHECKPOINT_SCHEMA || cp.version !== DEV_JOB_CHECKPOINT_VERSION) {
    throw Object.assign(new Error('CHECKPOINT_VERSION_UNSUPPORTED'), { code: 'CHECKPOINT_VERSION_UNSUPPORTED' });
  }
  if (!cp.job_id || !STAGES.includes(cp.stage)) {
    throw Object.assign(new Error('CHECKPOINT_INVALID'), { code: 'CHECKPOINT_INVALID' });
  }
  if (cp.candidate_branch && !String(cp.candidate_branch).startsWith('candidate/')) {
    throw Object.assign(new Error('CHECKPOINT_NON_CANDIDATE_BRANCH'), { code: 'CHECKPOINT_NON_CANDIDATE_BRANCH' });
  }
  if (CANDIDATE_REQUIRED.has(cp.stage) && !cp.candidate_branch) {
    throw Object.assign(new Error('CHECKPOINT_CANDIDATE_REQUIRED'), { code: 'CHECKPOINT_CANDIDATE_REQUIRED' });
  }
  if (SHA_REQUIRED.has(cp.stage) && !cp.candidate_sha) {
    throw Object.assign(new Error('CHECKPOINT_SHA_REQUIRED'), { code: 'CHECKPOINT_SHA_REQUIRED' });
  }
  if (TESTS_REQUIRED.has(cp.stage) && (!Array.isArray(cp.tests) || !cp.tests.length || cp.tests.some(t => t?.passed !== true))) {
    throw Object.assign(new Error('CHECKPOINT_TEST_EVIDENCE_REQUIRED'), { code: 'CHECKPOINT_TEST_EVIDENCE_REQUIRED' });
  }
  return true;
}

export async function createDevJobCheckpoint(job, evidence = {}) {
  const stage = String(evidence.stage || job?.status || 'QUEUED').toUpperCase();
  const checkpoint = {
    schema: CHECKPOINT_SCHEMA,
    version: DEV_JOB_CHECKPOINT_VERSION,
    job_id: String(job?.id || job?.job_id || ''),
    stage,
    candidate_branch: evidence.candidate_branch || job?.candidate_branch || null,
    candidate_sha: evidence.candidate_sha || null,
    tests: sanitize(evidence.tests || job?.tests_json || []),
    blockers: sanitize(evidence.blockers || []),
    teacher_request_id: cleanString(evidence.teacher_request_id || '', 200) || null,
    teacher_reply_id: cleanString(evidence.teacher_reply_id || '', 200) || null,
    council_evidence: sanitize(evidence.council_evidence || null),
    audit: sanitize(evidence.audit || []),
    checkpointed_at: Number(evidence.checkpointed_at || Date.now())
  };
  validateCore(checkpoint);
  checkpoint.integrity_sha256 = await sha256(stable(checkpoint));
  return checkpoint;
}

export async function verifyDevJobCheckpoint(checkpoint) {
  validateCore(checkpoint);
  const supplied = checkpoint.integrity_sha256;
  if (!supplied || typeof supplied !== 'string') {
    throw Object.assign(new Error('CHECKPOINT_INTEGRITY_REQUIRED'), { code: 'CHECKPOINT_INTEGRITY_REQUIRED' });
  }
  const unsigned = { ...checkpoint };
  delete unsigned.integrity_sha256;
  const expected = await sha256(stable(unsigned));
  if (expected !== supplied) {
    throw Object.assign(new Error('CHECKPOINT_INTEGRITY_MISMATCH'), { code: 'CHECKPOINT_INTEGRITY_MISMATCH' });
  }
  return true;
}

export function checkpointPublicView(checkpoint) {
  const { integrity_sha256, ...safe } = checkpoint || {};
  return sanitize(safe);
}
