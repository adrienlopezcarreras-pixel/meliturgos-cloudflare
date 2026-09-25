import { DomainError, requireValue } from '../core/contracts.js';

export const IMAGE_RUNTIME_SCHEMA = 'mel.image-runtime/v1';
export const IMAGE_ACTIONS = Object.freeze(['ANALYZE', 'PROCESS', 'GENERATE']);

const MAX_IMAGE_BYTES = 20_000_000;
const MAX_PROMPT_CHARS = 6000;
const MAX_REFERENCES = 10;
const MAX_OUTPUTS = 16;

function imageError(code, status = 400) {
  return new DomainError(code, status);
}

function text(value) {
  return String(value ?? '').trim();
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function bytesFrom(value) {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  throw imageError('IMAGE_BYTES_INVALID');
}

function safeUrl(value, code = 'IMAGE_URL_INVALID') {
  if (!value) return null;
  let url;
  try {
    url = new URL(text(value));
  } catch {
    throw imageError(code);
  }
  requireValue(['https:', 'http:'].includes(url.protocol), code);
  requireValue(!url.username && !url.password, code);
  return url.toString();
}

async function sha256Bytes(bytes) {
  if (!bytes) return null;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Text(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function providerCapability(provider) {
  const capability = typeof provider?.capability === 'function'
    ? provider.capability()
    : provider?.capability;
  return isObject(capability) ? capability : {};
}

function providerId(provider) {
  return text(providerCapability(provider).id || provider?.id);
}

function providerEnabled(provider) {
  const capability = providerCapability(provider);
  return capability.enabled !== false;
}

function providerPaid(provider) {
  return providerCapability(provider).paid === true;
}

function providerPriority(provider) {
  return finiteNonNegative(providerCapability(provider).priority, 100);
}

function supports(provider, action) {
  const capability = providerCapability(provider);
  const actions = Array.isArray(capability.actions)
    ? capability.actions.map(value => text(value).toUpperCase())
    : [];
  if (actions.includes(action)) return true;

  if (action === 'GENERATE') {
    return typeof provider?.generate === 'function'
      && Array.isArray(capability.kinds)
      && capability.kinds.map(value => text(value).toUpperCase()).includes('IMAGE');
  }
  if (action === 'ANALYZE') return typeof provider?.analyze === 'function';
  if (action === 'PROCESS') return typeof provider?.process === 'function';
  return false;
}

async function estimateCost(provider, request, action) {
  if (typeof provider?.estimateCostUsd === 'function') {
    return finiteNonNegative(await provider.estimateCostUsd(request, action), null);
  }
  return providerPaid(provider) ? null : 0;
}

function sanitize(value, depth = 0) {
  if (depth > 6) return '[DEPTH_LIMIT]';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 12_000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, depth + 1));
  if (isObject(value)) {
    const output = {};
    for (const [key, child] of Object.entries(value).slice(0, 120)) {
      if (/token|secret|password|authorization|cookie|credential|api[_-]?key/i.test(key)) continue;
      if (key === 'bytes' || key === 'buffer' || key === 'data') continue;
      output[String(key).slice(0, 120)] = sanitize(child, depth + 1);
    }
    return output;
  }
  return String(value).slice(0, 2000);
}

function normalizeReferences(values = []) {
  requireValue(Array.isArray(values) && values.length <= MAX_REFERENCES, 'IMAGE_REFERENCES_INVALID');
  return values.map((value, index) => {
    if (typeof value === 'string') {
      return Object.freeze({ index, url: safeUrl(value, 'IMAGE_REFERENCE_URL_INVALID') });
    }
    requireValue(isObject(value), 'IMAGE_REFERENCE_INVALID');
    return Object.freeze({
      index,
      ...(value.url ? { url: safeUrl(value.url, 'IMAGE_REFERENCE_URL_INVALID') } : {}),
      ...(value.id ? { id: text(value.id).slice(0, 240) } : {}),
      ...(value.sha256 && /^[0-9a-f]{64}$/i.test(text(value.sha256))
        ? { sha256: text(value.sha256).toLowerCase() }
        : {}),
    });
  });
}

async function normalizeInput(action, input = {}) {
  requireValue(isObject(input), 'IMAGE_REQUEST_INVALID');
  if (action === 'GENERATE') {
    const prompt = text(input.prompt);
    requireValue(prompt.length > 0 && prompt.length <= MAX_PROMPT_CHARS, 'IMAGE_PROMPT_INVALID');
    return Object.freeze({
      action,
      prompt,
      prompt_sha256: await sha256Text(prompt),
      references: Object.freeze(normalizeReferences(input.references || input.referenceImages || [])),
      size: input.size ? text(input.size).slice(0, 120) : null,
      watermark: input.watermark !== false,
      approvedPaidCall: input.approvedPaidCall === true,
    });
  }

  const bytes = bytesFrom(input.bytes);
  const url = input.url ? safeUrl(input.url) : null;
  requireValue(bytes || url, 'IMAGE_SOURCE_REQUIRED');
  if (bytes) {
    requireValue(bytes.byteLength > 0 && bytes.byteLength <= MAX_IMAGE_BYTES, 'IMAGE_BYTES_TOO_LARGE', 413);
  }
  const operation = action === 'PROCESS' ? text(input.operation) : null;
  if (action === 'PROCESS') requireValue(operation.length > 0 && operation.length <= 160, 'IMAGE_OPERATION_INVALID');

  return Object.freeze({
    action,
    bytes,
    url,
    mime: text(input.mime || 'application/octet-stream').slice(0, 160),
    source_sha256: await sha256Bytes(bytes),
    operation,
    params: isObject(input.params) ? sanitize(input.params) : {},
  });
}

function publicRequest(request) {
  return Object.freeze({
    action: request.action,
    ...(request.prompt_sha256 ? { prompt_sha256: request.prompt_sha256 } : {}),
    ...(request.source_sha256 ? { source_sha256: request.source_sha256 } : {}),
    ...(request.url ? { source_url: request.url } : {}),
    ...(request.mime ? { mime: request.mime } : {}),
    ...(request.operation ? { operation: request.operation } : {}),
    ...(request.size ? { size: request.size } : {}),
    ...(Array.isArray(request.references) ? { reference_count: request.references.length } : {}),
  });
}

function normalizeOutputs(result) {
  const source = Array.isArray(result?.outputs)
    ? result.outputs
    : Array.isArray(result?.artifacts)
      ? result.artifacts
      : [];
  requireValue(source.length > 0 && source.length <= MAX_OUTPUTS, 'IMAGE_PROVIDER_OUTPUTS_INVALID', 502);
  return source.map((item, index) => {
    requireValue(isObject(item), 'IMAGE_PROVIDER_OUTPUT_INVALID', 502);
    const url = item.url ? safeUrl(item.url, 'IMAGE_OUTPUT_URL_INVALID') : null;
    const id = text(item.id);
    requireValue(url || id, 'IMAGE_PROVIDER_OUTPUT_REFERENCE_REQUIRED', 502);
    return Object.freeze({
      index,
      ...(id ? { id: id.slice(0, 240) } : {}),
      ...(url ? { url } : {}),
      ...(item.mime ? { mime: text(item.mime).slice(0, 160) } : {}),
      ...(item.width != null ? { width: finiteNonNegative(item.width, null) } : {}),
      ...(item.height != null ? { height: finiteNonNegative(item.height, null) } : {}),
      ...(item.size != null ? { size: sanitize(item.size) } : {}),
      metadata: Object.freeze(sanitize(item.metadata || {})),
    });
  });
}

function actionMethod(provider, action) {
  if (action === 'GENERATE') return provider.generate?.bind(provider);
  if (action === 'ANALYZE') return provider.analyze?.bind(provider);
  if (action === 'PROCESS') return provider.process?.bind(provider);
  return null;
}

export class ImageVisionRuntime {
  constructor({
    providers = [],
    authorization = null,
    now = () => new Date().toISOString(),
  } = {}) {
    requireValue(Array.isArray(providers), 'IMAGE_PROVIDERS_INVALID');
    if (authorization != null && typeof authorization.isAllowed !== 'function') {
      throw new Error('IMAGE_AUTHORIZATION_INVALID');
    }
    this.providers = [...providers];
    this.authorization = authorization;
    this.now = now;
  }

  registerProvider(provider) {
    requireValue(provider && typeof provider === 'object', 'IMAGE_PROVIDER_INVALID');
    requireValue(providerId(provider), 'IMAGE_PROVIDER_ID_REQUIRED');
    this.providers.push(provider);
    return providerId(provider);
  }

  listProviders(action = null) {
    const normalizedAction = action ? text(action).toUpperCase() : null;
    if (normalizedAction) requireValue(IMAGE_ACTIONS.includes(normalizedAction), 'IMAGE_ACTION_INVALID');
    return this.providers
      .filter(provider => providerEnabled(provider))
      .filter(provider => !normalizedAction || supports(provider, normalizedAction))
      .map(provider => {
        const capability = providerCapability(provider);
        return Object.freeze({
          id: providerId(provider),
          paid: providerPaid(provider),
          priority: providerPriority(provider),
          actions: Object.freeze(IMAGE_ACTIONS.filter(candidate => supports(provider, candidate))),
          model: text(capability.model) || null,
        });
      })
      .sort((a, b) => Number(a.paid) - Number(b.paid) || a.priority - b.priority || a.id.localeCompare(b.id));
  }

  async run(action, input = {}, options = {}, context = {}) {
    const normalizedAction = text(action).toUpperCase();
    requireValue(IMAGE_ACTIONS.includes(normalizedAction), 'IMAGE_ACTION_INVALID');
    const request = await normalizeInput(normalizedAction, input);
    const maxCostUsd = finiteNonNegative(options.maxCostUsd, 0);
    const attempts = [];

    const candidates = this.providers
      .filter(provider => providerEnabled(provider) && supports(provider, normalizedAction))
      .sort((a, b) => Number(providerPaid(a)) - Number(providerPaid(b))
        || providerPriority(a) - providerPriority(b)
        || providerId(a).localeCompare(providerId(b)));

    for (const provider of candidates) {
      const id = providerId(provider);
      if (!id) continue;
      const paid = providerPaid(provider);

      let allowed = !paid;
      if (this.authorization) {
        try {
          allowed = (await this.authorization.isAllowed({
            provider: id,
            action: normalizedAction,
            capability: providerCapability(provider),
            request: publicRequest(request),
            context,
          })) === true;
        } catch {
          allowed = false;
        }
      }
      if (!allowed) {
        attempts.push(Object.freeze({ provider: id, status: 'skipped', reason: 'not_authorized' }));
        continue;
      }

      const estimatedCostUsd = await estimateCost(provider, request, normalizedAction);
      if (paid && input.approvedPaidCall !== true) {
        attempts.push(Object.freeze({ provider: id, status: 'skipped', reason: 'paid_call_not_approved' }));
        continue;
      }
      if (estimatedCostUsd == null) {
        attempts.push(Object.freeze({ provider: id, status: 'skipped', reason: 'cost_unknown' }));
        continue;
      }
      if (estimatedCostUsd > maxCostUsd) {
        attempts.push(Object.freeze({
          provider: id,
          status: 'skipped',
          reason: 'cost_guard',
          estimated_cost_usd: estimatedCostUsd,
          max_cost_usd: maxCostUsd,
        }));
        continue;
      }

      const method = actionMethod(provider, normalizedAction);
      if (!method) continue;

      try {
        const providerInput = normalizedAction === 'GENERATE'
          ? {
              kind: 'IMAGE',
              prompt: request.prompt,
              referenceImages: request.references.map(ref => ref.url || ref.id).filter(Boolean),
              size: request.size,
              watermark: request.watermark,
              approvedPaidCall: input.approvedPaidCall === true,
            }
          : {
              bytes: request.bytes,
              url: request.url,
              mime: request.mime,
              ...(request.operation ? { operation: request.operation, params: request.params } : {}),
            };

        const result = await method(providerInput, context);
        requireValue(result && typeof result === 'object', 'IMAGE_PROVIDER_RESULT_INVALID', 502);

        const provenance = Object.freeze({
          provider: id,
          action: normalizedAction,
          model: text(result.model || providerCapability(provider).model) || null,
          paid,
          estimated_cost_usd: estimatedCostUsd,
          created_at: this.now(),
          request: publicRequest(request),
        });

        if (normalizedAction === 'ANALYZE') {
          const analysis = sanitize(result.analysis ?? result.result ?? result);
          return Object.freeze({
            schema: IMAGE_RUNTIME_SCHEMA,
            action: normalizedAction,
            provider: id,
            analysis: Object.freeze(isObject(analysis) ? analysis : { text: analysis }),
            provenance,
            attempts: Object.freeze([
              ...attempts,
              Object.freeze({ provider: id, status: 'success' }),
            ]),
          });
        }

        const outputs = normalizeOutputs(result);
        return Object.freeze({
          schema: IMAGE_RUNTIME_SCHEMA,
          action: normalizedAction,
          provider: id,
          outputs: Object.freeze(outputs),
          provenance,
          attempts: Object.freeze([
            ...attempts,
            Object.freeze({ provider: id, status: 'success' }),
          ]),
        });
      } catch (error) {
        attempts.push(Object.freeze({
          provider: id,
          status: 'failed',
          reason: text(error?.code || error?.message || error).slice(0, 300),
        }));
      }
    }

    throw imageError(
      `IMAGE_NO_PROVIDER:${normalizedAction}:${attempts.map(item => `${item.provider}:${item.reason}`).join(',')}`,
      503,
    );
  }

  analyze(input, options = {}, context = {}) {
    return this.run('ANALYZE', input, options, context);
  }

  process(input, options = {}, context = {}) {
    return this.run('PROCESS', input, options, context);
  }

  generate(input, options = {}, context = {}) {
    return this.run('GENERATE', input, options, context);
  }
}

export function createImageVisionRuntime(options = {}) {
  return new ImageVisionRuntime(options);
}

export function createImageAdapters(options = {}) {
  const runtime = createImageVisionRuntime(options);
  return Object.freeze({
    analyze: (input, context) => runtime.analyze(input, input?.options || {}, context),
    process: (input, context) => runtime.process(input, input?.options || {}, context),
    generate: (input, context) => runtime.generate(input, input?.options || {}, context),
  });
}
