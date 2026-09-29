const PATH = '/inventory';
const SYSTEM_BACKUP_PREFIX = 'backups/system/';
const PAGE_LIMIT = 250;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function equalToken(expected, supplied) {
  const a = new TextEncoder().encode(String(expected || ''));
  const b = new TextEncoder().encode(String(supplied || ''));
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i % Math.max(1, a.length)] || 0) ^ (b[i % Math.max(1, b.length)] || 0);
  }
  return a.length >= 32 && a.length === b.length && diff === 0;
}

export async function listInventoryPage(env, cursor = null) {
  if (!env?.MEDIA_BUCKET?.list) {
    return { ok: false, status: 'R2_BINDING_REQUIRED' };
  }
  const options = { limit: PAGE_LIMIT };
  if (cursor) options.cursor = cursor;
  const page = await env.MEDIA_BUCKET.list(options);
  const objects = (page?.objects || [])
    .filter(object => {
      const key = String(object?.key || '');
      return key && !key.startsWith(SYSTEM_BACKUP_PREFIX);
    })
    .map(object => ({
      key: String(object.key),
      size: Number(object?.size || 0),
      etag: object?.etag || null,
      uploaded: object?.uploaded instanceof Date
        ? object.uploaded.toISOString()
        : (object?.uploaded || null),
    }));

  return {
    ok: true,
    status: 'R2_INVENTORY_PAGE',
    objects,
    truncated: page?.truncated === true,
    cursor: page?.truncated === true ? String(page?.cursor || '') || null : null,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== PATH) return json({ ok: false, status: 'NOT_FOUND' }, 404);
    if (request.method !== 'GET') return json({ ok: false, status: 'METHOD_NOT_ALLOWED' }, 405);

    const expected = String(env?.MEL_PREDEPLOY_BACKUP_REFRESH_TOKEN || '');
    const supplied = String(request.headers.get('x-mel-predeploy-backup-refresh') || '');
    if (!equalToken(expected, supplied)) return json({ ok: false, status: 'AUTH_REQUIRED' }, 401);

    const cursor = String(url.searchParams.get('cursor') || '');
    if (cursor.length > 4096) return json({ ok: false, status: 'CURSOR_INVALID' }, 400);

    try {
      const result = await listInventoryPage(env, cursor || null);
      return json(result, result.ok ? 200 : 503);
    } catch (error) {
      return json({
        ok: false,
        status: 'R2_INVENTORY_FAILED',
        code: String(error?.code || error?.message || error).slice(0, 220),
      }, 503);
    }
  },
};
