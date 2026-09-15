import { DreaminaVolcengineAdapter } from './dreamina-volcengine-adapter.js';

const adapter = new DreaminaVolcengineAdapter({ paidAccessEnabled: false });

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'meliturgos-dreamina-preview',
        branch: env.MEL_DEPLOYED_GIT_BRANCH || 'roadmap/multimodal-dreamina-20260915',
        sha: env.MEL_DEPLOYED_GIT_SHA || null,
        paid_generation_enabled: false,
      });
    }

    if (url.pathname === '/capability') {
      return json({
        capability: adapter.capability(),
        runtime_wired: false,
        paid_generation_enabled: false,
        note: 'Preview validates the collision-safe adapter only. No paid generation endpoint is exposed.',
      });
    }

    if (url.pathname === '/generate') {
      return json({
        ok: false,
        code: 'PREVIEW_GENERATION_DISABLED',
        message: 'Paid generation is intentionally disabled in this isolated preview.',
      }, 403);
    }

    return new Response(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MEL · Dreamina preview</title></head>
<body><main><h1>MEL · Dreamina preview isolée</h1><p>Adaptateur Dreamina/Volcengine déployé sans accès payant.</p><ul><li><a href="/health">/health</a></li><li><a href="/capability">/capability</a></li></ul><p>L'endpoint /generate est volontairement bloqué.</p></main></body></html>`, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  },
};
