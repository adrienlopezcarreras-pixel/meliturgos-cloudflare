import worker from './index.js';
import { requireAuth } from './core/security.js';
import { createMemoryExportResponse, runScheduledMemoryBackup } from './persistence/memory-backup.js';

export function createWorkerEntrypoint(
  baseWorker = worker,
  { backupRunner = runScheduledMemoryBackup, exportResponder = createMemoryExportResponse } = {}
) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/api/export') {
        const auth = requireAuth(request, env);
        if (!auth.ok) return auth.response;
        return exportResponder(env);
      }
      return baseWorker.fetch(request, env, ctx);
    },

    async scheduled(controller, env, ctx) {
      const backupWork = Promise.resolve().then(() => backupRunner(env)).catch((error) => {
        console.error('[MEL backup] scheduled backup failed:', error?.code || error?.message || error);
        return null;
      });
      const baseWork = typeof baseWorker.scheduled === 'function'
        ? Promise.resolve().then(() => baseWorker.scheduled(controller, env, ctx))
        : Promise.resolve();

      if (ctx?.waitUntil) ctx.waitUntil(backupWork);
      else await backupWork;
      await baseWork;
    }
  };
}

export default createWorkerEntrypoint();
