import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { onRequestGet as renderFull } from '../src/pages/full-interface-v5.js';
import { onRequestGet as renderNormal } from '../src/pages/mvp-interface-v2.js';

function duplicateIds(html) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}
function count(html, needle) { return html.split(needle).length - 1; }

test('full mode exposes only four distinct primary surfaces', async () => {
  const html = await (await renderFull({})).text();
  assert.deepEqual(duplicateIds(html), []);
  assert.equal(count(html, 'data-view='), 4);
  for (const label of ['Salon','Travail','Roadmap','Système']) assert.match(html, new RegExp(label));
  for (const obsolete of ['Vue d’ensemble','overviewRefresh','roomRefresh','diagRefresh','runAudit','melStatusBtnV5','melMentorBtnV5','melNextBtnV5']) assert.doesNotMatch(html, new RegExp(obsolete));
});

test('normal mode is canonical, compact, and keeps only useful primary interactions', async () => {
  const html = await (await renderNormal({})).text();
  const source = await readFile(new URL('../src/pages/mvp-interface.js', import.meta.url), 'utf8');
  assert.deepEqual(duplicateIds(html), []);
  for (const id of ['avatar','input','send','full','drop','fileInput','audit','auditRefresh','themeButton']) {
    assert.equal(count(html, `id="${id}"`), 1, `${id} must exist exactly once`);
  }
  assert.match(source, /send\.addEventListener\('click'/);
  assert.match(source, /full\.addEventListener\('click'/);
  assert.match(source, /themeButton\.addEventListener\('click'/);
  assert.match(source, /avatar\.addEventListener\('click'/);
  assert.match(source, /input\.addEventListener\('keydown'/);
  assert.match(source, /drop\.addEventListener\('drop'/);
  assert.match(source, /auditRefresh\.addEventListener\('click'/);
  assert.match(source, /\/api\/files\/analyze/);
  assert.doesNotMatch(source, /\/api\/files\/upload/);
  assert.match(html, /Touchez son visage pour parler/);
  assert.match(html, /Mode complet/);
  assert.match(html, /État de MEL/);
});

test('normal mode has no old helper layers or redundant daily controls', async () => {
  const html = await (await renderNormal({})).text();
  const alias = await readFile(new URL('../src/pages/mvp-interface-v2.js', import.meta.url), 'utf8');
  for (const obsolete of ['mel-mvp-behavior-runtime','mel-interface-finalizer-runtime','Lectures du jour','Évangile du jour','Psaume du jour','skillsBtn','skillsPanel','interaction_count']) {
    assert.doesNotMatch(html, new RegExp(obsolete, 'i'));
  }
  assert.doesNotMatch(alias, /behavior-enhancer|interface-finalizer/);
  assert.equal(count(html, 'data-theme-choice='), 7, 'theme choices stay behind one compact settings button');
  assert.match(html, /\/assets\/avatars\/mel-classic\.webp/);
});
