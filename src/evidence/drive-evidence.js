const SHA40 = /^[a-f0-9]{40}$/i;
const SECRET_KEY = /(secret|token|password|authorization|cookie|api[_-]?key|otp|private[_-]?key|credential)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._~+/=-]{8,}|\bsk-[a-z0-9_-]{8,}|\bgh[pousr]_[a-z0-9]{12,})/i;

function sanitize(value, depth = 0) {
  if (depth > 6) return '[TRUNCATED]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') {
    const text = value.slice(0, 20_000);
    return SECRET_VALUE.test(text) ? '[REDACTED]' : text;
  }
  if (Array.isArray(value)) return value.slice(0, 200).map((item) => sanitize(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 200)) {
      if (SECRET_KEY.test(key)) continue;
      out[key] = sanitize(item, depth + 1);
    }
    return out;
  }
  return null;
}

function cleanId(value, fallback = 'run') {
  return String(value || fallback).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || fallback;
}

export function buildDriveEvidence({
  run_id,
  checkpoint = null,
  branch,
  commit_sha,
  ci = null,
  learning = null,
  tests = [],
  status = 'PENDING',
  created_at = new Date().toISOString(),
} = {}) {
  const sha = String(commit_sha || '').trim();
  if (!SHA40.test(sha)) throw Object.assign(new Error('DRIVE_EVIDENCE_COMMIT_SHA_REQUIRED'), { code: 'DRIVE_EVIDENCE_COMMIT_SHA_REQUIRED' });
  const branchName = String(branch || '').trim();
  if (!branchName.startsWith('candidate/')) throw Object.assign(new Error('DRIVE_EVIDENCE_CANDIDATE_BRANCH_REQUIRED'), { code: 'DRIVE_EVIDENCE_CANDIDATE_BRANCH_REQUIRED' });
  const id = cleanId(run_id || checkpoint?.job_id || `${sha.slice(0, 12)}-${Date.now()}`);
  return sanitize({
    schema: 'mel.drive-evidence.v1',
    evidence_id: id,
    run_id: run_id || checkpoint?.job_id || null,
    checkpoint,
    branch: branchName,
    commit_sha: sha.toLowerCase(),
    ci,
    learning,
    tests,
    created_at,
    status: String(status || 'PENDING').toUpperCase(),
  });
}

export function evidenceFileName(evidence) {
  const date = String(evidence?.created_at || new Date().toISOString()).slice(0, 10).replaceAll('-', '');
  const sha = String(evidence?.commit_sha || '').slice(0, 12) || 'no-sha';
  const run = cleanId(evidence?.evidence_id || evidence?.run_id || 'run');
  return `MEL-EVIDENCE-${date}-${sha}-${run}.json`;
}

export async function uploadDriveEvidence(env, evidence, { fetchFn = fetch } = {}) {
  const token = String(env?.GOOGLE_DRIVE_ACCESS_TOKEN || '').trim();
  if (!token) throw Object.assign(new Error('DRIVE_EVIDENCE_TOKEN_REQUIRED'), { code: 'DRIVE_EVIDENCE_TOKEN_REQUIRED' });
  const body = JSON.stringify(evidence, null, 2);
  const boundary = `mel_${crypto.randomUUID().replaceAll('-', '')}`;
  const metadata = {
    name: evidenceFileName(evidence),
    mimeType: 'application/json',
  };
  const folder = String(env?.GOOGLE_DRIVE_EVIDENCE_FOLDER_ID || '').trim();
  if (folder) metadata.parents = [folder];

  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n`,
    `--${boundary}--`,
  ].join('');

  const response = await fetchFn('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,createdTime', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body: multipart,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    const error = new Error(`DRIVE_EVIDENCE_UPLOAD_FAILED:${response.status}`);
    error.code = 'DRIVE_EVIDENCE_UPLOAD_FAILED';
    error.status = response.status;
    error.provider = sanitize(payload);
    throw error;
  }
  return {
    status: 'SYNCED',
    evidence_id: evidence.evidence_id,
    drive_file_id: payload.id,
    drive_name: payload.name || metadata.name,
    web_view_link: payload.webViewLink || null,
    created_time: payload.createdTime || null,
  };
}

export function createDriveEvidenceWriter(env, options = {}) {
  return async (input) => {
    const evidence = buildDriveEvidence(input);
    const drive = await uploadDriveEvidence(env, evidence, options);
    return { evidence, drive };
  };
}
