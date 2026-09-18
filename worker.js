// Retired root compatibility loader.
//
// There is exactly one MEL runtime implementation: src/index.js.
// Some historical Node tests copy this file to /tmp. A static relative export
// would then resolve /tmp/src/index.js and fail. Resolve lazily instead, with a
// Node-only cwd fallback for that test harness. Cloudflare never needs the
// fallback because wrangler deploys src/visual-final-entry.js directly.
let canonicalAppPromise;

async function canonicalApp() {
  if (!canonicalAppPromise) {
    canonicalAppPromise = import('./src/index.js')
      .then(module => module.default)
      .catch(async firstError => {
        if (typeof process === 'undefined' || typeof process.cwd !== 'function') throw firstError;
        const root = String(process.cwd()).replace(/\\/g, '/').replace(/\/$/, '');
        const module = await import(`file://${root}/src/index.js`);
        return module.default;
      });
  }
  const app = await canonicalAppPromise;
  if (!app || typeof app.fetch !== 'function') {
    const error = new Error('CANONICAL_WORKER_UNAVAILABLE');
    error.code = 'CANONICAL_WORKER_UNAVAILABLE';
    throw error;
  }
  return app;
}

export default {
  async fetch(request, env, ctx) {
    return (await canonicalApp()).fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    const app = await canonicalApp();
    if (typeof app.scheduled !== 'function') return undefined;
    return app.scheduled(controller, env, ctx);
  },
};
