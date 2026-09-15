import { ExchangeMemorySync } from './exchange-sync.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function createEphemeralSink() {
  const store = new Map();
  return {
    size: () => store.size,
    async put(candidate) {
      if (store.has(candidate.id)) return { inserted: false };
      store.set(candidate.id, candidate);
      return { inserted: true };
    },
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'meliturgos-memory-sync-preview',
        branch: env.MEL_DEPLOYED_GIT_BRANCH || 'unknown',
        sha: env.MEL_DEPLOYED_GIT_SHA || 'unknown',
        persistent_writes: false,
        d1_bound: false,
      });
    }

    if (request.method === 'POST' && url.pathname === '/simulate') {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.messages)) {
        return json({ ok: false, code: 'MESSAGES_ARRAY_REQUIRED' }, 400);
      }
      try {
        const sink = createEphemeralSink();
        const service = new ExchangeMemorySync({ candidateSink: sink.put.bind(sink) });
        const first = await service.sync(body.messages);
        const replay = await service.sync(body.messages);
        return json({
          ok: true,
          first,
          replay,
          ephemeral_candidates: sink.size(),
          persistent_writes: false,
        });
      } catch (error) {
        return json({ ok: false, code: error?.code || 'MEMORY_SYNC_FAILED' }, 400);
      }
    }

    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  },
};
