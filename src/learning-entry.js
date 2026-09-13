import app from './index.js';
import { applyLearnedRuntimeProfile, loadLearnedRuntimeProfile } from './learning/runtime-profile.js';

function learnedEnvironment(env) {
  if (!env?.AI || typeof env.AI.run !== 'function') return env;
  const base = env.AI;
  const configured = Number(env.MEL_MAX_OUTPUT_TOKENS);
  const fallbackMaxTokens = Math.max(512, Math.min(8192, Number.isFinite(configured) && configured > 0 ? configured : 4096));

  return {
    ...env,
    AI: {
      ...base,
      async run(model, input = {}, ...rest) {
        let profile = null;
        try {
          profile = await loadLearnedRuntimeProfile(env);
        } catch {
          profile = null;
        }
        const prepared = applyLearnedRuntimeProfile({ model, input, profile, fallbackMaxTokens });
        return base.run.call(base, prepared.model, prepared.payload, ...rest);
      },
    },
  };
}

export function withLearnedRuntime(env) {
  return learnedEnvironment(env);
}

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, learnedEnvironment(env), ctx);
  },

  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, learnedEnvironment(env), ctx);
  },
};
