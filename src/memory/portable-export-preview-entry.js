import {
  createPortableMemoryExport,
  verifyPortableMemoryExport,
} from './portable-export.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        service: 'meliturgos-memory-export-preview',
        branch: env.MEL_DEPLOYED_GIT_BRANCH || 'unknown',
        sha: env.MEL_DEPLOYED_GIT_SHA || 'unknown',
        persistent_writes: false,
        memory_bound: false,
      });
    }
    if (request.method === 'POST' && url.pathname === '/roundtrip') {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.records)) return json({ ok: false, code: 'RECORDS_ARRAY_REQUIRED' }, 400);
      try {
        const bundle = await createPortableMemoryExport(body.records, { source: 'preview' });
        const verification = await verifyPortableMemoryExport(bundle);
        return json({ ok: verification.ok, manifest: bundle.manifest, verification, persistent_writes: false });
      } catch (error) {
        return json({ ok: false, code: error?.code || 'MEMORY_EXPORT_FAILED' }, 400);
      }
    }
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  },
};
