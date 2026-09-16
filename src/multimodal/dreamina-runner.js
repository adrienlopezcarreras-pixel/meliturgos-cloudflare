import { DomainError, requireValue } from '../core/contracts.js';
import { QuotaArbitrator } from '../augmentio/quota-arbitrator.js';
import { normalizeGenerationRequest } from './provider-contract.js';

const asFiniteNonNegative = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const messageOf = error => error instanceof Error ? error.message : String(error ?? 'unknown_error');
const capabilityOf = provider => typeof provider?.capability === 'function' ? provider.capability() : provider?.capability;
const providerId = provider => String(capabilityOf(provider)?.id || provider?.id || '').trim();

export function createInMemoryArtifactStore() {
  const artifacts = new Map();
  return Object.freeze({
    async put(id, artifact) {
      artifacts.set(id, Object.freeze({ ...artifact }));
      return artifacts.get(id);
    },
    async get(id) {
      return artifacts.get(id) || null;
    },
    async list() {
      return [...artifacts.values()];
    },
  });
}

export function createDreaminaRunner({
  providers = [],
  authorization,
  artifactStore = createInMemoryArtifactStore(),
  quotaArbitrator = new QuotaArbitrator(),
  now = () => new Date().toISOString(),
} = {}) {
  requireValue(Array.isArray(providers), 'INVALID_MULTIMODAL_PROVIDERS');
  requireValue(authorization && typeof authorization.isAllowed === 'function', 'MULTIMODAL_AUTHORIZATION_REQUIRED');
  requireValue(
    artifactStore && typeof artifactStore.put === 'function' && typeof artifactStore.get === 'function',
    'MULTIMODAL_ARTIFACT_STORE_REQUIRED',
  );
  requireValue(quotaArbitrator && typeof quotaArbitrator.isAvailable === 'function', 'MULTIMODAL_QUOTA_ARBITRATOR_REQUIRED');

  async function generate(input = {}, options = {}) {
    const request = normalizeGenerationRequest(input);
    const maxCostUsd = asFiniteNonNegative(options.maxCostUsd, 0);
    const attempts = [];
    const candidates = providers.filter(provider => {
      const capability = capabilityOf(provider);
      return capability?.enabled === true
        && Array.isArray(capability.kinds)
        && capability.kinds.includes(request.kind);
    });

    for (const provider of candidates) {
      const id = providerId(provider);
      if (!id || typeof provider.generate !== 'function') continue;

      if (!quotaArbitrator.isAvailable(id)) {
        attempts.push(Object.freeze({ provider: id, status: 'skipped', reason: 'quota_cooldown' }));
        continue;
      }

      let allowed = false;
      try {
        allowed = (await authorization.isAllowed({
          provider: id,
          capability: capabilityOf(provider),
          request,
          options,
        })) === true;
      } catch (error) {
        attempts.push(Object.freeze({
          provider: id,
          status: 'skipped',
          reason: 'authorization_error',
          error: messageOf(error),
        }));
        continue;
      }

      if (!allowed) {
        attempts.push(Object.freeze({ provider: id, status: 'skipped', reason: 'not_authorized' }));
        continue;
      }

      const capability = capabilityOf(provider);
      const estimatedCostUsd = typeof provider.estimateCostUsd === 'function'
        ? asFiniteNonNegative(await provider.estimateCostUsd(request), Number.POSITIVE_INFINITY)
        : (capability?.paid === true ? Number.POSITIVE_INFINITY : 0);

      if (estimatedCostUsd > maxCostUsd || (capability?.paid === true && request.approvedPaidCall !== true)) {
        attempts.push(Object.freeze({
          provider: id,
          status: 'skipped',
          reason: 'cost_guard',
          estimatedCostUsd,
          maxCostUsd,
        }));
        continue;
      }

      try {
        const result = await provider.generate({ ...request, approvedPaidCall: request.approvedPaidCall });
        const outputs = Array.isArray(result?.outputs) ? result.outputs : [];
        requireValue(outputs.length > 0, `MULTIMODAL_EMPTY_RESULT:${id}`, 502);

        const artifacts = [];
        for (let index = 0; index < outputs.length; index += 1) {
          const artifactId = `${id}:${request.kind.toLowerCase()}:${Date.now()}:${index}`;
          const artifact = Object.freeze({
            id: artifactId,
            provider: id,
            kind: request.kind,
            createdAt: now(),
            output: Object.freeze({ ...outputs[index] }),
            model: result?.model || null,
          });
          await artifactStore.put(artifactId, artifact);
          artifacts.push(artifact);
        }

        quotaArbitrator.recordSuccess?.(id);
        return Object.freeze({
          provider: id,
          kind: request.kind,
          artifacts: Object.freeze(artifacts),
          attempts: Object.freeze([
            ...attempts,
            Object.freeze({ provider: id, status: 'success' }),
          ]),
        });
      } catch (error) {
        quotaArbitrator.recordFailure?.(id, error);
        attempts.push(Object.freeze({ provider: id, status: 'failed', reason: messageOf(error) }));
      }
    }

    throw new DomainError(
      `MULTIMODAL_NO_PROVIDER:${request.kind}:${attempts.map(item => `${item.provider}:${item.reason}`).join(',')}`,
      503,
    );
  }

  async function recoverArtifact(id) {
    requireValue(typeof id === 'string' && id.length > 0, 'INVALID_ARTIFACT_ID');
    return artifactStore.get(id);
  }

  return Object.freeze({ generate, recoverArtifact });
}
