import app from './preview-auth-entry.js';

const NORMAL_PATHS = new Set(['/', '/mvp']);
const RETIRED_VISUAL_IDS = Object.freeze([
  'mel-owner-visual-fix',
  'mel-new-hd-scenes',
  'mel-normal-release-runtime',
  'mel-normal-page-cleanup',
  'mel-theme-decor-style',
  'mel-theme-avatar-runtime',
  'mel-normal-canonical-visuals',
  'mel-normal-canonical-runtime',
]);

const NORMAL_ASSET_REWRITES = Object.freeze([
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-classic-hd-scaled.jpg',
    'https://verite-interdite.fr/wp-content/uploads/2026/09/13-11-02-olb-by-RalfR-03-scaled.jpg',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-granada-cathedral-real-scaled.jpg',
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-granada-capilla-mayor-real-hd-scaled.jpg',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-guadix-cueva-real-scaled.jpg',
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-guadix-nuestra-senora-gracia-real-hd-scaled.jpg',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-crusader-jerusalem-real.jpg',
    'https://cdn.openart.ai/openart-uploads/production/attachment-transfers/4a1359b18bf4757f4c78914c57bc52cb9ee7418a14c32412f5972fdca1c3e94f.png',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-aviation-bf109-real.jpg',
    'https://cdn.openart.ai/openart-uploads/production/attachment-transfers/81f905b6f73ee8846020caa054c34dc4f451c03b4a8e4f8003788a101244ad1f.png',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-amazon-hd.jpg',
    'https://cdn.openart.ai/openart-uploads/production/attachment-transfers/87c28cce6bdf344ec72b94095566b681664ed0ad93e883a55ae4a0a8e2a7f48e.png',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-paladin-hd-scaled.jpg',
    'https://cdn.openart.ai/openart-uploads/production/attachment-transfers/3b57dcab5cc7b04a7a3d7f3a6de7234912e0168f124eb44dd9c82cd990747e04.png',
  ],
  [
    "--mel-bg:radial-gradient(circle at 75% 18%,rgba(29,255,238,.20),transparent 27%),linear-gradient(135deg,#08191d 0%,#03090c 48%,#111821 100%)",
    "--mel-bg:url('https://cdn.openart.ai/openart-uploads/production/attachment-transfers/8ab7ec595d5bef8a91f322fb6aac807c24d81ff03ae5a12aec13ff4f22af49ab.png')",
  ],
]);

const NORMAL_HTML_REWRITES = Object.freeze([
  [
    '.avatar{width:clamp(150px,13vw,195px);height:clamp(150px,13vw,195px);aspect-ratio:1;border-radius:50%;overflow:hidden;border:4px double var(--ornament);box-shadow:0 0 0 4px color-mix(in srgb,var(--button) 82%,#000),0 12px 34px rgba(0,0,0,.42);cursor:pointer;background:transparent;position:relative}',
    '.avatar{width:clamp(150px,13vw,195px);height:clamp(150px,13vw,195px);aspect-ratio:1;border-radius:50%;overflow:hidden;border:4px double var(--ornament);box-shadow:0 0 0 4px color-mix(in srgb,var(--button) 82%,#000),0 12px 34px rgba(0,0,0,.42);cursor:pointer;background:transparent;position:relative;padding:0;line-height:0;isolation:isolate;touch-action:manipulation}',
  ],
  [
    '.avatar img{width:100%;height:100%;display:block;object-fit:cover;object-position:var(--avatar-pos);transform:none;border-radius:50%;clip-path:circle(50%)}',
    '.avatar img{position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:cover;object-position:50% 50%;transform:none;border:0;border-radius:0;clip-path:none;margin:0;padding:0;pointer-events:none}',
  ],
]);

function stripElementById(html, id) {
  const escaped = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(html)
    .replace(new RegExp(`<style[^>]*\\bid=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/style>`, 'gi'), '')
    .replace(new RegExp(`<script[^>]*\\bid=["']${escaped}["'][^>]*>[\\s\\S]*?<\\/script>`, 'gi'), '');
}

export function stripLegacyVisualLayers(html) {
  let output = String(html ?? '');
  for (const id of RETIRED_VISUAL_IDS) output = stripElementById(output, id);
  return output;
}

export function normalizeCanonicalNormalAssets(html) {
  let output = String(html ?? '');
  for (const [from, to] of NORMAL_ASSET_REWRITES) output = output.split(from).join(to);
  for (const [from, to] of NORMAL_HTML_REWRITES) output = output.split(from).join(to);
  return output;
}

export async function finalizeVisualResponse(response, pathname) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !/text\/html/i.test(type)) return response;

  let html = stripLegacyVisualLayers(await response.text());
  if (NORMAL_PATHS.has(pathname)) html = normalizeCanonicalNormalAssets(html);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const response = await app.fetch(request, env, ctx);
    if (request.method !== 'GET') return response;
    return finalizeVisualResponse(response, new URL(request.url).pathname);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
