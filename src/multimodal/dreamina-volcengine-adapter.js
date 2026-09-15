import { DomainError, requireValue } from '../core/contracts.js';
import {
  normalizeGenerationRequest,
  providerCapability,
  requirePaidProviderApproval,
} from './provider-contract.js';

const DEFAULT_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const DEFAULT_MODEL = 'doubao-seedream-4-0-250828';

export class DreaminaVolcengineAdapter {
  constructor({
    apiKey = '',
    endpoint = DEFAULT_ENDPOINT,
    model = DEFAULT_MODEL,
    fetchImpl = globalThis.fetch,
    paidAccessEnabled = false,
  } = {}) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.model = model;
    this.fetchImpl = fetchImpl;
    this.paidAccessEnabled = paidAccessEnabled === true;
  }

  capability() {
    return providerCapability({
      id: 'dreamina-volcengine',
      kinds: ['IMAGE'],
      paid: true,
      enabled: this.paidAccessEnabled,
      notes: [
        'Official automation path uses Volcengine Ark / Seedream.',
        'Paid calls are blocked unless both provider access and the individual call are explicitly approved.',
        'No runtime wiring is performed by this adapter.',
      ],
    });
  }

  async generate(input = {}) {
    const request = normalizeGenerationRequest({ ...input, kind: 'IMAGE' });
    requirePaidProviderApproval({
      provider: 'dreamina-volcengine',
      paidAccessEnabled: this.paidAccessEnabled,
      approvedPaidCall: request.approvedPaidCall,
    });
    requireValue(typeof this.apiKey === 'string' && this.apiKey.length > 0, 'DREAMINA_API_KEY_MISSING', 503);
    requireValue(typeof this.fetchImpl === 'function', 'DREAMINA_FETCH_UNAVAILABLE', 503);

    const body = {
      model: this.model,
      prompt: request.prompt,
      size: request.size || '2K',
      sequential_image_generation: 'disabled',
      stream: false,
      response_format: 'url',
      watermark: request.watermark,
    };

    if (request.referenceImages.length === 1) body.image = request.referenceImages[0];
    if (request.referenceImages.length > 1) body.image = [...request.referenceImages];

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response?.ok) {
      let detail = '';
      try { detail = String(await response?.text?.() || '').slice(0, 300); } catch {}
      throw new DomainError(`DREAMINA_PROVIDER_ERROR:${response?.status || 'UNKNOWN'}${detail ? `:${detail}` : ''}`, 502);
    }

    const payload = await response.json();
    const outputs = Array.isArray(payload?.data)
      ? payload.data
          .filter(item => item && typeof item.url === 'string' && item.url.length > 0)
          .map(item => ({ url: item.url, size: item.size || null }))
      : [];

    requireValue(outputs.length > 0, 'DREAMINA_EMPTY_RESULT', 502);

    return Object.freeze({
      provider: 'dreamina-volcengine',
      model: payload?.model || this.model,
      outputs: Object.freeze(outputs),
      usage: payload?.usage || null,
      created: payload?.created || null,
    });
  }
}

export const DREAMINA_VOLCENGINE_DEFAULTS = Object.freeze({
  endpoint: DEFAULT_ENDPOINT,
  model: DEFAULT_MODEL,
});
