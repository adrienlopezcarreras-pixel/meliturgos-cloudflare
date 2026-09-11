import base, { withChatAiDefaults } from './index-base.js';
import { serveMelBackground, finalizeMvpInterface } from './pages/mvp-finalizer.js';

export { withChatAiDefaults };

export default {
  async fetch(request, env, ctx) {
    const background = serveMelBackground(new URL(request.url).pathname);
    if (background) return background;
    const response = await base.fetch(request, env, ctx);
    return finalizeMvpInterface(response);
  },

  async scheduled(controller, env, ctx) {
    if (typeof base.scheduled === 'function') return base.scheduled(controller, env, ctx);
  },
};
