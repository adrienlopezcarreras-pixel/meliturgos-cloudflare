import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('production entry preserves preview auth, live-learning and verified release UI below the final visual owner', async () => {
  const wrangler = await text('wrangler.jsonc');
  const finalVisual = await text('src/visual-final-entry.js');
  const previewAuth = await text('src/preview-auth-entry.js');
  const live = await text('src/professor-live-learning-entry.js');
  const release = await text('src/ui-release-fix-entry.js');
  assert.match(wrangler, /"main"\s*:\s*"src\/visual-final-entry\.js"/);
  assert.match(finalVisual, /import\s+app\s+from\s+['"]\.\/preview-auth-entry\.js['"]/);
  assert.match(finalVisual, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/);
  assert.match(previewAuth, /import\s+app\s+from\s+['"]\.\/professor-live-learning-entry\.js['"]/);
  assert.match(previewAuth, /async\s+scheduled\s*\([^)]*\)\s*\{[\s\S]*app\.scheduled\(controller,\s*env,\s*ctx\)/);
  assert.match(live, /import\s+app\s+from\s+['"]\.\/ui-release-fix-entry\.js['"]/);
  assert.match(release, /import\s+app\s+from\s+['"]\.\/ui-entry\.js['"]/);
  assert.match(live, /\/api\/learning\/progress/);
});

test('full mode keeps one local MEL portrait without a polling DOM runtime', async () => {
  const source = await text('src/ui-release-fix-entry.js');
  assert.match(source, /FULL_AVATAR_DATA_URL\s*=\s*['"]\/assets\/avatars\/mel-full\.webp['"]/);
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

test('service worker is network-first and never caches API reads', async () => {
  const source = await text('src/pages/service-worker.js');
  assert.match(source, /meliturgos-gen2-v4/);
  assert.match(source, /networkFirst/);
  assert.match(source, /pathname\.startsWith\('\/api\/'\)/);
  assert.match(source, /skipWaiting/);
});
