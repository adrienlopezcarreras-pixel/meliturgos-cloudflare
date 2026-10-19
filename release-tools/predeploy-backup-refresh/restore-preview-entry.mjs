// Temporary diagnostic preview: the production binding is SELECT-only here.
import { listD1Tables, listD1Rows } from './worker.js';

export default {
  async fetch(request, env) {
    const expected = String(env.MEL_RESTORE_PREVIEW_TOKEN || '');
    const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer /, '');
    let different = expected.length ^ supplied.length;
    for (let i = 0; i < Math.max(expected.length, supplied.length); i++) {
      different |= (expected.charCodeAt(i) || 0) ^ (supplied.charCodeAt(i) || 0);
    }
    if (expected.length < 32 || different !== 0) return new Response(null, { status: 401 });
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true, production_written: false });
    let result;
    if (url.pathname === '/d1/tables') result = await listD1Tables(env);
    else if (url.pathname === '/d1/rows') result = await listD1Rows(env, {
      table: url.searchParams.get('table'), offset: Number(url.searchParams.get('offset')),
      limit: Number(url.searchParams.get('limit')),
    });
    else return new Response(null, { status: 404 });
    // Preserve the exact serialization used by the release sidecar.
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  },
};
