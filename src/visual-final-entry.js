import app from './preview-auth-entry.js';

const NORMAL_PATHS = new Set(['/', '/mvp']);
const PROFESSOR_PATHS = new Set(['/professor']);
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

// Final asset selection happens once, at the canonical response boundary. This
// is a deterministic URL replacement only: no extra CSS, DOM or runtime layer.
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
    '/assets/backgrounds/mel-bg-crusade-final.jpg',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-aviation-bf109-real.jpg',
    '/assets/backgrounds/mel-bg-aviation.webp',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-amazon-hd.jpg',
    '/assets/backgrounds/mel-bg-diablo-final.jpg',
  ],
  [
    'https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-paladin-hd-scaled.jpg',
    '/assets/backgrounds/mel-bg-paladin.webp',
  ],
  [
    "--mel-bg:radial-gradient(circle at 75% 18%,rgba(29,255,238,.20),transparent 27%),linear-gradient(135deg,#08191d 0%,#03090c 48%,#111821 100%)",
    "--mel-bg:url('https://verite-interdite.fr/wp-content/uploads/2026/09/mel-bg-futuristic-project-816-control-room-hd-scaled.jpg')",
  ],
  ['https://verite-interdite.fr/wp-content/uploads/2026/09/mel-classic-v3.webp?v=20260912-r3', '/assets/avatars/mel-classic.webp'],
  ['https://verite-interdite.fr/wp-content/uploads/2026/09/mel-granada-v3.webp?v=20260912-r3', '/assets/avatars/mel-granada.webp'],
  ['https://verite-interdite.fr/wp-content/uploads/2026/09/mel-religious-v3.webp?v=20260912-r3', '/assets/avatars/mel-religious-andalusian.webp'],
  ['https://verite-interdite.fr/wp-content/uploads/2026/09/mel-crusade-v3.webp?v=20260912-r3', '/assets/avatars/mel-crusade.webp'],
  ['https://verite-interdite.fr/wp-content/uploads/2026/09/mel-aviation-v3.webp?v=20260912-r3', '/assets/avatars/mel-aviation-1940s.webp'],
  ['https://verite-interdite.fr/wp-content/uploads/2026/09/mel-amazon-v3.webp?v=20260912-r3', '/assets/avatars/mel-amazon-griffon.webp'],
  ['https://verite-interdite.fr/wp-content/uploads/2026/09/mel-paladin-v3.webp?v=20260912-r3', '/assets/avatars/mel-paladin-light-full-plate.webp'],
  ['"futuristic":"/meliturgos-avatar-fille.png"', '"futuristic":"/assets/avatars/mel-full.webp"'],
]);

const PROFESSOR_ASSET_REWRITES = Object.freeze([
  ['/meliturgos-avatar-fille.png', '/assets/avatars/mel-full.webp'],
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

function rewriteAssets(html, rewrites) {
  let output = String(html ?? '');
  for (const [from, to] of rewrites) output = output.split(from).join(to);
  return output;
}

export function normalizeCanonicalNormalAssets(html) {
  return rewriteAssets(html, NORMAL_ASSET_REWRITES);
}

export function normalizeProfessorAssets(html) {
  return rewriteAssets(html, PROFESSOR_ASSET_REWRITES);
}

export async function finalizeVisualResponse(response, pathname) {
  if (!(response instanceof Response)) return response;
  const type = response.headers.get('content-type') || '';
  if (!response.ok || !/text\/html/i.test(type)) return response;

  let html = stripLegacyVisualLayers(await response.text());
  if (NORMAL_PATHS.has(pathname)) html = normalizeCanonicalNormalAssets(html);
  else if (PROFESSOR_PATHS.has(pathname)) html = normalizeProfessorAssets(html);

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
