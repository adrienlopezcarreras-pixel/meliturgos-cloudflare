import { DomainError, requireValue } from '../core/contracts.js';

export const MULTIMODAL_KINDS = Object.freeze(['IMAGE', 'VIDEO', 'AUDIO']);

export function normalizeGenerationRequest(input = {}) {
  const kind = String(input.kind || 'IMAGE').toUpperCase();
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  const referenceImages = Array.isArray(input.referenceImages) ? input.referenceImages : [];

  requireValue(MULTIMODAL_KINDS.includes(kind), 'INVALID_MULTIMODAL_KIND');
  requireValue(prompt.length > 0 && prompt.length <= 6000, 'INVALID_MULTIMODAL_PROMPT');
  requireValue(referenceImages.length <= 10, 'TOO_MANY_REFERENCE_IMAGES');
  requireValue(referenceImages.every(value => typeof value === 'string' && value.length > 0), 'INVALID_REFERENCE_IMAGE');

  return Object.freeze({
    kind,
    prompt,
    referenceImages: Object.freeze([...referenceImages]),
    size: input.size || null,
    watermark: input.watermark !== false,
    approvedPaidCall: input.approvedPaidCall === true,
  });
}

export function requirePaidProviderApproval({ provider, paidAccessEnabled, approvedPaidCall }) {
  if (paidAccessEnabled !== true || approvedPaidCall !== true) {
    throw new DomainError(`PAID_PROVIDER_NOT_APPROVED:${provider}`, 403);
  }
}

export function providerCapability({ id, kinds, paid, enabled, notes = [] }) {
  requireValue(typeof id === 'string' && id.length > 0, 'INVALID_PROVIDER_ID');
  requireValue(Array.isArray(kinds) && kinds.every(kind => MULTIMODAL_KINDS.includes(kind)), 'INVALID_PROVIDER_KINDS');
  return Object.freeze({
    id,
    kinds: Object.freeze([...kinds]),
    paid: paid === true,
    enabled: enabled === true,
    notes: Object.freeze([...notes]),
  });
}
