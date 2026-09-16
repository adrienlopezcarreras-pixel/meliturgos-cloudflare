import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const outerEntry = await readFile(new URL('../src/preview-auth-entry.js', import.meta.url), 'utf8');
const entry = await readFile(new URL('../src/professor-live-learning-entry.js', import.meta.url), 'utf8');
const mvp = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
const enhancer = await readFile(new URL('../src/pages/theme-avatar-enhancer.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

test('deployed entrypoint keeps preview auth outermost and retains the compatibility theme enhancer', () => {
  assert.match(wrangler, /"main"\s*:\s*"src\/preview-auth-entry\.js"/);
  assert.match(outerEntry, /import app from '\.\/professor-live-learning-entry\.js';/);
  assert.match(outerEntry, /bridgePreviewBasicAuth\(request, env\)/);
  assert.match(entry, /import \{ enhanceThemeAvatars \} from '\.\/pages\/theme-avatar-enhancer\.js';/);
  assert.match(entry, /url\.pathname === '\/' \|\| url\.pathname === '\/mvp'/);
  const fetchIndex = entry.indexOf('await app.fetch(request, env, ctx)');
  const enhancerIndex = entry.indexOf('await enhanceThemeAvatars(response)');
  const professorIndex = entry.indexOf('return enhanceProfessorLearning(response, url.pathname)');
  assert.ok(fetchIndex >= 0 && enhancerIndex > fetchIndex, 'compatibility enhancer must remain after the release/UI pipeline');
  assert.ok(professorIndex > enhancerIndex, 'Professor learning enhancement must remain after the normal compatibility stage');
});

test('normal MEL shell owns themes directly and deliberately bypasses legacy visual hooks', () => {
  assert.match(mvp, /id="melAvatar" class="avatar"/);
  assert.match(mvp, /data-mel-theme-choice="classic"/);
  assert.match(mvp, /data-mel-theme-choice="amazon"/);
  assert.match(mvp, /id="mel-normal-shell-v2-style"/);
  assert.doesNotMatch(mvp, /id="avatar" class="avatar"/);
  assert.doesNotMatch(mvp, /data-theme-choice="classic"/);
  assert.match(enhancer, /id="mel-theme-avatar-runtime"/);
  assert.match(enhancer, /mel-theme-decor-style/);
  assert.match(enhancer, /html\.includes\('data-theme-choice'\)/);
  assert.match(enhancer, /html\.includes\('id="avatar"'\)/);
});
