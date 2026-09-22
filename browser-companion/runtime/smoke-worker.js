import { createGen2Runtime } from '../../src/core/orchestrator/gen2-runtime.js';

function authorized(request, env) {
  const expected = String(env.SMOKE_TOKEN || '');
  const supplied = String(request.headers.get('x-mel-browser-smoke') || '');
  return Boolean(expected && supplied && expected === supplied);
}

async function closeSession(env, sessionId, deviceId) {
  try {
    await env.MEL_BROWSER_COMPANION.fetch(new Request('https://browser-companion.internal/v1/browser/close', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, device_id: deviceId }),
    }));
  } catch {
    // Proof response remains about browser.execute; cleanup is best-effort.
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service_binding: Boolean(env.MEL_BROWSER_COMPANION?.fetch),
      }, { headers: { 'cache-control': 'no-store' } });
    }

    if (request.method !== 'POST' || url.pathname !== '/smoke') {
      return Response.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    if (!authorized(request, env)) {
      return Response.json({ ok: false, code: 'AUTH_REQUIRED' }, { status: 401 });
    }

    const audits = [];
    const runtime = createGen2Runtime({
      env,
      audit: async event => audits.push(event),
    });
    const health = await runtime.bus.refreshHealth('browser.execute');
    const sessionId = `gen2-31-live-${crypto.randomUUID()}`;
    const deviceId = 'cloudflare-browser-run-live-proof';

    try {
      const result = await runtime.bus.execute('browser.execute', {
        session_id: sessionId,
        device: {
          id: deviceId,
          capabilities: ['browser.control'],
        },
        sandbox: {
          allowed_origins: ['https://example.com'],
          max_steps: 4,
        },
        approvals: [],
        steps: [
          {
            id: 'navigate-example',
            action: 'browser.navigate',
            url: 'https://example.com/',
          },
          {
            id: 'read-example',
            action: 'browser.read-text',
            selector: 'body',
          },
        ],
      }, {
        owner: 'gen2-31-live-proof',
        permissions: ['browser.control'],
        requestId: crypto.randomUUID(),
      });

      return Response.json({
        ok: true,
        proof: 'REAL_CLOUDFLARE_BROWSER_RUN',
        capability_health: health.health,
        result,
        audit: audits.map(row => ({
          capability: row.capability || null,
          kind: row.kind || null,
          status: row.status || null,
          reason: row.reason || null,
          step_count: row.step_count ?? null,
          completed_steps: row.completed_steps ?? null,
        })),
      }, {
        headers: {
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    } catch (error) {
      return Response.json({
        ok: false,
        code: error?.code || error?.name || 'GEN2_31_LIVE_SMOKE_FAILED',
        status: error?.status || 500,
      }, {
        status: Number.isInteger(error?.status) ? error.status : 500,
        headers: { 'cache-control': 'no-store' },
      });
    } finally {
      await closeSession(env, sessionId, deviceId);
    }
  },
};
