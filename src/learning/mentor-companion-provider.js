// ChatGPT-GPT6 / MEL-MENTOR-FALLBACK: isolated optional PC provider; revert this PR to remove.
import { ProviderAdapter } from '../augmentio/provider-adapter.js';
import { ZeroEuroGovernor, ZERO_EURO_POLICY } from '../augmentio/zero-euro-governor.js';
import { D1AlternativeRegistryStore } from '../portability/d1-alternative-registry-store.js';
import { eligibleAlternatives } from '../portability/prevalidated-alternative-registry.js';
import { createCompanionLocalAiAdapter } from '../portability/companion-local-ai-adapter.js';
import { createCompanionSovereigntyExecutor } from '../portability/companion-sovereignty-executor.js';
import { chooseReadyCompanionDevice } from '../portability/companion-sovereignty-executor.js';
import { companionFallbackAuthorized } from '../evolution/cloud-bridge-dispatch.js';

/**
 * Optional owner-PC fallback. No public Ollama endpoint, no inferred consent.
 * Prevalidation must be current, and a paired PC must report a fresh engine
 * heartbeat, resource telemetry and owner-approved local compute.
 */
export async function createMentorCompanionFallback(env = {}) {
  // CODEX: no local discovery or inference without explicit fallback opt-in.
  if (!companionFallbackAuthorized(env) || !env?.DB) return null;
  try {
    const registry = await new D1AlternativeRegistryStore(env.DB).load();
    const approved = eligibleAlternatives(registry, 'ai', { maxAddedCostEur: 0 })
      .some(row => row.id === 'companion-local-ai'
        && row.provider === 'local-companion-ai'
        && row.adapter_id === 'companion-local-ai'
        && row.endpoint_class === 'paired-windows-localhost-ai'
        && row.cost_mode === 'ZERO_EURO_VERIFIED');
    if (!approved) return null;

    const now = Date.now();
    const devices = await env.DB.prepare(
      "SELECT * FROM computer_devices WHERE lower(platform)='windows' AND halted=0 AND last_seen_at>=? ORDER BY last_seen_at DESC LIMIT 20"
    ).bind(now - 35000).all();
    const device = chooseReadyCompanionDevice(devices?.results, {
      now, requireReadyLocalAi: true,
    });
    if (!device) return null;

    // The existing executor rechecks consent, telemetry and deadlines at
    // invocation time; a saved candidate is never sufficient permission.
    const execute = createCompanionSovereigntyExecutor(env, {
      deviceId: device.id, timeoutMs: 20000, pollIntervalMs: 300,
    });
    const local = createCompanionLocalAiAdapter({ execute });
    const adapter = new ProviderAdapter({
      id: 'companion-local-ai',
      providerId: 'local-companion-ai',
      modelId: 'auto-local',
      capabilities: ['CODE'],
      priority: -200,
      estimatedCost: 0,
      costProvenance: {
        verified: true,
        addedCost: 0,
        source: 'prevalidated-owner-paired-local-hardware',
        authorization: {
          approved: true, policy: ZERO_EURO_POLICY,
          authority: 'owner-consented-companion-prevalidation',
          adapter_id: 'companion-local-ai',
          provider: 'local-companion-ai',
          model: 'auto-local',
        },
      },
      invoke: args => local.invoke(args),
    });
    return new ZeroEuroGovernor().allows(adapter) ? adapter : null;
  } catch {
    // Missing or stale D1/Companion evidence never permits local inference.
    return null;
  }
}
