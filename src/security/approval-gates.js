export const CAPABILITY_APPROVAL_HEADER = 'x-mel-approve-capability';

const CAPABILITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function unique(values, maxItems = 32) {
  return [...new Set(values.filter(Boolean))].slice(0, maxItems);
}

export function approvedCapabilitiesFromRequest(request) {
  const raw = request?.headers?.get?.(CAPABILITY_APPROVAL_HEADER) || '';
  return unique(
    String(raw)
      .split(',')
      .map(value => clean(value, 160))
      .filter(value => CAPABILITY_ID.test(value)),
  );
}

export function normalizeCapabilityApprovalPolicy(policy) {
  if (policy == null) return null;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null;
  const required = policy.required === true;
  const scope = clean(policy.scope, 160);
  const reason = clean(policy.reason, 160);
  if (!required) return null;
  if (scope && !CAPABILITY_ID.test(scope)) return null;
  return Object.freeze({
    required: true,
    scope: scope || null,
    reason: reason || null,
  });
}

export function isCapabilityApprovalPolicyValid(policy) {
  if (policy == null) return true;
  const normalized = normalizeCapabilityApprovalPolicy(policy);
  return Boolean(normalized && normalized.required === true);
}

export function assertCapabilityApproval(record = {}, context = {}) {
  const policy = normalizeCapabilityApprovalPolicy(record?.approval);
  if (!policy?.required) return true;
  const scope = policy.scope || clean(record?.id, 160);
  const approved = new Set(
    Array.isArray(context?.approvedCapabilities)
      ? context.approvedCapabilities.map(value => clean(value, 160)).filter(value => CAPABILITY_ID.test(value))
      : [],
  );
  if (!scope || !approved.has(scope)) {
    const error = new Error('EXPLICIT_APPROVAL_REQUIRED');
    error.code = 'EXPLICIT_APPROVAL_REQUIRED';
    error.status = 409;
    error.capability = clean(record?.id, 160) || null;
    error.approval_scope = scope || null;
    throw error;
  }
  return true;
}

export function normalizeStepApproval(row = {}) {
  return Object.freeze({
    approved: row?.approved === true,
    session_id: clean(row?.session_id),
    step_id: clean(row?.step_id),
    action: clean(row?.action, 160),
  });
}

export function normalizeStepApprovals(value, maxItems = 100) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, Math.max(0, Number(maxItems) || 0)).map(normalizeStepApproval);
}

export function stepApprovalMatches(approvals, sessionId, step = {}) {
  const session = clean(sessionId);
  const stepId = clean(step?.id);
  const action = clean(step?.action, 160);
  if (!session || !stepId || !action) return false;
  return (Array.isArray(approvals) ? approvals : []).some(row => {
    const normalized = normalizeStepApproval(row);
    return normalized.approved === true
      && normalized.session_id === session
      && normalized.step_id === stepId
      && normalized.action === action;
  });
}
