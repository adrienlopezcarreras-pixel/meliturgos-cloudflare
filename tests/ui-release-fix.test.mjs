import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('production entry preserves preview auth and live learning over the canonical Professor owner', async () => {
  const wrangler = await text('wrangler.jsonc');
  const finalVisual = await text('src/visual-final-entry.js');
  const previewAuth = await text('src/preview-auth-entry.js');
  const live = await text('src/professor-live-learning-entry.js');
  assert.match(wrangler, /"main"\s*:\s*"src\/visual-final-entry\.js"/);
  assert.match(finalVisual, /import\s+app\s+from\s+['"]\.\/preview-auth-entry\.js['"]/);
  assert.match(finalVisual, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/);
  assert.match(previewAuth, /import\s+app\s+from\s+['"]\.\/professor-live-learning-entry\.js['"]/);
  assert.match(previewAuth, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/);
  assert.match(live, /import\s+app\s+from\s+['"]\.\/ui-entry\.js['"]/);
  assert.doesNotMatch(live, /import\s+app\s+from\s+['"]\.\/ui-release-fix-entry\.js['"]/);
  assert.match(live, /\/api\/learning\/progress/);
});

test('full mode owns its local MEL portrait and release presentation directly', async () => {
  const source = await text('src/pages/full-interface-v2.js');
  assert.doesNotMatch(source, /HD_BACKGROUNDS|verite-interdite\.fr\/wp-content\/uploads/);
  assert.match(source, /radial-gradient\(circle at 82% 12%/);
  assert.match(source, /\/assets\/avatars\/mel-full\.webp/);
  assert.match(source, /\.brand img,\.hero img/);
  assert.doesNotMatch(source, /MutationObserver|setInterval\(apply,2500\)|forceAvatar|melLiveNarrative/);
  assert.doesNotMatch(source, /verite-interdite\.fr\/wp-content\/uploads/);
});

test('generated fallback background inventory remains self-contained and 4K-capable', async () => {
  const source = await text('src/assets/generated/hd-backgrounds.js');
  assert.match(source, /viewBox="0 0 3840 2160"/);
  for (const theme of ['classic','crusade','religious','granada','aviation','paladin','amazon','control']) {
    assert.match(source, new RegExp(`\\b${theme}\\b`));
  }
});

test('service worker caches static resources while never caching API or private HTML reads', async () => {
  const source = await text('src/pages/service-worker.js');
  assert.match(source, /meliturgos-static-v7/);
  assert.match(source, /staleWhileRevalidate/);
  assert.match(source, /event\.waitUntil\(update/);
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /request\.mode==='navigate'.*return/);
  assert.match(source, /pathname\.startsWith\('\/assets\/'\)/);
  assert.match(source, /skipWaiting/);
  assert.doesNotMatch(source, /const FALLBACK='\/'|cache\.add\('\/'\)/);
});
