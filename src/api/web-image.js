import { requireAuth } from '../core/security.js';
import { fetchPublicWebImage } from '../media/web-image.js';

export async function handleWebImage(request, env) {
  const auth = requireAuth(request, env);
  if (!auth.ok) return auth.response;
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  try {
    const url = new URL(request.url).searchParams.get('url');
    const image = await fetchPublicWebImage(url, {
      fetchImpl: typeof env?.MEL_WEB_FETCH === 'function' ? env.MEL_WEB_FETCH : fetch,
    });
    return new Response(image.bytes, { headers: {
      'content-type': image.content_type, 'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox",
    } });
  } catch (error) {
    return Response.json({ ok: false, code: /^WEB_IMAGE_[A-Z_]+$/.test(error?.code || '') ? error.code : 'WEB_IMAGE_FAILED' },
      { status: 502, headers: { 'cache-control': 'no-store' } });
  }
}
