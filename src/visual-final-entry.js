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
const NORMAL_ASSET_REWRITES = Object.freeze([]);

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
    // Canonical pages now own their visuals directly. Keep the exported
    // finalizer as a compatibility/audit helper, but do not parse and rebuild
    // every HTML response in the deployed hot path.
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    return app.scheduled(controller, env, ctx);
  },
};
