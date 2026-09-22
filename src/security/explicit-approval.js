const TRUSTED_APPROVALS = new WeakSet();
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function hasExplicitConfirmationHeader(request) {
  return String(request?.headers?.get?.('x-mel-explicit-confirmation') || '').trim() === 'CONFIRM';
}

export function hasExplicitConfirmationText(text) {
  const value = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(?:je\s+confirme|confirme(?:r)?|j['’]?autorise\s+explicitement|autorise\s+explicitement|oui\s*,?\s*(?:je\s+)?(?:confirme|autorise))\b/.test(value);
}

export async function approvalInputDigest(capability, input) {
  const id = String(capability || '').trim();
  if (!id) throw Object.assign(new Error('APPROVAL_CAPABILITY_REQUIRED'), { code: 'APPROVAL_CAPABILITY_REQUIRED' });
  return sha256Hex(id + '\n' + stable(input ?? null));
}

export async function createExplicitApprovalProof({
  capability,
  input,
  requestId,
  source = 'owner-current-request',
  approvedAt = Date.now(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const id = String(capability || '').trim();
  const rid = String(requestId || '').trim();
  const src = String(source || '').trim();
  if (!id || !rid || !src) {
    throw Object.assign(new Error('APPROVAL_PROOF_INPUT_REQUIRED'), { code: 'APPROVAL_PROOF_INPUT_REQUIRED' });
  }
  const approved = Number(approvedAt);
  const ttl = Math.max(1000, Math.min(10 * 60 * 1000, Number(ttlMs) || DEFAULT_TTL_MS));
  const proof = Object.freeze({
    schema: 'mel.explicit-approval.v1',
    approved: true,
    capability: id,
    input_sha256: await approvalInputDigest(id, input),
    request_id: rid,
    source: src.slice(0, 120),
    approved_at: approved,
    expires_at: approved + ttl,
  });
  TRUSTED_APPROVALS.add(proof);
  return proof;
}

export async function verifyExplicitApproval({ capability, input, context = {}, now = Date.now() } = {}) {
  const id = String(capability || '').trim();
  const rid = String(context?.requestId || '').trim();
  if (!id || !rid) return { ok: false, code: 'EXPLICIT_APPROVAL_REQUIRED' };
  const digest = await approvalInputDigest(id, input);
  const approvals = Array.isArray(context?.explicitApprovals) ? context.explicitApprovals : [];
  for (const proof of approvals) {
    if (!proof || typeof proof !== 'object' || !TRUSTED_APPROVALS.has(proof)) continue;
    if (proof.schema !== 'mel.explicit-approval.v1' || proof.approved !== true) continue;
    if (proof.capability !== id || proof.request_id !== rid || proof.input_sha256 !== digest) continue;
    if (!Number.isFinite(Number(proof.expires_at)) || Number(proof.expires_at) < Number(now)) {
      return { ok: false, code: 'EXPLICIT_APPROVAL_EXPIRED' };
    }
    return {
      ok: true,
      capability: id,
      request_id: rid,
      input_sha256: digest,
      source: proof.source,
      approved_at: proof.approved_at,
      expires_at: proof.expires_at,
    };
  }
  return { ok: false, code: 'EXPLICIT_APPROVAL_REQUIRED' };
}

export async function requireExplicitApproval(args = {}) {
  const result = await verifyExplicitApproval(args);
  if (!result.ok) {
    const error = new Error(result.code);
    error.code = result.code;
    error.status = 409;
    throw error;
  }
  return result;
}


export async function attachRequestApproval(context = {}, { request, capability, input, source = 'owner-http-confirmation' } = {}) {
  if (!hasExplicitConfirmationHeader(request)) return context;
  const proof = await createExplicitApprovalProof({
    capability,
    input,
    requestId: context.requestId,
    source,
  });
  return { ...context, explicitApprovals: [...(context.explicitApprovals || []), proof] };
}

export async function attachTextApproval(context = {}, { text, capability, input, source = 'owner-chat-confirmation' } = {}) {
  if (!hasExplicitConfirmationText(text)) return context;
  const proof = await createExplicitApprovalProof({
    capability,
    input,
    requestId: context.requestId,
    source,
  });
  return { ...context, explicitApprovals: [...(context.explicitApprovals || []), proof] };
}
