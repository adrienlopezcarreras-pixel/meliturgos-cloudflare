import base, { withChatAiDefaults } from './index-base.js';
import { maybeHandlePublicTeacherBridge } from './teachers/public-teacher-api.js';
import { runAutonomyRuntimeTick } from './evolution/autonomy-runtime.js';
import { serveMelBackground, finalizeMvpInterface } from './pages/mvp-finalizer.js';

export { withChatAiDefaults };

export default {
  async fetch(request, env, ctx) {
    const background = serveMelBackground(new URL(request.url).pathname);
    if (background) return background;

    // Keep the Teacher Bridge explicit at the canonical entrypoint. The base
    // entrypoint retains the same guard as a compatibility fallback.
    const publicTeacherResponse = await maybeHandlePublicTeacherBridge(request, env);
    if (publicTeacherResponse) return publicTeacherResponse;

    const response = await base.fetch(request, env, ctx);
    return finalizeMvpInterface(response);
  },

  async scheduled(_controller, env, ctx) {
    const work = runAutonomyRuntimeTick(env).catch((error) => {
      console.error('[MEL autonomy] scheduled tick failed:', error?.code || error?.message || error);
      return null;
    });
    if (ctx?.waitUntil) ctx.waitUntil(work);
    else await work;
  },
};
