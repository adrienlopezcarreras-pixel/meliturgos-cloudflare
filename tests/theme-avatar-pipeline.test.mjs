import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
const mvp = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
const enhancer = await readFile(new URL('../src/pages/theme-avatar-enhancer.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('deployed entrypoint applies the rich theme enhancer to normal MEL surfaces', () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/professor-live-learning-entry\.js"/);
  assert.match(entry, /import \{ enhanceThemeAvatars \} from '\.\/pages\/theme-avatar-enhancer\.js';/);
  assert.match(entry, /url\.pathname === '\/' \|\| url\.pathname === '\/mvp'/);
  const fetchIndex = entry.indexOf('await app.fetch(request, env, ctx)');
  const enhancerIndex = entry.indexOf('await enhanceThemeAvatars(response)');
  const professorIndex = entry.indexOf('return enhanceProfessorLearning(response, url.pathname)');
  assert.ok(fetchIndex >= 0 && enhancerIndex > fetchIndex, 'theme enhancer must run after the release/UI pipeline');
  assert.ok(professorIndex > enhancerIndex, 'theme enhancer must remain in the deployed outer entrypoint');
});

test('MVP markup exposes the hooks required by the theme enhancer', () => {
  assert.match(mvp, /id="avatar" class="avatar"/);
  assert.match(mvp, /data-theme-choice="classic"/);
  assert.match(mvp, /data-theme-choice="amazon"/);
  assert.match(enhancer, /id="mel-theme-avatar-runtime"/);
  assert.match(enhancer, /mel-theme-decor-style/);
  assert.match(enhancer, /html\.includes\('data-theme-choice'\)/);
  assert.match(enhancer, /html\.includes\('id="avatar"'\)/);
});
